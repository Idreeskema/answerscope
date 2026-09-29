import { nanoid } from 'nanoid';
import { PrismaService } from '../../prisma/prisma.service';
import { CrawlerService } from './crawler.service';
import { fetchViaHttp, HttpFetchResult } from './lib/http-client';
import { renderWithPlaywright } from './lib/renderer';

jest.mock('./lib/http-client');
jest.mock('./lib/renderer');

const mockFetchViaHttp = fetchViaHttp as jest.MockedFunction<typeof fetchViaHttp>;
const mockRenderWithPlaywright = renderWithPlaywright as jest.MockedFunction<typeof renderWithPlaywright>;

function textResult(
  url: string,
  statusCode: number,
  body: string,
  overrides: Partial<HttpFetchResult> = {},
): HttpFetchResult {
  return {
    requestedUrl: url,
    finalUrl: url,
    redirectedFrom: null,
    statusCode,
    headers: {},
    body,
    fetchTimeMs: 5,
    ...overrides,
  };
}

function htmlPage(title: string, bodyHtml: string): string {
  return `<html lang="en"><head><title>${title}</title></head><body>${bodyHtml}</body></html>`;
}

/**
 * Integration tests against a real Postgres connection (dev DB already
 * migrated - see docs/AGENT_BRIEF.md). Each test creates its own isolated
 * Workspace -> Website fixture (nanoid-suffixed name/slug) and deletes only
 * that workspace afterwards; every child row (Website/CrawlJob/Page/
 * PageLink/CrawlError) cascades from that single delete.
 *
 * The website's own URL is always the real, publicly-resolvable
 * "https://example.com" (a distinct Workspace per test keeps this from
 * violating the [workspaceId, url] unique constraint) so the SSRF guard's
 * real DNS resolution succeeds without weakening it in any way - only the
 * HTTP client and Playwright renderer are mocked, never the guard itself.
 */
