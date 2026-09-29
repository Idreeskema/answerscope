import { Page, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { ContentAnalyzerService } from './content-analyzer.service';
import { ContentFixture, cleanupContentFixture, createContentFixture } from './test-support';

describe('ContentAnalyzerService (integration)', () => {
  const prisma = new PrismaService();
  const service = new ContentAnalyzerService(prisma);

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  function makePage(fixture: ContentFixture, overrides: Partial<Prisma.PageCreateInput> & { path: string }) {
    const { path, ...rest } = overrides;
    const url = `https://${fixture.domain}${path}`;
    return {
      crawlJob: { connect: { id: fixture.crawlJobId } },
      website: { connect: { id: fixture.websiteId } },
      url,
      normalizedUrl: url,
      statusCode: 200,
      isIndexable: true,
      title: 'A Page Title',
      headings: [{ level: 1, text: 'A Page Title' }],
      contentText: 'Some placeholder body content. '.repeat(60),
      wordCount: 300,
      images: [],
      jsonLd: [],
      ...rest,
    } satisfies Prisma.PageCreateInput;
  }

  describe('happy path + thin content + readability + topics', () => {
    let fixture: ContentFixture;
    let richPage: Page;
    let thinPage: Page;

    beforeAll(async () => {
      fixture = await createContentFixture(prisma);

      richPage = await prisma.page.create({
        data: makePage(fixture, {
          path: '/pricing',
          title: 'Pricing Plans for Small Teams',
          headings: [
            { level: 1, text: 'Pricing Plans for Small Teams' },
            { level: 2, text: 'Monthly Pricing' },
            { level: 2, text: 'Annual Pricing' },
          ],
          contentText:
            'Our pricing plans are designed for small teams. The starter plan costs ten dollars per month. ' +
            'The pro plan costs thirty dollars per month and includes more features. ' +
            'Small teams love our simple pricing. Choose the plan that fits your small team today. ' +
            'Pricing is transparent with no hidden fees for any of our plans.'.repeat(3),
          wordCount: 420,
        }),
      });

      thinPage = await prisma.page.create({
        data: makePage(fixture, {
          path: '/thin',
          title: 'Thin Page',
          contentText: 'Just a little bit of text here.',
          wordCount: 40,
        }),
      });

      await service.analyze(fixture.auditId, fixture.crawlJobId);
    });

    afterAll(async () => {
      await cleanupContentFixture(prisma, fixture);
    });

    it('writes a ContentAnalysis row per page', async () => {
      const rows = await prisma.contentAnalysis.findMany({ where: { auditId: fixture.auditId } });
      expect(rows).toHaveLength(2);
    });

    it('computes paragraphCount, avgSentenceLength, and a readability score for substantive content', async () => {
      const row = await prisma.contentAnalysis.findUniqueOrThrow({ where: { pageId: richPage.id } });
      expect(row.paragraphCount).toBeGreaterThan(0);
      expect(row.avgSentenceLength).toBeGreaterThan(0);
      expect(row.readabilityScore).not.toBeNull();
      expect(row.readabilityScore as number).toBeGreaterThanOrEqual(0);
      expect(row.readabilityScore as number).toBeLessThanOrEqual(100);
    });

    it('extracts topics reflecting the page content', async () => {
      const row = await prisma.contentAnalysis.findUniqueOrThrow({ where: { pageId: richPage.id } });
      const topics = row.topics as string[];
      expect(Array.isArray(topics)).toBe(true);
      expect(topics.some((t) => t.includes('pricing'))).toBe(true);
    });

    it('flags a low-word-count page as thinContent', async () => {
      const row = await prisma.contentAnalysis.findUniqueOrThrow({ where: { pageId: thinPage.id } });
      expect(row.thinContent).toBe(true);
    });

    it('does not flag a substantive page as thinContent', async () => {
      const row = await prisma.contentAnalysis.findUniqueOrThrow({ where: { pageId: richPage.id } });
      expect(row.thinContent).toBe(false);
    });

    it('leaves duplicateOfPageId null when no near-duplicate exists', async () => {
      const row = await prisma.contentAnalysis.findUniqueOrThrow({ where: { pageId: richPage.id } });
      expect(row.duplicateOfPageId).toBeNull();
    });

    it('is idempotent when re-run for the same audit (no duplicate rows, no unique-constraint crash)', async () => {
      await service.analyze(fixture.auditId, fixture.crawlJobId);
      const rows = await prisma.contentAnalysis.findMany({ where: { auditId: fixture.auditId } });
      expect(rows).toHaveLength(2);
    });
  });

  describe('duplicate content detection', () => {
    let fixture: ContentFixture;
    let original: Page;
    let copy: Page;

    beforeAll(async () => {
      fixture = await createContentFixture(prisma);
      const sharedText =
        'This is a detailed article about project management software for small teams and how it helps them collaborate effectively. '.repeat(
          15,
        );

      original = await prisma.page.create({
        data: makePage(fixture, {
          path: '/original',
          contentText: sharedText,
          wordCount: 260,
          discoveredAt: new Date('2026-01-01T00:00:00.000Z'),
        }),
      });
      copy = await prisma.page.create({
        data: makePage(fixture, {
          path: '/copy',
          contentText: sharedText,
          wordCount: 260,
          discoveredAt: new Date('2026-01-01T00:00:01.000Z'),
        }),
      });

      await service.analyze(fixture.auditId, fixture.crawlJobId);
    });

    afterAll(async () => {
      await cleanupContentFixture(prisma, fixture);
    });

    it('points the later near-duplicate page at the earlier original', async () => {
      const originalRow = await prisma.contentAnalysis.findUniqueOrThrow({ where: { pageId: original.id } });
      const copyRow = await prisma.contentAnalysis.findUniqueOrThrow({ where: { pageId: copy.id } });
      expect(originalRow.duplicateOfPageId).toBeNull();
      expect(copyRow.duplicateOfPageId).toBe(original.id);
    });
  });
});
