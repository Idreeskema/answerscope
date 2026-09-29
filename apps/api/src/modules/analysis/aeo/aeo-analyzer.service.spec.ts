import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { AeoAnalyzerService } from './aeo-analyzer.service';
import { AeoFixture, cleanupAeoFixture, createAeoFixture } from './test-support';

/**
 * Integration tests against a real Postgres connection (dev DB already
 * migrated, see docs/AGENT_BRIEF.md). Every fixture row (Page, Entity, ...)
 * is hand-built here since the crawler/entity/schema modules are being built
 * by separate agents in parallel - see docs/AGENT_BRIEF.md's "other agents
 * working in parallel" section.
 */
describe('AeoAnalyzerService (integration)', () => {
  const prisma = new PrismaService();
  const service = new AeoAnalyzerService(prisma);

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  function makePage(fixture: AeoFixture, overrides: Partial<Prisma.PageCreateInput> & { path: string }) {
    const { path, ...rest } = overrides;
    const url = `https://${fixture.domain}${path}`;
    return {
      crawlJob: { connect: { id: fixture.crawlJobId } },
      website: { connect: { id: fixture.websiteId } },
      url,
      normalizedUrl: url,
      statusCode: 200,
      isIndexable: true,
      title: 'A Page',
      headings: [{ level: 1, text: 'A Page' }],
      contentText: 'Some placeholder body content. '.repeat(20),
      wordCount: 100,
      jsonLd: [],
      images: [],
      ...rest,
    } satisfies Prisma.PageCreateInput;
  }

  describe('per-question scoring against real Page.contentText', () => {
    let fixture: AeoFixture;
    let homepageId: string;
    let pricingId: string;

    beforeAll(async () => {
      fixture = await createAeoFixture(prisma);

      const homepage = await prisma.page.create({
        data: makePage(fixture, {
          path: '/',
          title: 'Acme | Project Management Software',
          headings: [
            { level: 1, text: 'Acme Project Management Software' },
            { level: 2, text: 'Frequently Asked Questions' },
          ],
          contentText:
            'Acme is a project management tool that helps small teams collaborate and ship work faster. ' +
            'It offers boards, tasks, and reporting for up to 50 users per workspace.',
          wordCount: 400,
          jsonLd: [{ '@context': 'https://schema.org', '@type': 'Organization', name: 'Acme' }],
        }),
      });
      homepageId = homepage.id;

      await prisma.entity.create({
        data: {
          websiteId: fixture.websiteId,
          auditId: fixture.auditId,
          sourcePageId: homepage.id,
          name: 'Acme',
          type: 'ORGANIZATION',
          description: 'Acme is a project management platform for small teams.',
          confidence: 0.9,
        },
      });

      const pricing = await prisma.page.create({
        data: makePage(fixture, {
          path: '/pricing',
          title: 'Pricing | Acme',
          headings: [{ level: 1, text: 'Pricing' }],
          contentText:
            'Our platform provides flexible options for teams of every size around the world with dedicated support ' +
            'and onboarding. Reach out to our team to learn more about what we offer.',
          wordCount: 150,
        }),
      });
      pricingId = pricing.id;

      await service.analyze(fixture.auditId, fixture.crawlJobId);
    });

    afterAll(async () => {
      await cleanupAeoFixture(prisma, fixture);
    });

    it('writes one AEOAnalysis row per analyzed page', async () => {
      const rows = await prisma.aEOAnalysis.findMany({ where: { auditId: fixture.auditId } });
      expect(rows).toHaveLength(2);
    });

    it('directly-answers "What is Acme?" on the homepage using an early, definitional sentence', async () => {
      const row = await prisma.aEOAnalysis.findUniqueOrThrow({ where: { pageId: homepageId } });
      const details = row.details as { questions: { question: string; status: string; evidence: string }[] };
      const q = details.questions.find((x) => /what is acme\??$/i.test(x.question));
      expect(q).toBeDefined();
      expect(q!.status).toBe('DIRECTLY_ANSWERED');
      expect(q!.evidence).toContain('Acme is a project management tool');
    });

    it('does not answer the pricing question on the pricing page (no cost/price content)', async () => {
      const row = await prisma.aEOAnalysis.findUniqueOrThrow({ where: { pageId: pricingId } });
      const details = row.details as { questions: { question: string; status: string; evidence: string }[] };
      const q = details.questions.find((x) => /how much does acme cost/i.test(x.question));
      expect(q).toBeDefined();
      expect(q!.status).toBe('NOT_ANSWERED');
      expect(q!.evidence).toMatch(/none of the/i);
    });

    it('gives the homepage a non-zero entityClarityScore from its tied Entity row', async () => {
      const row = await prisma.aEOAnalysis.findUniqueOrThrow({ where: { pageId: homepageId } });
      expect(row.entityClarityScore).toBeGreaterThan(0);
    });

    it('gives the pricing page a zero entityClarityScore (no Entity rows tied to it)', async () => {
      const row = await prisma.aEOAnalysis.findUniqueOrThrow({ where: { pageId: pricingId } });
      expect(row.entityClarityScore).toBe(0);
    });

    it('computes overallScore as the documented weighted combination', async () => {
      const row = await prisma.aEOAnalysis.findUniqueOrThrow({ where: { pageId: homepageId } });
      const expected =
        Math.round(
          (row.questionCoverageScore * 0.3 +
            row.answerDirectnessScore * 0.25 +
            row.contentStructureScore * 0.15 +
            row.faqCoverageScore * 0.1 +
            row.entityClarityScore * 0.1 +
            row.structuredDataScore * 0.1) *
            100,
        ) / 100;
      expect(row.overallScore).toBeCloseTo(expected, 5);
    });

    it('gives partial credit for raw JSON-LD structured data presence (no SchemaAnalysis rows yet)', async () => {
      const row = await prisma.aEOAnalysis.findUniqueOrThrow({ where: { pageId: homepageId } });
      expect(row.structuredDataScore).toBe(40);
    });

    it('is idempotent: re-running analyze() upserts the same row instead of duplicating it', async () => {
      await service.analyze(fixture.auditId, fixture.crawlJobId);
      const rows = await prisma.aEOAnalysis.findMany({ where: { auditId: fixture.auditId } });
      expect(rows).toHaveLength(2);
    });
  });

  describe('important-page selection (homepage always included, capped at 18)', () => {
    let fixture: AeoFixture;
    let fillerPages: { id: string; wordCount: number }[];
    let homepageId: string;

    beforeAll(async () => {
      fixture = await createAeoFixture(prisma);

      const homepage = await prisma.page.create({
        data: makePage(fixture, { path: '/', wordCount: 10, contentText: 'Welcome.' }),
      });
      homepageId = homepage.id;

      const created = await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
          prisma.page.create({
            data: makePage(fixture, { path: `/filler-${i}`, wordCount: 1000 - i * 10 }),
          }),
        ),
      );
      fillerPages = created.map((p) => ({ id: p.id, wordCount: p.wordCount }));

      await service.analyze(fixture.auditId, fixture.crawlJobId);
    });

    afterAll(async () => {
      await cleanupAeoFixture(prisma, fixture);
    });

    it('always analyzes the homepage even though it has the lowest word count', async () => {
      const row = await prisma.aEOAnalysis.findUnique({ where: { pageId: homepageId } });
      expect(row).not.toBeNull();
    });

    it('caps the total number of analyzed pages at 18 and keeps only the highest word-count fillers', async () => {
      const rows = await prisma.aEOAnalysis.findMany({ where: { auditId: fixture.auditId } });
      expect(rows).toHaveLength(18);

      const sortedFillers = [...fillerPages].sort((a, b) => b.wordCount - a.wordCount);
      const expectedIncluded = sortedFillers.slice(0, 17).map((p) => p.id);
      const expectedExcluded = sortedFillers.slice(17).map((p) => p.id);

      const includedRows = await prisma.aEOAnalysis.findMany({ where: { pageId: { in: expectedIncluded } } });
      expect(includedRows).toHaveLength(17);

      const excludedRows = await prisma.aEOAnalysis.findMany({ where: { pageId: { in: expectedExcluded } } });
      expect(excludedRows).toHaveLength(0);
    });
  });

  describe('page with no extracted content', () => {
    let fixture: AeoFixture;

    beforeAll(async () => {
      fixture = await createAeoFixture(prisma);
      await prisma.page.create({
        data: makePage(fixture, { path: '/', contentText: null, headings: [], wordCount: 0 }),
      });
      await service.analyze(fixture.auditId, fixture.crawlJobId);
    });

    afterAll(async () => {
      await cleanupAeoFixture(prisma, fixture);
    });

    it('marks every generated question as NOT_ANSWERED rather than fabricating a status', async () => {
      const row = await prisma.aEOAnalysis.findFirstOrThrow({ where: { auditId: fixture.auditId } });
      const details = row.details as { questions: { status: string }[] };
      expect(details.questions.length).toBeGreaterThan(0);
      expect(details.questions.every((q) => q.status === 'NOT_ANSWERED')).toBe(true);
      expect(row.questionCoverageScore).toBe(0);
      expect(row.answerDirectnessScore).toBe(0);
    });
  });
});
