import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { nanoid } from 'nanoid';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import { RecommendationEngineService } from './recommendation-engine.service';

/**
 * Prisma-backed integration test for RecommendationEngineService (spec
 * section 12). Hand-builds fixture SEOCheck / AEOAnalysis / GEOAnalysis /
 * SchemaAnalysis rows directly (per docs/AGENT_BRIEF.md: "For your own
 * tests, hand-build your own fixture rows ... don't wait for the other
 * agents") and asserts every created Recommendation traces back to one of
 * those real findings.
 */
describe('RecommendationEngineService.generateRecommendations', () => {
  let prisma: PrismaService;
  let service: RecommendationEngineService;

  const suffix = nanoid(8);
  const domain = `rec-engine-${suffix}.example.com`;
  let workspaceId: string;
  let websiteId: string;
  let crawlJobId: string;
  let auditId: string;
  let homePageId: string;
  let pricingPageId: string;
  let productPageId: string;
  const altTextPageIds: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule],
      providers: [RecommendationEngineService],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    service = moduleRef.get(RecommendationEngineService);

    const workspace = await prisma.workspace.create({
      data: { name: `rec-engine-test-${suffix}`, slug: `rec-engine-test-${suffix}` },
    });
    workspaceId = workspace.id;

    const website = await prisma.website.create({
      data: { workspaceId, url: `https://${domain}`, domain },
    });
    websiteId = website.id;

    const crawlJob = await prisma.crawlJob.create({ data: { websiteId, status: 'COMPLETED' } });
    crawlJobId = crawlJob.id;

    const audit = await prisma.audit.create({ data: { websiteId, crawlJobId, status: 'ANALYZING' } });
    auditId = audit.id;

    const homePage = await prisma.page.create({
      data: { crawlJobId, websiteId, url: `https://${domain}/`, normalizedUrl: `https://${domain}/`, title: 'Home' },
    });
    homePageId = homePage.id;

    const pricingPage = await prisma.page.create({
      data: {
        crawlJobId,
        websiteId,
        url: `https://${domain}/pricing`,
        normalizedUrl: `https://${domain}/pricing`,
        title: 'Pricing',
      },
    });
    pricingPageId = pricingPage.id;

    const productPage = await prisma.page.create({
      data: {
        crawlJobId,
        websiteId,
        url: `https://${domain}/product`,
        normalizedUrl: `https://${domain}/product`,
        title: 'Product',
      },
    });
    productPageId = productPage.id;

    for (let i = 0; i < 4; i++) {
      const p = await prisma.page.create({
        data: {
          crawlJobId,
          websiteId,
          url: `https://${domain}/gallery-${i}`,
          normalizedUrl: `https://${domain}/gallery-${i}`,
          title: `Gallery ${i}`,
        },
      });
      altTextPageIds.push(p.id);
    }

    // A checkId affecting only 1 page -> should stay a single, specific
    // recommendation.
    await prisma.sEOCheck.create({
      data: {
        auditId,
        pageId: homePageId,
        checkId: 'missing-meta-description',
        category: 'METADATA',
        status: 'FAIL',
        severity: 'MEDIUM',
        score: 0,
        evidence: `Fixture ${suffix}: this page has no meta description.`,
        recommendation: 'Add a meta description of roughly 70-160 characters summarizing the page.',
      },
    });

    // A checkId affecting 4 pages -> should be aggregated into ONE rollup
    // recommendation (per docs/AGENT_BRIEF.md dedupe guidance).
    await prisma.sEOCheck.createMany({
      data: altTextPageIds.map((pageId, i) => ({
        auditId,
        pageId,
        checkId: 'missing-alt-text',
        category: 'CONTENT_STRUCTURE',
        status: 'FAIL' as const,
        severity: 'LOW' as const,
        score: 40,
        evidence: `Fixture ${suffix}: image gallery-${i}.jpg is missing alt text.`,
        recommendation: 'Add descriptive alt text to every content image.',
      })),
    });

    // A PASS check should never generate a recommendation.
    await prisma.sEOCheck.create({
      data: {
        auditId,
        pageId: homePageId,
        checkId: 'https-check',
        category: 'TECHNICAL',
        status: 'PASS',
        severity: 'LOW',
        score: 100,
        evidence: `Fixture ${suffix}: page is served over HTTPS.`,
        recommendation: 'No action needed.',
      },
    });

    await prisma.aEOAnalysis.create({
      data: {
        auditId,
        pageId: pricingPageId,
        questionCoverageScore: 40,
        answerDirectnessScore: 30,
        contentStructureScore: 50,
        faqCoverageScore: 20,
        entityClarityScore: 60,
        structuredDataScore: 50,
        overallScore: 40,
        details: {
          questions: [
            {
              question: `How much does Fixture-${suffix} cost?`,
              status: 'NOT_ANSWERED',
              evidence: `Fixture ${suffix}: no direct pricing answer found near the top of the page.`,
              recommendation: 'Add a direct pricing answer near the top of the page.',
            },
            {
              question: 'Is this page fast?',
              status: 'DIRECTLY_ANSWERED',
            },
          ],
        },
      },
    });

    await prisma.gEOAnalysis.create({
      data: {
        auditId,
        entityClarityScore: 50,
        topicalCoverageScore: 40,
        contentQualityScore: 60,
        machineReadabilityScore: 55,
        citationReadinessScore: 30,
        overallScore: 47,
        details: {
          gaps: [
            {
              category: 'Citation Readiness',
              description: `Fixture ${suffix}: no external statistics or citable data points were found on any analyzed page.`,
              evidence: `Fixture ${suffix}: 0 of 3 analyzed pages contain a cited statistic or dated reference.`,
              severity: 'MEDIUM',
            },
          ],
        },
      },
    });

    await prisma.schemaAnalysis.create({
      data: {
        auditId,
        pageId: productPageId,
        schemaType: 'Product',
        isValid: false,
        errors: [`Fixture ${suffix}: missing required "offers" property.`],
        rawJsonLd: { '@type': 'Product', name: `Fixture Product ${suffix}` },
      },
    });
  });

  afterAll(async () => {
    await prisma.recommendation.deleteMany({ where: { auditId } });
    await prisma.schemaAnalysis.deleteMany({ where: { auditId } });
    await prisma.gEOAnalysis.deleteMany({ where: { auditId } });
    await prisma.aEOAnalysis.deleteMany({ where: { auditId } });
    await prisma.sEOCheck.deleteMany({ where: { auditId } });
    await prisma.audit.delete({ where: { id: auditId } });
    await prisma.page.deleteMany({ where: { crawlJobId } });
    await prisma.crawlJob.delete({ where: { id: crawlJobId } });
    await prisma.website.delete({ where: { id: websiteId } });
    await prisma.workspace.delete({ where: { id: workspaceId } });
    await prisma.$disconnect();
  });

  it('creates exactly one recommendation for the single-page SEOCheck finding', async () => {
    await service.generateRecommendations(auditId);
    const recs = await prisma.recommendation.findMany({ where: { auditId } });
    const metaDescRecs = recs.filter((r) => r.evidence.includes('has no meta description'));
    expect(metaDescRecs).toHaveLength(1);
    expect(metaDescRecs[0].affectedUrl).toBe(`https://${domain}/`);
    expect(metaDescRecs[0].severity).toBe('MEDIUM');
  });

  it('rolls up the 4-page missing-alt-text finding into one aggregated recommendation', async () => {
    const recs = await prisma.recommendation.findMany({ where: { auditId } });
    const rollups = recs.filter((r) => r.evidence.includes('missing alt text'));
    expect(rollups).toHaveLength(1);
    expect(rollups[0].affectedUrl).toBeNull();
    expect(rollups[0].evidence).toContain('4 distinct pages');
  });

  it('never creates a recommendation for a PASS-ing check', async () => {
    const recs = await prisma.recommendation.findMany({ where: { auditId } });
    expect(recs.some((r) => r.evidence.includes('served over HTTPS'))).toBe(false);
  });

  it('creates an ANSWER_SECTION recommendation from the NOT_ANSWERED AEO question', async () => {
    const recs = await prisma.recommendation.findMany({ where: { auditId } });
    const aeoRec = recs.find((r) => r.evidence.includes(`Fixture ${suffix}: no direct pricing answer`));
    expect(aeoRec).toBeDefined();
    expect(aeoRec?.implementationType).toBe('ANSWER_SECTION');
    expect(aeoRec?.affectedUrl).toBe(`https://${domain}/pricing`);
    expect(aeoRec?.title).toContain(`Fixture-${suffix}`);
  });

  it('creates a recommendation from the named GEO gap', async () => {
    const recs = await prisma.recommendation.findMany({ where: { auditId } });
    const geoRec = recs.find((r) => r.category === 'Citation Readiness');
    expect(geoRec).toBeDefined();
    expect(geoRec?.evidence).toContain('cited statistic');
  });

  it('creates a JSON_LD recommendation from the invalid Product schema', async () => {
    const recs = await prisma.recommendation.findMany({ where: { auditId } });
    const schemaRec = recs.find((r) => r.evidence.includes('missing required "offers" property'));
    expect(schemaRec).toBeDefined();
    expect(schemaRec?.implementationType).toBe('JSON_LD');
    expect(schemaRec?.affectedUrl).toBe(`https://${domain}/product`);
  });

  it('flags the missing Organization schema sitewide', async () => {
    const recs = await prisma.recommendation.findMany({ where: { auditId } });
    const orgRec = recs.find((r) => r.title === 'Add Organization structured data');
    expect(orgRec).toBeDefined();
    expect(orgRec?.affectedUrl).toBe(`https://${domain}/`);
    expect(orgRec?.severity).toBe('HIGH');
  });

  it('computes priority = impact * confidence / effort exactly for every recommendation', async () => {
    const recs = await prisma.recommendation.findMany({ where: { auditId } });
    expect(recs.length).toBeGreaterThan(0);
    for (const r of recs) {
      const expected = Math.round(((r.impact * r.confidence) / r.effort) * 10000) / 10000;
      expect(r.priority).toBeCloseTo(expected, 6);
    }
  });
});
