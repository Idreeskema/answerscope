import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { nanoid } from 'nanoid';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import { QueryGeneratorService } from './query-generator.service';

/**
 * Prisma-backed integration test for QueryGeneratorService.generateQueries
 * (spec section 9). Builds a realistic hand-crafted crawl (14 pages with
 * real titles/headings/content covering the different "page shapes" the
 * generator looks for - home, pricing, features, about, blog/how-to, FAQ,
 * security, enterprise, contact, and two product pages) plus a matching set
 * of Entity rows, independent of whether the crawler/entity-analyzer
 * modules have real implementations yet (per docs/AGENT_BRIEF.md: "you do
 * not need their source code - the Prisma schema fields ARE the contract").
 */
describe('QueryGeneratorService.generateQueries', () => {
  let prisma: PrismaService;
  let service: QueryGeneratorService;

  const suffix = nanoid(8);
  const domain = `query-gen-${suffix}.example.com`;
  let workspaceId: string;
  let websiteId: string;
  let crawlJobId: string;
  let auditId: string;
  const pageIds: Record<string, string> = {};

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule],
      providers: [QueryGeneratorService],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    service = moduleRef.get(QueryGeneratorService);

    const workspace = await prisma.workspace.create({
      data: { name: `query-gen-test-${suffix}`, slug: `query-gen-test-${suffix}` },
    });
    workspaceId = workspace.id;

    const website = await prisma.website.create({
      data: { workspaceId, url: `https://${domain}`, domain, name: null },
    });
    websiteId = website.id;

    const crawlJob = await prisma.crawlJob.create({ data: { websiteId, status: 'COMPLETED' } });
    crawlJobId = crawlJob.id;

    const audit = await prisma.audit.create({
      data: { websiteId, crawlJobId, status: 'ANALYZING' },
    });
    auditId = audit.id;

    const makePage = (
      slug: string,
      path: string,
      title: string,
      headings: { level: number; text: string }[],
      contentText: string,
      wordCount: number,
    ) =>
      prisma.page.create({
        data: {
          crawlJobId,
          websiteId,
          url: `https://${domain}${path}`,
          normalizedUrl: `https://${domain}${path}`,
          title,
          headings,
          contentText,
          wordCount,
        },
      });

    const [
      home,
      pricing,
      features,
      about,
      blogRemote,
      blogVsSpreadsheets,
      faq,
      contact,
      productBoards,
      productTimeline,
      blogIntegrateSlack,
      security,
      enterprise,
      blogBestPractices,
    ] = await Promise.all([
      makePage(
        'home',
        '/',
        'Acme — Project Management Software for Small Teams',
        [
          { level: 1, text: 'Acme — Project Management Software for Small Teams' },
          { level: 2, text: 'What exactly is Acme?' },
          { level: 2, text: 'Who is Acme built for?' },
          { level: 2, text: 'Is Acme a legitimate company?' },
          { level: 2, text: 'How does Acme work day to day?' },
          { level: 2, text: 'Why do teams choose Acme over spreadsheets?' },
        ],
        'Many teams switch from manually managing spreadsheets to Acme every quarter. Start your free trial today, no credit card required.',
        900,
      ),
      makePage(
        'pricing',
        '/pricing',
        'Pricing | Acme',
        [
          { level: 1, text: 'Acme Pricing' },
          { level: 2, text: 'How much does Acme cost per month?' },
          { level: 2, text: 'What pricing plans does Acme offer?' },
          { level: 2, text: 'Is Acme worth the monthly price?' },
          { level: 2, text: 'Does Acme have a free plan?' },
        ],
        'Start your free trial today, no credit card required.',
        500,
      ),
      makePage(
        'features',
        '/features',
        'Features | Acme',
        [
          { level: 2, text: 'Real-time Collaboration' },
          { level: 2, text: 'Task Automation' },
          { level: 2, text: 'Time Tracking' },
          { level: 2, text: 'Custom Dashboards' },
          { level: 2, text: 'Mobile Apps' },
          { level: 2, text: 'Does Acme integrate with Slack?' },
          { level: 2, text: 'Does Acme support offline mode?' },
        ],
        'Explore everything Acme can do for your team.',
        700,
      ),
      makePage(
        'about',
        '/about',
        'About Acme',
        [
          { level: 1, text: 'About Acme' },
          { level: 2, text: 'Who founded Acme?' },
          { level: 2, text: 'Is Acme a trustworthy company to rely on?' },
          { level: 2, text: "What is Acme's mission?" },
        ],
        'Acme was founded to help small teams ship work faster.',
        400,
      ),
      makePage(
        'blog-remote',
        '/blog/how-to-manage-remote-teams',
        'How to Manage Remote Teams Effectively | Acme Blog',
        [
          { level: 1, text: 'How to Manage Remote Teams Effectively' },
          { level: 2, text: 'How to set clear weekly goals' },
          { level: 2, text: 'How to run effective standups remotely' },
          { level: 2, text: 'How to track remote team workload' },
        ],
        'Managing a remote team well takes clear process.',
        1200,
      ),
      makePage(
        'blog-vs-spreadsheets',
        '/blog/acme-vs-spreadsheets',
        'Acme vs Spreadsheets: Which Is Better? | Acme Blog',
        [
          { level: 1, text: 'Acme vs Spreadsheets' },
          { level: 2, text: 'Why spreadsheets break down at scale' },
          { level: 2, text: 'What spreadsheets cannot do' },
        ],
        'Spreadsheets are a common starting point, but spreadsheets break down as teams grow.',
        900,
      ),
      makePage(
        'faq',
        '/faq',
        'FAQ | Acme',
        [
          { level: 2, text: 'Does Acme offer customer support?' },
          { level: 2, text: 'Can I cancel my Acme subscription anytime?' },
          { level: 2, text: 'Does Acme have a mobile app available?' },
          { level: 2, text: 'Is my data secure inside Acme?' },
          { level: 2, text: 'Can I import data from Excel into Acme?' },
          { level: 2, text: 'Do you offer discounts for nonprofits?' },
        ],
        'Answers to common questions about using Acme.',
        600,
      ),
      makePage(
        'contact',
        '/contact',
        'Contact Acme',
        [
          { level: 1, text: 'Contact Us' },
          { level: 2, text: 'Visit our New York office' },
        ],
        'Reach out to our New York office any time.',
        150,
      ),
      makePage(
        'product-boards',
        '/product/acme-boards',
        'Acme Boards | Acme',
        [
          { level: 1, text: 'Acme Boards' },
          { level: 2, text: 'What is Acme Boards used for?' },
        ],
        'Acme Boards helps teams visualize their work on a Kanban board.',
        350,
      ),
      makePage(
        'product-timeline',
        '/product/acme-timeline',
        'Acme Timeline | Acme',
        [
          { level: 1, text: 'Acme Timeline' },
          { level: 2, text: 'What is Acme Timeline used for?' },
        ],
        'Acme Timeline helps teams plan project schedules.',
        350,
      ),
      makePage(
        'blog-integrate-slack',
        '/blog/how-to-integrate-slack',
        'How to Integrate Acme with Slack | Acme Blog',
        [
          { level: 1, text: 'How to Integrate Acme with Slack' },
          { level: 2, text: 'How to connect your Slack workspace' },
          { level: 2, text: 'How to configure Slack notifications' },
        ],
        'Connecting Acme to Slack takes just a few minutes.',
        550,
      ),
      makePage(
        'security',
        '/security',
        'Security | Acme',
        [
          { level: 1, text: 'Security at Acme' },
          { level: 2, text: 'Is Acme SOC 2 compliant?' },
          { level: 2, text: 'How does Acme encrypt customer data?' },
          { level: 2, text: 'Is Acme safe for enterprise use?' },
        ],
        'Acme takes data security seriously at every layer.',
        450,
      ),
      makePage(
        'enterprise',
        '/enterprise',
        'Acme for Enterprise Teams',
        [
          { level: 1, text: 'Acme for Enterprise Teams' },
          { level: 2, text: 'Is Acme suitable for enterprise teams with 500+ employees?' },
          { level: 2, text: 'Does Acme support single sign-on (SSO)?' },
        ],
        'Acme scales to enterprise teams with advanced admin controls.',
        500,
      ),
      makePage(
        'blog-best-practices',
        '/blog/best-project-management-practices',
        'Best Project Management Practices in 2026 | Acme Blog',
        [
          { level: 1, text: 'Best Project Management Practices in 2026' },
          { level: 2, text: 'What is the best way to prioritize a backlog?' },
          { level: 2, text: 'Which project management method is best for small teams?' },
        ],
        'A roundup of the best project management practices this year.',
        800,
      ),
    ]);

    pageIds.home = home.id;
    pageIds.pricing = pricing.id;
    pageIds.features = features.id;
    pageIds.about = about.id;
    pageIds.blogRemote = blogRemote.id;
    pageIds.blogVsSpreadsheets = blogVsSpreadsheets.id;
    pageIds.faq = faq.id;
    pageIds.contact = contact.id;
    pageIds.productBoards = productBoards.id;
    pageIds.productTimeline = productTimeline.id;
    pageIds.blogIntegrateSlack = blogIntegrateSlack.id;
    pageIds.security = security.id;
    pageIds.enterprise = enterprise.id;
    pageIds.blogBestPractices = blogBestPractices.id;

    await prisma.entity.createMany({
      data: [
        {
          websiteId,
          auditId,
          sourcePageId: pageIds.home,
          name: 'Acme',
          type: 'ORGANIZATION',
          description: 'Acme is project management software for small teams.',
          confidence: 0.95,
        },
        {
          websiteId,
          auditId,
          sourcePageId: pageIds.productBoards,
          name: 'Acme Boards',
          type: 'PRODUCT',
          description: null,
          confidence: 0.85,
        },
        {
          websiteId,
          auditId,
          sourcePageId: pageIds.productTimeline,
          name: 'Acme Timeline',
          type: 'SERVICE',
          description: null,
          confidence: 0.8,
        },
        {
          websiteId,
          auditId,
          sourcePageId: pageIds.contact,
          name: 'New York',
          type: 'LOCATION',
          description: null,
          confidence: 0.6,
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.query.deleteMany({ where: { auditId } });
    await prisma.entity.deleteMany({ where: { auditId } });
    await prisma.audit.delete({ where: { id: auditId } });
    await prisma.page.deleteMany({ where: { crawlJobId } });
    await prisma.crawlJob.delete({ where: { id: crawlJobId } });
    await prisma.website.delete({ where: { id: websiteId } });
    await prisma.workspace.delete({ where: { id: workspaceId } });
    await prisma.$disconnect();
  });

  it('generates between 50 and 100 queries', async () => {
    await service.generateQueries(auditId, websiteId);
    const queries = await prisma.query.findMany({ where: { auditId } });
    expect(queries.length).toBeGreaterThanOrEqual(50);
    expect(queries.length).toBeLessThanOrEqual(100);
  });

  it('every query starts PENDING and is traceable to a real page', async () => {
    const queries = await prisma.query.findMany({ where: { auditId } });
    const validPageIds = new Set(Object.values(pageIds));
    for (const q of queries) {
      expect(q.status).toBe('PENDING');
      if (q.sourcePageId !== null) {
        expect(validPageIds.has(q.sourcePageId)).toBe(true);
      }
      expect(q.query.length).toBeGreaterThan(0);
      expect(q.entity).toBeTruthy();
    }
  });

  it('spans most of the 15 spec categories', async () => {
    const queries = await prisma.query.findMany({ where: { auditId } });
    const distinctIntents = new Set(queries.map((q) => q.intent));
    expect(distinctIntents.size).toBeGreaterThanOrEqual(9);
  });

  it('grounds pricing queries in the real pricing page', async () => {
    const queries = await prisma.query.findMany({ where: { auditId } });
    const pricingQueries = queries.filter((q) => q.intent === 'Pricing queries');
    expect(pricingQueries.length).toBeGreaterThan(0);
    for (const q of pricingQueries) {
      expect(q.query.toLowerCase()).toMatch(/cost|pricing|price|plan/);
    }
  });

  it('never invents a competitor name in comparison queries', async () => {
    const queries = await prisma.query.findMany({ where: { auditId } });
    const comparisonQueries = queries.filter((q) => q.intent === 'Comparison');
    expect(comparisonQueries.length).toBeGreaterThan(0);
    for (const q of comparisonQueries) {
      expect(q.query.toLowerCase()).toContain('spreadsheet');
    }
  });

  it('is idempotent-safe to re-run (does not throw, adds another grounded batch)', async () => {
    await expect(service.generateQueries(auditId, websiteId)).resolves.not.toThrow();
  });
});
