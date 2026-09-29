import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { nanoid } from 'nanoid';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import { FixGeneratorService } from './fix-generator.service';

/**
 * Prisma-backed integration test for FixGeneratorService.generateFix (spec
 * section 13). Builds a real Website/Page/Entity/AEOAnalysis/Recommendation
 * fixture per docs/AGENT_BRIEF.md guidance and asserts the generated
 * GeneratedFix.after content actually references that fixture's real data
 * (never a placeholder), and that status is always GENERATED, never
 * APPLIED.
 */
describe('FixGeneratorService.generateFix', () => {
  let prisma: PrismaService;
  let service: FixGeneratorService;

  const suffix = nanoid(8);
  const domain = `fix-gen-${suffix}.example.com`;
  let workspaceId: string;
  let websiteId: string;
  let crawlJobId: string;
  let auditId: string;
  let pricingPageId: string;
  let productPageId: string;
  const recommendationIds: string[] = [];
  const fixIds: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule],
      providers: [FixGeneratorService],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    service = moduleRef.get(FixGeneratorService);

    const workspace = await prisma.workspace.create({
      data: { name: `fix-gen-test-${suffix}`, slug: `fix-gen-test-${suffix}` },
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

    const pricingPage = await prisma.page.create({
      data: {
        crawlJobId,
        websiteId,
        url: `https://${domain}/pricing`,
        normalizedUrl: `https://${domain}/pricing`,
        title: `Pricing | Fixture-${suffix}`,
        headings: [{ level: 1, text: `Fixture-${suffix} Pricing` }],
        contentText: `Fixture-${suffix} costs $19 per user per month on the Team plan, billed annually.`,
        wordCount: 240,
      },
    });
    pricingPageId = pricingPage.id;

    const productPage = await prisma.page.create({
      data: {
        crawlJobId,
        websiteId,
        url: `https://${domain}/product`,
        normalizedUrl: `https://${domain}/product`,
        title: `Product | Fixture-${suffix}`,
        wordCount: 150,
      },
    });
    productPageId = productPage.id;

    await prisma.entity.create({
      data: {
        websiteId,
        auditId,
        sourcePageId: pricingPageId,
        name: `Fixture-${suffix}`,
        type: 'ORGANIZATION',
        description: `Fixture-${suffix} is project management software for small teams.`,
        confidence: 0.9,
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
              evidence: 'No direct pricing answer found.',
            },
          ],
        },
      },
    });

    const metaTitleRec = await prisma.recommendation.create({
      data: {
        auditId,
        title: 'Rewrite an unclear meta title',
        category: 'METADATA',
        severity: 'MEDIUM',
        impact: 6,
        effort: 2,
        confidence: 0.9,
        priority: (6 * 0.9) / 2,
        evidence: `Fixture ${suffix}: title "Pricing | Fixture-${suffix}" is generic.`,
        explanation: 'A more descriptive title improves click-through and topical clarity.',
        action: 'Rewrite the title to include the primary topic and brand.',
        affectedUrl: pricingPage.url,
        implementationType: 'META_TITLE',
      },
    });
    recommendationIds.push(metaTitleRec.id);

    const jsonLdRec = await prisma.recommendation.create({
      data: {
        auditId,
        title: 'Add Organization structured data',
        category: 'Structured Data',
        severity: 'HIGH',
        impact: 7,
        effort: 4,
        confidence: 0.85,
        priority: (7 * 0.85) / 4,
        evidence: `Fixture ${suffix}: no Organization schema was detected.`,
        explanation: 'Improves machine-readable entity understanding.',
        action: 'Provide valid JSON-LD.',
        affectedUrl: `https://${domain}/`,
        implementationType: 'JSON_LD',
      },
    });
    recommendationIds.push(jsonLdRec.id);

    const faqRec = await prisma.recommendation.create({
      data: {
        auditId,
        title: `Directly answer "How much does Fixture-${suffix} cost?" on this page`,
        category: 'AEO',
        severity: 'HIGH',
        impact: 8,
        effort: 4,
        confidence: 0.75,
        priority: (8 * 0.75) / 4,
        evidence: 'No direct pricing answer found.',
        explanation: 'AI answer engines need a direct answer near the top of the page.',
        action: 'Add a concise answer.',
        affectedUrl: pricingPage.url,
        implementationType: 'FAQ',
      },
    });
    recommendationIds.push(faqRec.id);

    const otherRec = await prisma.recommendation.create({
      data: {
        auditId,
        title: 'Investigate an unusual finding',
        category: 'MISC',
        severity: 'LOW',
        impact: 3,
        effort: 4,
        confidence: 0.6,
        priority: (3 * 0.6) / 4,
        evidence: `Fixture ${suffix}: unusual finding evidence.`,
        explanation: 'No specialized template exists for this yet.',
        action: 'Manually review this finding and take the appropriate action.',
        affectedUrl: null,
        implementationType: 'OTHER',
      },
    });
    recommendationIds.push(otherRec.id);
    void productPageId;
  });

  afterAll(async () => {
    await prisma.generatedFix.deleteMany({ where: { recommendationId: { in: recommendationIds } } });
    await prisma.recommendation.deleteMany({ where: { auditId } });
    await prisma.aEOAnalysis.deleteMany({ where: { auditId } });
    await prisma.entity.deleteMany({ where: { auditId } });
    await prisma.audit.delete({ where: { id: auditId } });
    await prisma.page.deleteMany({ where: { crawlJobId } });
    await prisma.crawlJob.delete({ where: { id: crawlJobId } });
    await prisma.website.delete({ where: { id: websiteId } });
    await prisma.workspace.delete({ where: { id: workspaceId } });
    await prisma.$disconnect();
  });

  it('META_TITLE: rewrites the real page title grounded in the real H1/entity', async () => {
    const fix = await service.generateFix(recommendationIds[0]);
    fixIds.push(fix.id);
    expect(fix.status).toBe('GENERATED');
    expect(fix.before).toBe(`Pricing | Fixture-${suffix}`);
    expect(fix.after).toContain(`Fixture-${suffix}`);
    expect(fix.after.length).toBeLessThanOrEqual(60);
  });

  it('JSON_LD: emits a valid schema.org block with the real entity name and website URL', async () => {
    const fix = await service.generateFix(recommendationIds[1]);
    fixIds.push(fix.id);
    expect(fix.status).toBe('GENERATED');
    const parsed = JSON.parse(fix.after);
    expect(parsed['@context']).toBe('https://schema.org');
    expect(parsed['@type']).toBe('Organization');
    expect(parsed.name).toBe(`Fixture-${suffix}`);
    expect(parsed.url).toBe(`https://${domain}`);
    expect(JSON.stringify(parsed)).not.toContain('Your Company Name');
  });

  it('FAQ: derives the Q/A pair from the real AEOAnalysis NOT_ANSWERED question and page content', async () => {
    const fix = await service.generateFix(recommendationIds[2]);
    fixIds.push(fix.id);
    expect(fix.status).toBe('GENERATED');
    const parsed = JSON.parse(fix.after);
    expect(parsed[0].question).toBe(`How much does Fixture-${suffix} cost?`);
    expect(parsed[0].answer).toContain('$19');
    expect(parsed[0].needsInput).toBe(false);
  });

  it('OTHER: falls back to the recommendation action text, never a placeholder', async () => {
    const fix = await service.generateFix(recommendationIds[3]);
    fixIds.push(fix.id);
    expect(fix.status).toBe('GENERATED');
    expect(fix.after).toBe('Manually review this finding and take the appropriate action.');
  });

  it('never creates a fix with status APPLIED', async () => {
    const fixes = await prisma.generatedFix.findMany({ where: { id: { in: fixIds } } });
    expect(fixes.every((f) => f.status === 'GENERATED')).toBe(true);
  });
});
