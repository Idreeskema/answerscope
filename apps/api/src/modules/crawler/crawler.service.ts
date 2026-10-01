import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CrawlOptions, DEFAULT_CRAWL_OPTIONS } from './crawler.types';
import { assertUrlIsSafeToFetch } from '../../common/security/ssrf-guard';
import { fetchViaHttp } from './lib/http-client';
import { fetchRobots } from './lib/robots';
import { discoverSitemapUrls } from './lib/sitemap';
import { extractHtml, hasNoIndexDirective, looksLikeJsRenderedShell } from './lib/html-extractor';
import { closePlaywrightBrowser, renderWithPlaywright } from './lib/renderer';
import { QueueItem, runBfsQueue } from './lib/crawl-queue';
import { normalizeUrl } from './lib/url-normalizer';

interface CrawledPageRecord {
  id: string;
  statusCode: number;
}

/**
 * Real Website Crawler implementation (Milestone 2, spec section 5).
 *
 * Pipeline for `runCrawlJob`:
 *  1. Load the job + website; SSRF-check the website's own root URL first -
 *     if that fails, fail the job immediately without crawling anything.
 *  2. Fetch + parse robots.txt (best-effort; never blocks the crawl).
 *  3. Discover sitemap URL(s) (from robots.txt `Sitemap:` lines, falling
 *     back to {origin}/sitemap.xml), recursively resolving sitemap indexes.
 *  4. Breadth-first crawl, seeded with the homepage (depth 0) plus every
 *     sitemap URL (depth 1), bounded by maxPages/maxDepth/concurrency. Each
 *     page is fetched over plain HTTP (manual redirect handling, SSRF-
 *     checked on every hop) and extracted with Cheerio; if that looks like
 *     an empty JS shell, a Playwright re-render is attempted and used
 *     instead when it succeeds (falls back silently otherwise).
 *  5. Persist a Page row per crawled URL and a PageLink row per discovered
 *     link (internal + external); record CrawlError rows for any fetch
 *     failure. Progress/status/pagesDiscovered/pagesCrawled are updated as
 *     the crawl proceeds so the frontend can poll it.
 *  6. Once the queue drains, resolve PageLink.targetPageId/isBroken/
 *     statusCode for every internal link whose target was actually crawled.
 *  7. Mark the job COMPLETED (or FAILED, on any uncaught error).
 */