describe('CrawlerService.runCrawlJob (integration, mocked HTTP client)', () => {
  const prisma = new PrismaService();
  const service = new CrawlerService(prisma);
  let workspaceId: string;
  let websiteId: string;

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRenderWithPlaywright.mockResolvedValue(null);

    const suffix = nanoid(8).toLowerCase();
    const workspace = await prisma.workspace.create({
      data: { name: `Crawler Test ${suffix}`, slug: `crawler-test-${suffix}` },
    });
    workspaceId = workspace.id;
    const website = await prisma.website.create({
      data: { workspaceId, url: 'https://example.com', domain: 'example.com', name: 'Crawler Test Site' },
    });
    websiteId = website.id;
  });

  afterEach(async () => {
    await prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => undefined);
  });

  it('crawls the homepage + sitemap seed, follows internal links, records broken links and external links, and completes', async () => {
    mockFetchViaHttp.mockImplementation(async (url: string) => {
      if (url === 'https://example.com/robots.txt') return textResult(url, 404, '');
      if (url === 'https://example.com/sitemap.xml') {
        return textResult(
          url,
          200,
          '<?xml version="1.0"?><urlset><url><loc>https://example.com/from-sitemap</loc></url></urlset>',
        );
      }
      if (url === 'https://example.com' || url === 'https://example.com/') {
        return textResult(
          url,
          200,
          htmlPage(
            'Home',
            `<h1>Welcome</h1>
             <a href="/page-a">Page A</a>
             <a href="/missing">Missing</a>
             <a href="https://external-site.example/">External</a>`,
          ),
        );
      }
      if (url === 'https://example.com/page-a') {
        return textResult(url, 200, htmlPage('Page A', '<h1>Page A</h1><p>Some real content about page a.</p>'));
      }
      if (url === 'https://example.com/missing') {
        return textResult(url, 404, htmlPage('Not Found', '<p>Gone</p>'));
      }
      if (url === 'https://example.com/from-sitemap') {
        return textResult(url, 200, htmlPage('From Sitemap', '<p>Content discovered only via the sitemap.</p>'));
      }
      throw new Error(`Unexpected URL requested in test: ${url}`);
    });

    const job = await service.createCrawlJob(websiteId, {
      maxPages: 10,
      maxDepth: 3,
      concurrency: 2,
      timeoutMs: 5000,
    });
    expect(job.status).toBe('QUEUED');

    await service.runCrawlJob(job.id);

    const finished = await prisma.crawlJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(finished.status).toBe('COMPLETED');
    expect(finished.progress).toBe(100);
    expect(finished.robotsTxtContent).toBeNull();
    expect(finished.sitemapUrls).toEqual(['https://example.com/from-sitemap']);
    expect(finished.pagesCrawled).toBe(4); // home, page-a, missing (404 but still a Page row), from-sitemap

    const pages = await prisma.page.findMany({ where: { crawlJobId: job.id } });
    expect(pages).toHaveLength(4);

    const homepage = pages.find((p) => p.normalizedUrl === 'https://example.com/');
    expect(homepage?.title).toBe('Home');
    expect(homepage?.wordCount).toBeGreaterThan(0);

    const missingPage = pages.find((p) => p.url === 'https://example.com/missing');
    expect(missingPage?.statusCode).toBe(404);

    const errors = await prisma.crawlError.findMany({ where: { crawlJobId: job.id } });
    expect(errors.some((e) => e.url === 'https://example.com/missing' && /404/.test(e.message))).toBe(true);

    const homepageLinks = await prisma.pageLink.findMany({ where: { sourcePageId: homepage!.id } });
    const linkToMissing = homepageLinks.find((l) => l.targetUrl === 'https://example.com/missing');
    expect(linkToMissing?.isInternal).toBe(true);
    expect(linkToMissing?.isBroken).toBe(true);
    expect(linkToMissing?.statusCode).toBe(404);
    expect(linkToMissing?.targetPageId).toBe(missingPage!.id);

    const linkToPageA = homepageLinks.find((l) => l.targetUrl === 'https://example.com/page-a');
    expect(linkToPageA?.isBroken).toBe(false);
    expect(linkToPageA?.targetPageId).toBe(pages.find((p) => p.url === 'https://example.com/page-a')!.id);

    const linkToExternal = homepageLinks.find((l) => l.targetUrl === 'https://external-site.example/');
    expect(linkToExternal?.isInternal).toBe(false);
    expect(linkToExternal?.targetPageId).toBeNull();
  });

  it('respects robots.txt Disallow rules by skipping matching URLs without an error', async () => {
    mockFetchViaHttp.mockImplementation(async (url: string) => {
      if (url === 'https://example.com/robots.txt') {
        return textResult(url, 200, 'User-agent: *\nDisallow: /private\n');
      }
      if (url === 'https://example.com/sitemap.xml') return textResult(url, 404, '');
      if (url === 'https://example.com' || url === 'https://example.com/') {
        return textResult(url, 200, htmlPage('Home', '<a href="/private">Private</a><a href="/public">Public</a>'));
      }
      if (url === 'https://example.com/public') {
        return textResult(url, 200, htmlPage('Public', '<p>Public content.</p>'));
      }
      throw new Error(`robots-disallowed URL should never be fetched: ${url}`);
    });

    const job = await service.createCrawlJob(websiteId, { maxPages: 10, maxDepth: 3, concurrency: 2, timeoutMs: 5000 });
    await service.runCrawlJob(job.id);

    const finished = await prisma.crawlJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(finished.status).toBe('COMPLETED');

    const pages = await prisma.page.findMany({ where: { crawlJobId: job.id } });
    expect(pages.map((p) => p.url).sort()).toEqual(['https://example.com', 'https://example.com/public']);

    const requestedUrls = mockFetchViaHttp.mock.calls.map((call) => call[0]);
    expect(requestedUrls).not.toContain('https://example.com/private');
  });

  it('respects maxDepth: does not crawl pages beyond the configured depth, but still records the link', async () => {
    mockFetchViaHttp.mockImplementation(async (url: string) => {
      if (url === 'https://example.com/robots.txt') return textResult(url, 404, '');
      if (url === 'https://example.com/sitemap.xml') return textResult(url, 404, '');
      if (url === 'https://example.com' || url === 'https://example.com/') {
        return textResult(url, 200, htmlPage('Home', '<a href="/level1">Level 1</a>'));
      }
      if (url === 'https://example.com/level1') {
        return textResult(url, 200, htmlPage('Level 1', '<a href="/level2">Level 2</a>'));
      }
      throw new Error(`Should not be reached beyond maxDepth: ${url}`);
    });

    const job = await service.createCrawlJob(websiteId, { maxPages: 10, maxDepth: 1, concurrency: 2, timeoutMs: 5000 });
    await service.runCrawlJob(job.id);

    const pages = await prisma.page.findMany({ where: { crawlJobId: job.id } });
    expect(pages.map((p) => p.url).sort()).toEqual(['https://example.com', 'https://example.com/level1']);

    const level1 = pages.find((p) => p.url === 'https://example.com/level1')!;
    const level1Links = await prisma.pageLink.findMany({ where: { sourcePageId: level1.id } });
    expect(level1Links).toHaveLength(1);
    expect(level1Links[0].targetUrl).toBe('https://example.com/level2');
    // Discovered but never crawled (beyond maxDepth) - documented limitation.
    expect(level1Links[0].targetPageId).toBeNull();
    expect(level1Links[0].isBroken).toBe(false);
  });

  it('respects maxPages: never crawls more than the configured cap', async () => {
    const links = ['/a', '/b', '/c', '/d', '/e'].map((p) => `<a href="${p}">${p}</a>`).join('');
    mockFetchViaHttp.mockImplementation(async (url: string) => {
      if (url === 'https://example.com/robots.txt') return textResult(url, 404, '');
      if (url === 'https://example.com/sitemap.xml') return textResult(url, 404, '');
      if (url === 'https://example.com' || url === 'https://example.com/') {
        return textResult(url, 200, htmlPage('Home', links));
      }
      return textResult(url, 200, htmlPage('Sub', '<p>content</p>'));
    });

    const job = await service.createCrawlJob(websiteId, { maxPages: 3, maxDepth: 5, concurrency: 2, timeoutMs: 5000 });
    await service.runCrawlJob(job.id);

    const finished = await prisma.crawlJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(finished.status).toBe('COMPLETED');
    expect(finished.progress).toBe(100);

    const pages = await prisma.page.findMany({ where: { crawlJobId: job.id } });
    expect(pages.length).toBeLessThanOrEqual(3);
  });

  it('records a CrawlError (and no Page row) for a link whose fetch throws, without failing the whole job', async () => {
    mockFetchViaHttp.mockImplementation(async (url: string) => {
      if (url === 'https://example.com/robots.txt') return textResult(url, 404, '');
      if (url === 'https://example.com/sitemap.xml') return textResult(url, 404, '');
      if (url === 'https://example.com' || url === 'https://example.com/') {
        return textResult(url, 200, htmlPage('Home', '<a href="/times-out">Times Out</a>'));
      }
      if (url === 'https://example.com/times-out') {
        throw new Error('simulated request timeout');
      }
      throw new Error(`unexpected url ${url}`);
    });

    const job = await service.createCrawlJob(websiteId, { maxPages: 10, maxDepth: 3, concurrency: 2, timeoutMs: 5000 });
    await service.runCrawlJob(job.id);

    const finished = await prisma.crawlJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(finished.status).toBe('COMPLETED');

    const errors = await prisma.crawlError.findMany({ where: { crawlJobId: job.id } });
    expect(errors.some((e) => e.url === 'https://example.com/times-out' && e.message.includes('simulated request timeout'))).toBe(
      true,
    );

    const pages = await prisma.page.findMany({ where: { crawlJobId: job.id } });
    expect(pages.find((p) => p.url === 'https://example.com/times-out')).toBeUndefined();
  });

  it('fails the job immediately (without ever calling the HTTP client) when the website root URL is unsafe', async () => {
    const unsafeWorkspace = await prisma.workspace.create({
      data: { name: `Crawler SSRF Test ${nanoid(8)}`, slug: `crawler-ssrf-test-${nanoid(8).toLowerCase()}` },
    });
    const unsafeWebsite = await prisma.website.create({
      data: {
        workspaceId: unsafeWorkspace.id,
        url: 'http://127.0.0.1:9999/',
        domain: '127.0.0.1',
        name: 'Unsafe Site',
      },
    });

    try {
      const job = await service.createCrawlJob(unsafeWebsite.id, {});
      await service.runCrawlJob(job.id);

      const finished = await prisma.crawlJob.findUniqueOrThrow({ where: { id: job.id } });
      expect(finished.status).toBe('FAILED');
      expect(finished.progress).toBe(100);
      expect(finished.completedAt).not.toBeNull();
      expect(finished.error).toMatch(/blocked/i);
      expect(mockFetchViaHttp).not.toHaveBeenCalled();
    } finally {
      await prisma.workspace.delete({ where: { id: unsafeWorkspace.id } }).catch(() => undefined);
    }
  });

  it('falls back to the plain-HTTP extraction when Playwright rendering is unavailable/fails', async () => {
    mockRenderWithPlaywright.mockResolvedValue(null);
    mockFetchViaHttp.mockImplementation(async (url: string) => {
      if (url === 'https://example.com/robots.txt') return textResult(url, 404, '');
      if (url === 'https://example.com/sitemap.xml') return textResult(url, 404, '');
      if (url === 'https://example.com' || url === 'https://example.com/') {
        // A near-empty JS-shell-looking page (lots of markup, ~0 visible
        // words) - should trigger an (unavailable) render attempt, then
        // fall back to this plain-HTTP extraction.
        const shell =
          '<!DOCTYPE html><html><head><meta charset="utf-8"/><title>App</title>' +
          '<script defer src="/static/js/main.a1b2c3d4.chunk.js"></script>' +
          '<script defer src="/static/js/vendor.e5f6a7b8.chunk.js"></script>' +
          '<link rel="stylesheet" href="/static/css/main.9f8e7d6c.css"></head>' +
          '<body><noscript>You need to enable JavaScript to run this app.</noscript><div id="root"></div></body></html>';
        return textResult(url, 200, shell);
      }
      throw new Error(`unexpected url ${url}`);
    });

    const job = await service.createCrawlJob(websiteId, { maxPages: 5, maxDepth: 2, concurrency: 1, timeoutMs: 5000 });
    await service.runCrawlJob(job.id);

    const finished = await prisma.crawlJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(finished.status).toBe('COMPLETED');
    expect(mockRenderWithPlaywright).toHaveBeenCalled();

    const pages = await prisma.page.findMany({ where: { crawlJobId: job.id } });
    expect(pages).toHaveLength(1);
    expect(pages[0].statusCode).toBe(200);
  });
});
