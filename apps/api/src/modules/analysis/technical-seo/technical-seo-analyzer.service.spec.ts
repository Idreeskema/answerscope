import { Page, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { TechnicalSeoAnalyzerService } from './technical-seo-analyzer.service';
import { SeoFixture, cleanupSeoFixture, createSeoFixture } from './test-support';

/**
 * Integration tests against a real Postgres connection (dev DB already
 * migrated, see docs/AGENT_BRIEF.md). Every fixture row is created here by
 * hand (a real crawl job's output, hand-built) since the crawler module is
 * being built by a separate agent in parallel. Only rows created by this
 * suite's own fixture are ever deleted (see test-support.ts).
 */
describe('TechnicalSeoAnalyzerService (integration)', () => {
  const prisma = new PrismaService();
  const service = new TechnicalSeoAnalyzerService(prisma);

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  function makePage(fixture: SeoFixture, overrides: Partial<Prisma.PageCreateInput> & { path: string }) {
    const { path, ...rest } = overrides;
    const url = `https://${fixture.domain}${path}`;
    return {
      crawlJob: { connect: { id: fixture.crawlJobId } },
      website: { connect: { id: fixture.websiteId } },
      url,
      normalizedUrl: url,
      statusCode: 200,
      isIndexable: true,
      title: 'A Reasonably Healthy Title For This Page',
      metaDescription:
        'A meta description that sits comfortably within the seventy to one hundred sixty character healthy range for search snippets.',
      headings: [{ level: 1, text: 'A Reasonably Healthy Title For This Page' }],
      contentText: 'Some placeholder body content. '.repeat(60),
      wordCount: 300,
      ogData: { title: 'OG Title', description: 'OG description' },
      images: [],
      jsonLd: [],
      canonicalUrl: url,
      ...rest,
    } satisfies Prisma.PageCreateInput;
  }

  describe('core edge cases (spec section 21)', () => {
    let fixture: SeoFixture;
    let pages: Record<string, Page>;

    beforeAll(async () => {
      fixture = await createSeoFixture(prisma);

      const homepage = await prisma.page.create({
        data: makePage(fixture, {
          path: '/',
          jsonLd: [
            { '@context': 'https://schema.org', '@type': 'Organization', name: 'Acme', url: `https://${fixture.domain}/` },
            { '@context': 'https://schema.org', '@type': 'WebSite', name: 'Acme', url: `https://${fixture.domain}/` },
          ],
        }),
      });

      const missingTitle = await prisma.page.create({
        data: makePage(fixture, { path: '/missing-title', title: null }),
      });

      const missingH1 = await prisma.page.create({
        data: makePage(fixture, {
          path: '/missing-h1',
          headings: [{ level: 2, text: 'Only a subheading' }],
        }),
      });

      const dupTitleA = await prisma.page.create({
        data: makePage(fixture, { path: '/dup-a', title: 'Best Widgets For Sale Today Right Now' }),
      });
      const dupTitleB = await prisma.page.create({
        data: makePage(fixture, { path: '/dup-b', title: 'Best Widgets For Sale Today Right Now' }),
      });

      const canonicalConflict = await prisma.page.create({
        data: makePage(fixture, {
          path: '/conflict',
          canonicalUrl: 'https://totally-different-domain.com/conflict',
        }),
      });

      const canonicalMissing = await prisma.page.create({
        data: makePage(fixture, { path: '/no-canonical', canonicalUrl: null }),
      });

      const brokenLinksPage = await prisma.page.create({
        data: makePage(fixture, { path: '/has-broken-links' }),
      });

      const orphanPage = await prisma.page.create({
        data: makePage(fixture, { path: '/orphan' }),
      });

      const faqPage = await prisma.page.create({
        data: makePage(fixture, {
          path: '/faq',
          title: 'Frequently Asked Questions',
          headings: [
            { level: 1, text: 'Frequently Asked Questions' },
            { level: 2, text: 'What is your refund policy?' },
            { level: 2, text: 'How do I contact support?' },
            { level: 2, text: 'Do you offer discounts?' },
          ],
        }),
      });

      const articlePage = await prisma.page.create({
        data: makePage(fixture, {
          path: '/blog/how-to-choose-software',
          title: 'How to Choose the Right Software for Your Team',
          jsonLd: [
            {
              '@context': 'https://schema.org',
              '@type': 'Article',
              headline: 'How to Choose the Right Software',
              author: { '@type': 'Person', name: 'Jane Doe' },
            },
          ],
        }),
      });

      // Inbound links so the above pages (except /orphan) aren't flagged orphan.
      const inboundTargets = [
        missingTitle,
        missingH1,
        dupTitleA,
        dupTitleB,
        canonicalConflict,
        canonicalMissing,
        brokenLinksPage,
        faqPage,
        articlePage,
      ];
      await prisma.pageLink.createMany({
        data: inboundTargets.map((target) => ({
          sourcePageId: homepage.id,
          targetUrl: target.url,
          targetPageId: target.id,
          isInternal: true,
          isBroken: false,
          statusCode: 200,
        })),
      });

      // A broken internal link from brokenLinksPage to a URL that was never
      // successfully crawled.
      await prisma.pageLink.create({
        data: {
          sourcePageId: brokenLinksPage.id,
          targetUrl: `https://${fixture.domain}/does-not-exist`,
          targetPageId: null,
          isInternal: true,
          isBroken: true,
          statusCode: 404,
        },
      });
      // And one healthy outbound link from brokenLinksPage.
      await prisma.pageLink.create({
        data: {
          sourcePageId: brokenLinksPage.id,
          targetUrl: homepage.url,
          targetPageId: homepage.id,
          isInternal: true,
          isBroken: false,
          statusCode: 200,
        },
      });

      pages = {
        homepage,
        missingTitle,
        missingH1,
        dupTitleA,
        dupTitleB,
        canonicalConflict,
        canonicalMissing,
        brokenLinksPage,
        orphanPage,
        faqPage,
        articlePage,
      };

      await service.analyze(fixture.auditId, fixture.crawlJobId);
    });

    afterAll(async () => {
      await cleanupSeoFixture(prisma, fixture);
    });

    async function checksFor(pageId: string, checkId: string) {
      return prisma.sEOCheck.findMany({ where: { auditId: fixture.auditId, pageId, checkId } });
    }

    it('flags a page with no title as FAIL with evidence quoting the page', async () => {
      const rows = await checksFor(pages.missingTitle.id, 'missing-title');
      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe('FAIL');
      expect(rows[0].severity).toBe('CRITICAL');
      expect(rows[0].evidence).toMatch(/no <title>/i);
    });

    it('flags duplicate titles across pages, quoting the shared title', async () => {
      const rowsA = await checksFor(pages.dupTitleA.id, 'duplicate-title');
      const rowsB = await checksFor(pages.dupTitleB.id, 'duplicate-title');
      expect(rowsA).toHaveLength(1);
      expect(rowsB).toHaveLength(1);
      expect(rowsA[0].status).toBe('FAIL');
      expect(rowsA[0].evidence).toContain('Best Widgets For Sale Today Right Now');
      expect(rowsA[0].evidence).toContain(pages.dupTitleB.url);
    });

    it('flags a page with no H1 as FAIL', async () => {
      const rows = await checksFor(pages.missingH1.id, 'h1-missing');
      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe('FAIL');
      expect(rows[0].severity).toBe('HIGH');
    });

    it('flags a cross-domain canonical as a FAIL conflict', async () => {
      const rows = await checksFor(pages.canonicalConflict.id, 'canonical-conflict');
      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe('FAIL');
      expect(rows[0].evidence).toContain('totally-different-domain.com');
    });

    it('flags a missing canonical as WARNING', async () => {
      const rows = await checksFor(pages.canonicalMissing.id, 'missing-canonical');
      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe('WARNING');
    });

    it('detects broken internal links with evidence quoting the dead URL', async () => {
      const rows = await checksFor(pages.brokenLinksPage.id, 'broken-link');
      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe('FAIL');
      expect(rows[0].evidence).toContain('does-not-exist');
      expect(rows[0].evidence).toContain('404');
    });

    it('flags a page with zero inbound internal links as an orphan', async () => {
      const rows = await checksFor(pages.orphanPage.id, 'orphan-page');
      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe('FAIL');
      expect(rows[0].severity).toBe('HIGH');
    });

    it('exempts the homepage from the orphan-page check', async () => {
      const rows = await checksFor(pages.homepage.id, 'orphan-page');
      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe('NOT_APPLICABLE');
    });

    it('writes site-wide Organization/WebSite schema PASS checks when JSON-LD is present', async () => {
      const orgRows = await prisma.sEOCheck.findMany({
        where: { auditId: fixture.auditId, pageId: null, checkId: 'schema-organization-missing' },
      });
      expect(orgRows).toHaveLength(1);
      expect(orgRows[0].status).toBe('PASS');
    });

    it('flags a FAQ-like page with no FAQPage schema as WARNING', async () => {
      const rows = await checksFor(pages.faqPage.id, 'schema-faqpage-missing');
      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe('WARNING');
      expect(rows[0].evidence).toMatch(/FAQPage/);
    });

    it('does not flag the FAQ page for Product schema (not applicable)', async () => {
      const rows = await checksFor(pages.faqPage.id, 'schema-product-missing');
      expect(rows).toHaveLength(0);
    });

    it('passes the blog post for Article schema since Article JSON-LD is present', async () => {
      const rows = await checksFor(pages.articlePage.id, 'schema-article-missing');
      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe('PASS');
    });

    it('writes a sitemap-presence PASS check site-wide', async () => {
      const rows = await prisma.sEOCheck.findMany({
        where: { auditId: fixture.auditId, pageId: null, checkId: 'sitemap-presence' },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe('PASS');
    });
  });

  describe('missing sitemap / robots.txt', () => {
    let fixture: SeoFixture;

    beforeAll(async () => {
      fixture = await createSeoFixture(prisma, { robotsTxtContent: null, sitemapUrls: null });
      await prisma.page.create({ data: makePage(fixture, { path: '/' }) });
      await service.analyze(fixture.auditId, fixture.crawlJobId);
    });

    afterAll(async () => {
      await cleanupSeoFixture(prisma, fixture);
    });

    it('fails sitemap-presence when CrawlJob.sitemapUrls is null', async () => {
      const rows = await prisma.sEOCheck.findMany({
        where: { auditId: fixture.auditId, pageId: null, checkId: 'sitemap-presence' },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe('FAIL');
    });

    it('warns robots-txt-presence when CrawlJob.robotsTxtContent is null', async () => {
      const rows = await prisma.sEOCheck.findMany({
        where: { auditId: fixture.auditId, pageId: null, checkId: 'robots-txt-presence' },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe('WARNING');
    });
  });

  describe('duplicate content detection', () => {
    let fixture: SeoFixture;
    let pageA: Page;
    let pageB: Page;

    beforeAll(async () => {
      fixture = await createSeoFixture(prisma);
      const sharedText = 'This is a detailed article about project management software for small teams. '.repeat(20);

      pageA = await prisma.page.create({
        data: makePage(fixture, { path: '/', contentText: sharedText, wordCount: 260 }),
      });
      pageB = await prisma.page.create({
        data: makePage(fixture, { path: '/copy', contentText: sharedText, wordCount: 260 }),
      });
      await prisma.pageLink.create({
        data: { sourcePageId: pageA.id, targetUrl: pageB.url, targetPageId: pageB.id, isInternal: true },
      });

      await service.analyze(fixture.auditId, fixture.crawlJobId);
    });

    afterAll(async () => {
      await cleanupSeoFixture(prisma, fixture);
    });

    it('flags near-identical content on a second page as duplicate-content', async () => {
      const rows = await prisma.sEOCheck.findMany({
        where: { auditId: fixture.auditId, pageId: pageB.id, checkId: 'duplicate-content' },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe('FAIL');
      expect(rows[0].evidence).toMatch(/% similar/);
    });
  });
});
