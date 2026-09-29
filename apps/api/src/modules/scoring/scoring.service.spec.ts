import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { DEFAULT_SCORE_WEIGHTS, SCORE_CATEGORIES, SCORE_VERSION_V1, ScoringService } from './scoring.service';
import { ScoringFixture, cleanupScoringFixture, createScoringFixture } from './test-support';

/**
 * Integration tests against a real Postgres connection (dev DB already
 * migrated, see docs/AGENT_BRIEF.md). Every fixture row (SEOCheck,
 * ContentAnalysis, Entity, SchemaAnalysis, AEOAnalysis, GEOAnalysis) is
 * hand-built here with known values since the sibling analyzer modules are
 * being built by separate agents in parallel - see docs/AGENT_BRIEF.md's
 * "other agents working in parallel" section.
 */
describe('ScoringService (integration)', () => {
  const prisma = new PrismaService();
  const service = new ScoringService(prisma);

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  function scoreByCategory(rows: { category: string }[] & any[]) {
    const map = new Map<string, any>();
    for (const r of rows) map.set(r.category, r);
    return map;
  }

  describe('a fully-populated audit with known values', () => {
    let fixture: ScoringFixture;
    let pageAId: string;
    let pageBId: string;

    beforeAll(async () => {
      fixture = await createScoringFixture(prisma);

      const pageA = await prisma.page.create({
        data: {
          crawlJob: { connect: { id: fixture.crawlJobId } },
          website: { connect: { id: fixture.websiteId } },
          url: `https://${fixture.domain}/`,
          normalizedUrl: `https://${fixture.domain}/`,
          statusCode: 200,
          title: 'Home',
          wordCount: 100,
        },
      });
      pageAId = pageA.id;

      const pageB = await prisma.page.create({
        data: {
          crawlJob: { connect: { id: fixture.crawlJobId } },
          website: { connect: { id: fixture.websiteId } },
          url: `https://${fixture.domain}/pricing`,
          normalizedUrl: `https://${fixture.domain}/pricing`,
          statusCode: 200,
          title: 'Pricing',
          wordCount: 80,
        },
      });
      pageBId = pageB.id;

      // TECHNICAL_SEO = average of TECHNICAL + METADATA checks = (80+90+70+60)/4 = 75
      await prisma.sEOCheck.createMany({
        data: [
          { auditId: fixture.auditId, pageId: pageAId, checkId: 'https-check', category: 'TECHNICAL', status: 'PASS', severity: 'LOW', score: 80, evidence: 'HTTPS used', recommendation: 'None' },
          { auditId: fixture.auditId, pageId: pageBId, checkId: 'status-code', category: 'TECHNICAL', status: 'PASS', severity: 'LOW', score: 90, evidence: '200 OK', recommendation: 'None' },
          { auditId: fixture.auditId, pageId: pageAId, checkId: 'title-length', category: 'METADATA', status: 'WARNING', severity: 'MEDIUM', score: 70, evidence: 'Title is short', recommendation: 'Lengthen title' },
          { auditId: fixture.auditId, pageId: pageBId, checkId: 'meta-description', category: 'METADATA', status: 'WARNING', severity: 'MEDIUM', score: 60, evidence: 'No meta description', recommendation: 'Add one' },
          // STRUCTURED_DATA SEOCheck component: avg(100,80) = 90
          { auditId: fixture.auditId, pageId: pageAId, checkId: 'schema-organization', category: 'STRUCTURED_DATA', status: 'PASS', severity: 'LOW', score: 100, evidence: 'Organization JSON-LD present', recommendation: 'None' },
          { auditId: fixture.auditId, pageId: pageBId, checkId: 'schema-product', category: 'STRUCTURED_DATA', status: 'WARNING', severity: 'MEDIUM', score: 80, evidence: 'Product JSON-LD missing price', recommendation: 'Add price' },
          // INTERNAL_LINKING: avg(50,70) = 60
          { auditId: fixture.auditId, pageId: pageAId, checkId: 'orphan-page', category: 'INTERNAL_LINKING', status: 'WARNING', severity: 'MEDIUM', score: 50, evidence: 'Few inbound links', recommendation: 'Add internal links' },
          { auditId: fixture.auditId, pageId: pageBId, checkId: 'link-depth', category: 'INTERNAL_LINKING', status: 'PASS', severity: 'LOW', score: 70, evidence: '3 clicks from home', recommendation: 'None' },
          // CONTENT_STRUCTURE (feeds CONTENT_QUALITY): avg(90,70) = 80
          { auditId: fixture.auditId, pageId: pageAId, checkId: 'h1-present', category: 'CONTENT_STRUCTURE', status: 'PASS', severity: 'LOW', score: 90, evidence: 'Single H1', recommendation: 'None' },
          { auditId: fixture.auditId, pageId: pageBId, checkId: 'heading-hierarchy', category: 'CONTENT_STRUCTURE', status: 'WARNING', severity: 'MEDIUM', score: 70, evidence: 'Skips H2', recommendation: 'Fix hierarchy' },
        ],
      });

      // SSTRUCTURED_DATA blend: SchemaAnalysis valid ratio = 2/3 = 66.667%
      await prisma.schemaAnalysis.createMany({
        data: [
          { pageId: pageAId, auditId: fixture.auditId, schemaType: 'Organization', isValid: true },
          { pageId: pageBId, auditId: fixture.auditId, schemaType: 'Product', isValid: true },
          { pageId: pageBId, auditId: fixture.auditId, schemaType: 'FAQPage', isValid: false },
        ],
      });

      // CONTENT_QUALITY ContentAnalysis component: thinRatio = 1/3, avgReadability = (80+60+70)/3
      await prisma.contentAnalysis.createMany({
        data: [
          { pageId: pageAId, auditId: fixture.auditId, thinContent: false, readabilityScore: 80 },
          { pageId: pageBId, auditId: fixture.auditId, thinContent: false, readabilityScore: 60 },
        ],
      });
      // A third page purely for the thin-content ratio (readability still counted).
      const pageC = await prisma.page.create({
        data: {
          crawlJob: { connect: { id: fixture.crawlJobId } },
          website: { connect: { id: fixture.websiteId } },
          url: `https://${fixture.domain}/thin`,
          normalizedUrl: `https://${fixture.domain}/thin`,
          statusCode: 200,
          title: 'Thin Page',
          wordCount: 20,
        },
      });
      await prisma.contentAnalysis.create({
        data: { pageId: pageC.id, auditId: fixture.auditId, thinContent: true, readabilityScore: 70 },
      });

      // AEO: average(60, 80) = 70
      await prisma.aEOAnalysis.createMany({
        data: [
          {
            auditId: fixture.auditId,
            pageId: pageAId,
            questionCoverageScore: 60,
            answerDirectnessScore: 50,
            contentStructureScore: 60,
            faqCoverageScore: 40,
            entityClarityScore: 60,
            structuredDataScore: 60,
            overallScore: 60,
            details: { questions: [] },
          },
          {
            auditId: fixture.auditId,
            pageId: pageBId,
            questionCoverageScore: 80,
            answerDirectnessScore: 80,
            contentStructureScore: 80,
            faqCoverageScore: 80,
            entityClarityScore: 80,
            structuredDataScore: 80,
            overallScore: 80,
            details: { questions: [] },
          },
        ],
      });

      // ENTITY_SEMANTIC_CLARITY: 3 entities, confidences 0.9/0.7/0.5 -> avg 0.7
      await prisma.entity.createMany({
        data: [
          { websiteId: fixture.websiteId, auditId: fixture.auditId, name: 'Acme', type: 'ORGANIZATION', confidence: 0.9 },
          { websiteId: fixture.websiteId, auditId: fixture.auditId, name: 'Acme Boards', type: 'PRODUCT', confidence: 0.7 },
          { websiteId: fixture.websiteId, auditId: fixture.auditId, name: 'Jane Doe', type: 'PERSON', confidence: 0.5 },
        ],
      });

      // GEOAnalysis: entityClarityScore=65 (blends into ENTITY_SEMANTIC_CLARITY),
      // citationReadinessScore=55 (-> CITATION_EVIDENCE_READINESS directly)
      await prisma.gEOAnalysis.create({
        data: {
          auditId: fixture.auditId,
          entityClarityScore: 65,
          topicalCoverageScore: 50,
          contentQualityScore: 50,
          machineReadabilityScore: 50,
          citationReadinessScore: 55,
          overallScore: 54,
          details: { summary: 'AI Search Readiness: 54/100', factors: [] },
        },
      });

      // The fixture is now fully assembled - compute once here so every `it`
      // below is a pure, order-independent assertion against already-persisted rows.
      await service.computeScores(fixture.auditId);
    });

    afterAll(async () => {
      await cleanupScoringFixture(prisma, fixture);
    });

    it('writes all 7 category Score rows plus one OVERALL row', async () => {
      const rows = await prisma.score.findMany({ where: { auditId: fixture.auditId } });
      expect(rows).toHaveLength(SCORE_CATEGORIES.length + 1);
      const categories = new Set(rows.map((r) => r.category));
      for (const c of SCORE_CATEGORIES) expect(categories.has(c)).toBe(true);
      expect(categories.has('OVERALL')).toBe(true);
    });

    it('computes TECHNICAL_SEO as the average of TECHNICAL + METADATA checks', async () => {
      const rows = await prisma.score.findMany({ where: { auditId: fixture.auditId } });
      const map = scoreByCategory(rows);
      const row = map.get('TECHNICAL_SEO');
      expect(row.rawScore).toBeCloseTo(75, 2); // (80+90+70+60)/4
      expect(row.weight).toBeCloseTo(DEFAULT_SCORE_WEIGHTS.TECHNICAL_SEO, 5);
      expect(row.normalizedScore).toBeCloseTo(row.rawScore * row.weight, 2);
      expect(row.calculationVersion).toBe(SCORE_VERSION_V1);
      const breakdown = row.breakdown as { checkCount: number; checks: unknown[] };
      expect(breakdown.checkCount).toBe(4);
      expect(breakdown.checks).toHaveLength(4);
    });

    it('computes INTERNAL_LINKING as the average of INTERNAL_LINKING checks', async () => {
      const rows = await prisma.score.findMany({ where: { auditId: fixture.auditId } });
      const row = scoreByCategory(rows).get('INTERNAL_LINKING');
      expect(row.rawScore).toBeCloseTo(60, 2); // (50+70)/2
    });

    it('computes AEO as the average of AEOAnalysis.overallScore', async () => {
      const rows = await prisma.score.findMany({ where: { auditId: fixture.auditId } });
      const row = scoreByCategory(rows).get('AEO');
      expect(row.rawScore).toBeCloseTo(70, 2); // (60+80)/2
    });

    it('computes STRUCTURED_DATA as a 60/40 blend of SEOCheck avg and SchemaAnalysis valid ratio', async () => {
      const rows = await prisma.score.findMany({ where: { auditId: fixture.auditId } });
      const row = scoreByCategory(rows).get('STRUCTURED_DATA');
      const schemaValidRatioPct = (2 / 3) * 100;
      const expected = 90 * 0.6 + schemaValidRatioPct * 0.4; // SEOCheck avg(100,80)=90
      expect(row.rawScore).toBeCloseTo(expected, 2);
    });

    it('computes CONTENT_QUALITY as a 60/40 blend of ContentAnalysis signals and CONTENT_STRUCTURE checks', async () => {
      const rows = await prisma.score.findMany({ where: { auditId: fixture.auditId } });
      const row = scoreByCategory(rows).get('CONTENT_QUALITY');
      const nonThinRatioPct = (1 - 1 / 3) * 100; // 1 thin out of 3 ContentAnalysis rows
      const avgReadability = (80 + 60 + 70) / 3;
      const contentAnalysisScore = (nonThinRatioPct + avgReadability) / 2;
      const expected = contentAnalysisScore * 0.6 + 80 * 0.4; // CONTENT_STRUCTURE avg(90,70)=80
      expect(row.rawScore).toBeCloseTo(expected, 2);
    });

    it('computes ENTITY_SEMANTIC_CLARITY as a 50/50 blend of Entity rows and GEOAnalysis.entityClarityScore', async () => {
      const rows = await prisma.score.findMany({ where: { auditId: fixture.auditId } });
      const row = scoreByCategory(rows).get('ENTITY_SEMANTIC_CLARITY');
      const avgConfidence = (0.9 + 0.7 + 0.5) / 3;
      const countComponent = Math.min(100, 3 * 15);
      const confidenceComponent = avgConfidence * 100;
      const entityRowScore = (countComponent + confidenceComponent) / 2;
      const expected = entityRowScore * 0.5 + 65 * 0.5; // GEOAnalysis.entityClarityScore=65
      expect(row.rawScore).toBeCloseTo(expected, 2);
    });

    it('computes CITATION_EVIDENCE_READINESS directly from GEOAnalysis.citationReadinessScore', async () => {
      const rows = await prisma.score.findMany({ where: { auditId: fixture.auditId } });
      const row = scoreByCategory(rows).get('CITATION_EVIDENCE_READINESS');
      expect(row.rawScore).toBeCloseTo(55, 2);
    });

    it('sets OVERALL.normalizedScore to the sum of the 7 category normalizedScores, and mirrors it onto Audit', async () => {
      const rows = await prisma.score.findMany({ where: { auditId: fixture.auditId } });
      const map = scoreByCategory(rows);
      const overall = map.get('OVERALL');
      const sum = SCORE_CATEGORIES.reduce((s, c) => s + map.get(c).normalizedScore, 0);
      expect(overall.rawScore).toBeCloseTo(sum, 2);
      expect(overall.normalizedScore).toBeCloseTo(sum, 2);
      expect(overall.weight).toBe(1);

      const audit = await prisma.audit.findUniqueOrThrow({ where: { id: fixture.auditId } });
      expect(audit.overallScore).toBeCloseTo(overall.normalizedScore, 2);
      expect(audit.calculationVersion).toBe(SCORE_VERSION_V1);
    });

    it('is deterministic: recomputing on the same fixture rows produces byte-identical scores', async () => {
      // beforeAll already ran computeScores once against this fixture; this
      // is the "first run" baseline (spec section 21: identical input rows
      // must always produce an identical score).
      const firstAudit = await prisma.audit.findUniqueOrThrow({ where: { id: fixture.auditId } });
      const first = { overallScore: firstAudit.overallScore ?? 0 };
      const firstRows = await prisma.score.findMany({
        where: { auditId: fixture.auditId },
        orderBy: { category: 'asc' },
      });

      const second = await service.computeScores(fixture.auditId);
      const secondRows = await prisma.score.findMany({
        where: { auditId: fixture.auditId },
        orderBy: { category: 'asc' },
      });

      expect(second.overallScore).toBe(first.overallScore);
      expect(secondRows).toHaveLength(firstRows.length);
      for (let i = 0; i < firstRows.length; i++) {
        expect(secondRows[i].category).toBe(firstRows[i].category);
        expect(secondRows[i].rawScore).toBe(firstRows[i].rawScore);
        expect(secondRows[i].weight).toBe(firstRows[i].weight);
        expect(secondRows[i].normalizedScore).toBe(firstRows[i].normalizedScore);
        expect(secondRows[i].breakdown).toEqual(firstRows[i].breakdown);
      }

      const audit = await prisma.audit.findUniqueOrThrow({ where: { id: fixture.auditId } });
      expect(audit.overallScore).toBe(second.overallScore);
    });
  });

  describe('an audit with no upstream analyzer data at all', () => {
    let fixture: ScoringFixture;

    beforeAll(async () => {
      fixture = await createScoringFixture(prisma);
      await service.computeScores(fixture.auditId);
    });

    afterAll(async () => {
      await cleanupScoringFixture(prisma, fixture);
    });

    it('never fabricates a score - every category computes to 0 with an explanatory note', async () => {
      const rows = await prisma.score.findMany({ where: { auditId: fixture.auditId } });
      const map = scoreByCategory(rows);

      for (const category of SCORE_CATEGORIES) {
        const row = map.get(category);
        expect(row.rawScore).toBe(0);
        expect(row.normalizedScore).toBe(0);
      }
      expect(map.get('OVERALL').normalizedScore).toBe(0);

      const audit = await prisma.audit.findUniqueOrThrow({ where: { id: fixture.auditId } });
      expect(audit.overallScore).toBe(0);
    });
  });

  it('ensureScoreVersion upserts an active v1 ScoreVersion with the default weights', async () => {
    await service.ensureScoreVersion();
    const version = await prisma.scoreVersion.findUniqueOrThrow({ where: { version: SCORE_VERSION_V1 } });
    expect(version.isActive).toBe(true);
    expect(version.weights as unknown as Record<string, number>).toEqual(DEFAULT_SCORE_WEIGHTS);
  });
});