@Injectable()
export class CrawlerService implements OnModuleDestroy {
  private readonly logger = new Logger(CrawlerService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleDestroy(): Promise<void> {
    await closePlaywrightBrowser();
  }

  async createCrawlJob(websiteId: string, options: Partial<CrawlOptions> = {}) {
    const merged = { ...DEFAULT_CRAWL_OPTIONS, ...options };
    return this.prisma.crawlJob.create({
      data: {
        websiteId,
        status: 'QUEUED',
        maxPages: merged.maxPages,
        maxDepth: merged.maxDepth,
        concurrency: merged.concurrency,
        timeoutMs: merged.timeoutMs,
        userAgent: merged.userAgent,
      },
    });
  }

  async runCrawlJob(crawlJobId: string): Promise<void> {
    const job = await this.prisma.crawlJob.findUnique({
      where: { id: crawlJobId },
      include: { website: true },
    });
    if (!job) {
      this.logger.warn(`CrawlJob ${crawlJobId} not found - nothing to crawl.`);
      return;
    }

    const options: CrawlOptions = {
      maxPages: job.maxPages,
      maxDepth: job.maxDepth,
      concurrency: Math.max(1, job.concurrency),
      timeoutMs: job.timeoutMs,
      userAgent: job.userAgent,
    };

    try {
      await this.prisma.crawlJob.update({
        where: { id: crawlJobId },
        data: { status: 'RUNNING', startedAt: new Date(), progress: 1, statusMessage: 'Validating website URL' },
      });

      // Security gate (spec section 19): never issue a single request for
      // this job if the website's own root URL isn't safe to fetch.
      await assertUrlIsSafeToFetch(job.website.url);

      const websiteHostname = new URL(job.website.url).hostname;
      const originUrl = new URL(job.website.url).origin;

      await this.prisma.crawlJob.update({
        where: { id: crawlJobId },
        data: { statusMessage: 'Fetching robots.txt' },
      });
      const robots = await fetchRobots(job.website.url, options);
      await this.prisma.crawlJob.update({
        where: { id: crawlJobId },
        data: { robotsTxtContent: robots.content, statusMessage: 'Discovering sitemap' },
      });

      const candidateSitemaps = robots.sitemaps.length > 0 ? robots.sitemaps : [`${originUrl}/sitemap.xml`];
      const sitemapUrls = await discoverSitemapUrls(candidateSitemaps, options);
      await this.prisma.crawlJob.update({
        where: { id: crawlJobId },
        data: {
          sitemapUrls,
          statusMessage: `Discovered ${sitemapUrls.length} sitemap URL(s); starting crawl`,
        },
      });

      const pageMap = new Map<string, CrawledPageRecord>();
      const internalLinkRecords: Array<{ id: string; normalizedTargetUrl: string }> = [];
      let pagesDiscovered = 0;
      let pagesCrawled = 0;
      let usedPlaywright = false;

      const seeds: QueueItem<string>[] = [];
      const pushSeed = (url: string, depth: number) => {
        try {
          seeds.push({ key: normalizeUrl(url), depth, payload: url });
        } catch {
          // Malformed seed URL (e.g. a broken sitemap <loc>) - skip it.
        }
      };
      pushSeed(job.website.url, 0);
      for (const url of sitemapUrls) pushSeed(url, 1);

      const flushProgress = async (statusMessage: string) => {
        const progress = Math.min(99, Math.round((pagesCrawled / Math.max(pagesDiscovered, 1)) * 100));
        await this.prisma.crawlJob.update({
          where: { id: crawlJobId },
          data: { pagesDiscovered, pagesCrawled, progress, statusMessage },
        });
      };

      const processUrl = async (item: QueueItem<string>): Promise<QueueItem<string>[]> => {
        pagesDiscovered++;
        const url = item.payload;

        if (!robots.isAllowed(url, options.userAgent)) {
          return [];
        }

        let fetchResult;
        try {
          fetchResult = await fetchViaHttp(url, { timeoutMs: options.timeoutMs, userAgent: options.userAgent });
        } catch (err) {
          await this.prisma.crawlError.create({
            data: { crawlJobId, url, message: err instanceof Error ? err.message : String(err) },
          });
          return [];
        }

        let extraction = extractHtml(fetchResult.body, fetchResult.finalUrl, websiteHostname);

        if (fetchResult.statusCode === 200 && looksLikeJsRenderedShell(extraction, fetchResult.body.length)) {
          const rendered = await renderWithPlaywright(fetchResult.finalUrl, {
            timeoutMs: options.timeoutMs,
            userAgent: options.userAgent,
          }).catch(() => null);
          if (rendered?.html) {
            extraction = extractHtml(rendered.html, fetchResult.finalUrl, websiteHostname);
            usedPlaywright = true;
          }
        }

        const normalizedUrl = normalizeUrl(fetchResult.finalUrl);
        const isIndexable = !hasNoIndexDirective(extraction.robotsMeta, fetchResult.headers['x-robots-tag']);

        let page;
        try {
          page = await this.prisma.page.create({
            data: {
              crawlJobId,
              websiteId: job.websiteId,
              url: fetchResult.finalUrl,
              normalizedUrl,
              canonicalUrl: extraction.canonicalUrl,
              statusCode: fetchResult.statusCode,
              redirectedFrom: fetchResult.redirectedFrom,
              isIndexable,
              robotsMeta: extraction.robotsMeta,
              title: extraction.title,
              metaDescription: extraction.metaDescription,
              headings: extraction.headings as unknown as Prisma.InputJsonValue,
              contentText: extraction.contentText,
              wordCount: extraction.wordCount,
              language: extraction.language,
              ogData: extraction.ogData ?? undefined,
              twitterData: extraction.twitterData ?? undefined,
              jsonLd: extraction.jsonLd as unknown as Prisma.InputJsonValue,
              images: extraction.images as unknown as Prisma.InputJsonValue,
              fetchTimeMs: fetchResult.fetchTimeMs,
              crawledAt: new Date(),
            },
          });
        } catch (err) {
          // Most likely the crawlJobId+normalizedUrl unique constraint - two
          // different raw URLs (e.g. differing only by a tracking param)
          // normalized to something already crawled. Treat as a duplicate,
          // not a failure.
          this.logger.debug(
            `Skipping duplicate/failed Page insert for ${fetchResult.finalUrl}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
          return [];
        }

        pageMap.set(normalizedUrl, { id: page.id, statusCode: fetchResult.statusCode });
        pagesCrawled++;

        if (fetchResult.statusCode >= 400) {
          await this.prisma.crawlError.create({
            data: { crawlJobId, url: fetchResult.finalUrl, message: `HTTP ${fetchResult.statusCode} response` },
          });
        }

        const discovered: QueueItem<string>[] = [];
        for (const link of extraction.links) {
          const created = await this.prisma.pageLink.create({
            data: {
              sourcePageId: page.id,
              targetUrl: link.href,
              anchorText: link.anchorText,
              isInternal: link.isInternal,
            },
          });
          if (link.isInternal) {
            let normalizedTarget: string;
            try {
              normalizedTarget = normalizeUrl(link.href);
            } catch {
              continue;
            }
            internalLinkRecords.push({ id: created.id, normalizedTargetUrl: normalizedTarget });
            discovered.push({ key: normalizedTarget, depth: item.depth + 1, payload: link.href });
          }
        }

        await flushProgress(`Crawled ${pagesCrawled} page(s), most recently ${url}`);
        return discovered;
      };

      await runBfsQueue<string>({
        seeds,
        concurrency: options.concurrency,
        maxItems: options.maxPages,
        maxDepth: options.maxDepth,
        process: processUrl,
      });

      // Second pass: wire up PageLink.targetPageId/isBroken/statusCode for
      // every internal link whose target was actually crawled (spec section
      // 5, item 13: "detect broken internal links"). Links to pages that
      // were never crawled - beyond maxPages/maxDepth, or robots-disallowed -
      // are left with targetPageId/isBroken/statusCode = null: a documented
      // limitation (see final report), not a bug.
      const linkUpdates = internalLinkRecords
        .map((rec) => {
          const target = pageMap.get(rec.normalizedTargetUrl);
          if (!target) return null;
          return this.prisma.pageLink.update({
            where: { id: rec.id },
            data: { targetPageId: target.id, statusCode: target.statusCode, isBroken: target.statusCode >= 400 },
          });
        })
        .filter((p): p is NonNullable<typeof p> => p !== null);
      await Promise.all(linkUpdates);

      const errorCount = await this.prisma.crawlError.count({ where: { crawlJobId } });
      await this.prisma.crawlJob.update({
        where: { id: crawlJobId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          progress: 100,
          pagesDiscovered,
          pagesCrawled,
          statusMessage: `Completed: ${pagesCrawled} page(s) crawled, ${errorCount} error(s)${
            usedPlaywright ? ' (JS rendering used for at least one page)' : ''
          }`,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Crawl job ${crawlJobId} failed: ${message}`);
      await this.prisma.crawlJob
        .update({
          where: { id: crawlJobId },
          data: { status: 'FAILED', error: message, completedAt: new Date(), progress: 100, statusMessage: 'Crawl failed' },
        })
        .catch((updateErr) => {
          this.logger.error(`Failed to persist FAILED status for crawl job ${crawlJobId}: ${updateErr?.message}`);
        });
    }
  }
}
