import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { nanoid } from 'nanoid';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditsService } from './audits.service';
import { CrawlerModule } from '../crawler/crawler.module';
import { TechnicalSeoModule } from '../analysis/technical-seo/technical-seo.module';
import { ContentModule } from '../analysis/content/content.module';
import { AeoModule } from '../analysis/aeo/aeo.module';
import { GeoModule } from '../analysis/geo/geo.module';
import { ScoringModule } from '../scoring/scoring.module';
import { QueriesModule } from '../queries/queries.module';
import { RecommendationsModule } from '../recommendations/recommendations.module';

/**
 * Exercises AuditsService.compareAudits (Milestone 11 / spec section 16
 * Historical Tracking) against hand-built fixtures - independent of whether
 * the analyzer modules have real implementations yet, since this only reads
 * Score/SEOCheck/Page rows we create directly.
 */
describe('AuditsService.compareAudits', () => {
  let prisma: PrismaService;
  let auditsService: AuditsService;

  const suffix = nanoid(8);
  let workspaceId: string;
  let websiteId: string;
  let crawlJobFromId: string;
  let crawlJobToId: string;
  let fromAuditId: string;
  let toAuditId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
        CrawlerModule,
        TechnicalSeoModule,
        ContentModule,
        AeoModule,
        GeoModule,
        ScoringModule,
        QueriesModule,
        RecommendationsModule,
      ],
      providers: [AuditsService],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    auditsService = moduleRef.get(AuditsService);

    const workspace = await prisma.workspace.create({
      data: { name: `compare-test-${suffix}`, slug: `compare-test-${suffix}` },
    });
    workspaceId = workspace.id;

    const website = await prisma.website.create({
      data: {
        workspaceId,
        url: `https://compare-test-${suffix}.example.com`,
        domain: `compare-test-${suffix}.example.com`,
      },
    });
    websiteId = website.id;

    const crawlJobFrom = await prisma.crawlJob.create({ data: { websiteId } });
    const crawlJobTo = await prisma.crawlJob.create({ data: { websiteId } });
    crawlJobFromId = crawlJobFrom.id;
    crawlJobToId = crawlJobTo.id;

    const pageA = await prisma.page.create({
      data: {
        crawlJobId: crawlJobFromId,
        websiteId,
        url: 'https://compare-test.example.com/a',
        normalizedUrl: 'https://compare-test.example.com/a',
      },
    });
    const pageB = await prisma.page.create({
      data: {
        crawlJobId: crawlJobFromId,
        websiteId,
        url: 'https://compare-test.example.com/b',
        normalizedUrl: 'https://compare-test.example.com/b',
      },
    });
    // "to" crawl job: page A persists, page B removed, page C is new.
    const pageAAgain = await prisma.page.create({
      data: {
        crawlJobId: crawlJobToId,
        websiteId,
        url: 'https://compare-test.example.com/a',
        normalizedUrl: 'https://compare-test.example.com/a',
      },
    });
    const pageC = await prisma.page.create({
      data: {
        crawlJobId: crawlJobToId,
        websiteId,
        url: 'https://compare-test.example.com/c',
        normalizedUrl: 'https://compare-test.example.com/c',
      },
    });

    const fromAudit = await prisma.audit.create({
      data: {
        websiteId,
        crawlJobId: crawlJobFromId,
        status: 'COMPLETED',
        overallScore: 60,
      },
    });
    const toAudit = await prisma.audit.create({
      data: {
        websiteId,
        crawlJobId: crawlJobToId,
        status: 'COMPLETED',
        overallScore: 75,
      },
    });
    fromAuditId = fromAudit.id;
    toAuditId = toAudit.id;

    await prisma.scoreVersion.upsert({
      where: { version: 'v1' },
      update: {},
      create: { version: 'v1', weights: {}, isActive: true },
    });

    await prisma.score.createMany({
      data: [
        {
          auditId: fromAuditId,
          category: 'TECHNICAL_SEO',
          rawScore: 50,
          weight: 0.2,
          normalizedScore: 10,
          calculationVersion: 'v1',
          breakdown: {},
        },
        {
          auditId: toAuditId,
          category: 'TECHNICAL_SEO',
          rawScore: 80,
          weight: 0.2,
          normalizedScore: 16,
          calculationVersion: 'v1',
          breakdown: {},
        },
      ],
    });

    // "from": pageA has a FAIL that gets resolved; pageB has a FAIL that
    // disappears because the page itself is gone in "to".
    await prisma.sEOCheck.createMany({
      data: [
        {
          auditId: fromAuditId,
          pageId: pageA.id,
          checkId: 'missing-title',
          category: 'METADATA',
          status: 'FAIL',
          severity: 'HIGH',
          score: 0,
          evidence: 'Page A has no <title>',
          recommendation: 'Add a title',
        },
        {
          auditId: fromAuditId,
          pageId: pageB.id,
          checkId: 'missing-h1',
          category: 'CONTENT_STRUCTURE',
          status: 'FAIL',
          severity: 'MEDIUM',
          score: 0,
          evidence: 'Page B has no H1',
          recommendation: 'Add an H1',
        },
      ],
    });

    // "to": pageA's title issue is fixed (PASS now); a brand new FAIL shows
    // up on the new page C.
    await prisma.sEOCheck.createMany({
      data: [
        {
          auditId: toAuditId,
          pageId: pageAAgain.id,
          checkId: 'missing-title',
          category: 'METADATA',
          status: 'PASS',
          severity: 'HIGH',
          score: 100,
          evidence: 'Page A now has a title',
          recommendation: 'None',
        },
        {
          auditId: toAuditId,
          pageId: pageC.id,
          checkId: 'missing-meta-description',
          category: 'METADATA',
          status: 'FAIL',
          severity: 'LOW',
          score: 0,
          evidence: 'Page C has no meta description',
          recommendation: 'Add a meta description',
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.auditChange.deleteMany({ where: { websiteId } });
    await prisma.score.deleteMany({ where: { auditId: { in: [fromAuditId, toAuditId] } } });
    await prisma.sEOCheck.deleteMany({ where: { auditId: { in: [fromAuditId, toAuditId] } } });
    await prisma.audit.deleteMany({ where: { id: { in: [fromAuditId, toAuditId] } } });
    await prisma.page.deleteMany({ where: { crawlJobId: { in: [crawlJobFromId, crawlJobToId] } } });
    await prisma.crawlJob.deleteMany({ where: { id: { in: [crawlJobFromId, crawlJobToId] } } });
    await prisma.website.delete({ where: { id: websiteId } });
    await prisma.workspace.delete({ where: { id: workspaceId } });
    await prisma.$disconnect();
  });

  it('computes score deltas per category', async () => {
    const change = await auditsService.compareAudits(websiteId, fromAuditId, toAuditId);
    const scoreDelta = change.scoreDelta as Record<string, { from: number; to: number; delta: number }>;
    expect(scoreDelta.TECHNICAL_SEO.from).toBe(10);
    expect(scoreDelta.TECHNICAL_SEO.to).toBe(16);
    expect(scoreDelta.TECHNICAL_SEO.delta).toBe(6);
  });

  it('identifies new and resolved issues correctly', async () => {
    const change = await auditsService.compareAudits(websiteId, fromAuditId, toAuditId);
    const newIssues = change.newIssues as { checkId: string }[];
    const resolvedIssues = change.resolvedIssues as { checkId: string }[];

    expect(newIssues.map((i) => i.checkId)).toEqual(['missing-meta-description']);
    expect(resolvedIssues.map((i) => i.checkId).sort()).toEqual(['missing-h1', 'missing-title']);
  });

  it('identifies new and removed pages by normalized URL', async () => {
    const change = await auditsService.compareAudits(websiteId, fromAuditId, toAuditId);
    expect(change.newPages).toEqual(['https://compare-test.example.com/c']);
    expect(change.removedPages).toEqual(['https://compare-test.example.com/b']);
  });

  it('summarizes the overall score improvement', async () => {
    const change = await auditsService.compareAudits(websiteId, fromAuditId, toAuditId);
    expect(change.summary).toContain('improved');
    expect(change.summary).toContain('60');
    expect(change.summary).toContain('75');
  });
});
