import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CrawlOptions, DEFAULT_CRAWL_OPTIONS } from './crawler.types';

/**
 * STUB - implements Milestone 2 (Website Crawler, spec section 5).
 *
 * Contract (do not change signatures - AuditsService depends on them):
 *  - createCrawlJob(websiteId, options?) -> creates a CrawlJob row with status QUEUED
 *    and returns it.
 *  - runCrawlJob(crawlJobId) -> executes the crawl to completion. Must:
 *      - set status RUNNING, then COMPLETED or FAILED
 *      - update progress (0-100) and statusMessage as it goes so the frontend
 *        can poll AuditsService.getStatus()
 *      - create Page rows (see prisma/schema.prisma Page model) for every
 *        crawled URL, PageLink rows for discovered links (internal + external,
 *        flag isBroken when a followed internal link 4xx/5xx's), and
 *        CrawlError rows for failures
 *      - respect robots.txt, sitemap.xml discovery, SSRF protection
 *        (src/common/security/ssrf-guard.ts - call assertUrlIsSafeToFetch
 *        before every fetch, including after following redirects), url
 *        normalization/dedup, and the CrawlOptions limits
 *      - never crawl unlimited URLs; stop at options.maxPages / options.maxDepth
 *
 * This stub only creates an empty completed CrawlJob so the rest of the
 * pipeline (AuditsService) compiles and runs end-to-end while the real
 * crawler is implemented.
 */
@Injectable()
export class CrawlerService {
  private readonly logger = new Logger(CrawlerService.name);

  constructor(private readonly prisma: PrismaService) {}

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
    this.logger.warn(
      `CrawlerService.runCrawlJob is a STUB - crawling not yet implemented (job ${crawlJobId})`,
    );
    await this.prisma.crawlJob.update({
      where: { id: crawlJobId },
      data: {
        status: 'COMPLETED',
        progress: 100,
        statusMessage: 'Crawler not yet implemented (stub)',
        startedAt: new Date(),
        completedAt: new Date(),
      },
    });
  }
}
