import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { GeoAnalyzerService } from './geo-analyzer.service';
import { GeoFixture, cleanupGeoFixture, createGeoFixture } from './test-support';

/**
 * Integration tests against a real Postgres connection (dev DB already
 * migrated, see docs/AGENT_BRIEF.md). Every fixture row (Page, Entity,
 * ContentAnalysis, SchemaAnalysis, AEOAnalysis, PageLink) is hand-built here
 * since the sibling analyzer modules are being built by separate agents in
 * parallel - see docs/AGENT_BRIEF.md's "other agents working in parallel"
 * section.
 */
describe('GeoAnalyzerService (integration)', () => {
  const prisma = new PrismaService();
  const service = new GeoAnalyzerService(prisma);

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  function makePage(fixture: GeoFixture, overrides: Partial<Prisma.PageCreateInput> & { path: string }) {
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

  describe('a well-signaled website', () => {
    let fixture: GeoFixture;

    beforeAll(async () => {
      fixture = await createGeoFixture(prisma);

      const homepage = await prisma.page.create({
        data: makePage(fixture, {
          path: '/',
          title: 'Acme | Project Management',
          headings: [{ level: 1, text: 'Acme' }, { level: 2, text: 'Pricing' }, { level: 2, text: 'Integrations' }],
          jsonLd: [{ '@context': 'https://schema.org', '@type': 'Organization', name: 'Acme' }],
        }),
      });

      const about = await prisma.page.create({
        data: makePage(fixture, { path: '/about', title: 'About Acme' }),
      });

      const contact = await prisma.page.create({
        data: makePage(fixture, { path: '/contact', title: 'Contact Us' }),
      });

      const blogPost = await prisma.page.create({
        data: makePage(fixture, {
          path: '/blog/report',
          title: 'Annual Report',
          contentText:
            'Our research found that 42% of small teams improved delivery speed, saving an average of $1200 per month.',
          jsonLd: [
            {
              '@context': 'https://schema.org',
              '@type': 'Article',
              author: { '@type': 'Person', name: 'Jane Doe' },
              datePublished: '2026-01-01',
              dateModified: '2026-02-01',
            },
          ],
        }),
      });

      await prisma.pageLink.createMany({
        data: [
          {
            sourcePageId: blogPost.id,
            targetUrl: 'https://external-authority.example.com/study',
            isInternal: false,
          },
          {
            sourcePageId: homepage.id,
            targetUrl: 'https://another-external-site.example.com/',
            isInternal: false,
          },
        ],
      });

      await prisma.entity.createMany({
        data: [
          {
            websiteId: fixture.websiteId,
            auditId: fixture.auditId,
            sourcePageId: homepage.id,
            name: 'Acme',
            type: 'ORGANIZATION',
            description: 'Acme is a project management platform that helps small teams collaborate.',
            confidence: 0.9,
          },
          {
            websiteId: fixture.websiteId,
            auditId: fixture.auditId,
            sourcePageId: homepage.id,
            name: 'Acme Boards',
            type: 'PRODUCT',
            description: 'A kanban-style board product for tracking team tasks and deadlines.',
            confidence: 0.8,
          },
        ],
      });

      await prisma.contentAnalysis.createMany({
        data: [
          { pageId: homepage.id, auditId: fixture.auditId, topics: ['pricing', 'integrations', 'collaboration'] },
          { pageId: about.id, auditId: fixture.auditId, topics: ['company', 'mission'] },
          { pageId: contact.id, auditId: fixture.auditId, topics: [] },
          { pageId: blogPost.id, auditId: fixture.auditId, topics: ['research', 'productivity'] },
        ],
      });

      await prisma.schemaAnalysis.createMany({
        data: [
          { pageId: homepage.id, auditId: fixture.auditId, schemaType: 'Organization', isValid: true },
          { pageId: blogPost.id, auditId: fixture.auditId, schemaType: 'Article', isValid: true },
        ],
      });

      await prisma.aEOAnalysis.createMany({
        data: [
          {
            auditId: fixture.auditId,
            pageId: homepage.id,
            questionCoverageScore: 70,
            answerDirectnessScore: 60,
            contentStructureScore: 80,
            faqCoverageScore: 40,
            entityClarityScore: 70,
            structuredDataScore: 80,
            overallScore: 68,
            details: { questions: [] },
          },
        ],
      });

      await service.analyze(fixture.auditId);
    });

    afterAll(async () => {
      await cleanupGeoFixture(prisma, fixture);
    });

    it('writes exactly one GEOAnalysis row for the audit', async () => {
      const rows = await prisma.gEOAnalysis.findMany({ where: { auditId: fixture.auditId } });
      expect(rows).toHaveLength(1);
    });

    it('produces non-zero sub-scores for every measurable signal that was actually provided', async () => {
      const row = await prisma.gEOAnalysis.findUniqueOrThrow({ where: { auditId: fixture.auditId } });
      expect(row.entityClarityScore).toBeGreaterThan(0);
      expect(row.topicalCoverageScore).toBeGreaterThan(0);
      expect(row.contentQualityScore).toBeGreaterThan(0);
      expect(row.machineReadabilityScore).toBeGreaterThan(0);
      expect(row.citationReadinessScore).toBeGreaterThan(0);
    });

    it('computes overallScore as the documented weighted combination', async () => {
      const row = await prisma.gEOAnalysis.findUniqueOrThrow({ where: { auditId: fixture.auditId } });
      const expected =
        Math.round(
          (row.entityClarityScore * 0.25 +
            row.topicalCoverageScore * 0.2 +
            row.contentQualityScore * 0.2 +
            row.machineReadabilityScore * 0.2 +
            row.citationReadinessScore * 0.15) *
            100,
        ) / 100;
      expect(row.overallScore).toBeCloseTo(expected, 5);
    });

    it('writes a details JSON with a factor breakdown and no unexplained/predictive claim', async () => {
      const row = await prisma.gEOAnalysis.findUniqueOrThrow({ where: { auditId: fixture.auditId } });
      const details = row.details as {
        summary: string;
        disclaimer: string;
        factors: { name: string; score: number; evidence: string[] }[];
      };
      expect(details.summary).toMatch(/^AI Search Readiness: \d+(\.\d+)?\/100$/);
      expect(details.factors).toHaveLength(5);
      for (const factor of details.factors) {
        expect(factor.evidence.length).toBeGreaterThan(0);
      }
      expect(details.disclaimer).toMatch(/does not predict or guarantee/i);
    });

    it('is idempotent: re-running analyze() upserts the same row instead of duplicating it', async () => {
      await service.analyze(fixture.auditId);
      const rows = await prisma.gEOAnalysis.findMany({ where: { auditId: fixture.auditId } });
      expect(rows).toHaveLength(1);
    });
  });

  describe('a website with no measurable signals at all', () => {
    let fixture: GeoFixture;

    beforeAll(async () => {
      fixture = await createGeoFixture(prisma);
      await prisma.page.create({
        data: makePage(fixture, { path: '/', title: 'Home', headings: [], contentText: 'Nothing notable.', jsonLd: [] }),
      });
      await service.analyze(fixture.auditId);
    });

    afterAll(async () => {
      await cleanupGeoFixture(prisma, fixture);
    });

    it('never fabricates a positive score when there is no supporting evidence', async () => {
      const row = await prisma.gEOAnalysis.findUniqueOrThrow({ where: { auditId: fixture.auditId } });
      expect(row.entityClarityScore).toBe(0);
      expect(row.citationReadinessScore).toBe(0);
      expect(row.overallScore).toBeLessThan(20);
    });
  });
});
