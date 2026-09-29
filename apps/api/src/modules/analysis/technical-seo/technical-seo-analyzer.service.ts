import { Injectable, Logger } from '@nestjs/common';
import { Page, PageLink, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  CheckResult,
  DUPLICATE_CONTENT_MIN_WORDS,
  DUPLICATE_CONTENT_SIMILARITY_THRESHOLD,
  EXCESSIVE_OUTBOUND_LINK_THRESHOLD,
  HeadingEntry,
  IMPORTANT_PAGE_MIN_INBOUND,
  IMPORTANT_PAGE_MIN_OUTBOUND,
  LOW_OUTBOUND_LINK_THRESHOLD,
  evaluateCanonicalConflict,
  evaluateCanonicalPresence,
  evaluateEmptyHeadings,
  evaluateH1Missing,
  evaluateHeadingHierarchy,
  evaluateHttpStatus,
  evaluateHttps,
  evaluateImageAltCoverage,
  evaluateIndexability,
  evaluateMetaDescriptionLength,
  evaluateMetaDescriptionMissing,
  evaluateMultipleH1,
  evaluateOpenGraph,
  evaluateRobotsDirective,
  evaluateThinContent,
  evaluateTitleLength,
  evaluateTitleMissing,
  flattenJsonLdBlocks,
  getSchemaTypes,
  guessApplicableSchemaTypes,
  isHomepagePath,
  jaccardSimilarity,
  normalizeToWordSet,
  parseHeadings,
  parseImages,
  safePathname,
  withScore,
} from './technical-seo.helpers';

/**
 * Technical SEO Analyzer (spec section 6, Milestone 3).
 *
 * Runs a fixed battery of deterministic checks against every Page belonging
 * to a crawl job, plus a handful of site-wide checks (pageId = null). No
 * LLM calls - every status/evidence/recommendation is computed with plain
 * rules from data already sitting in Postgres (Page/PageLink/CrawlJob).
 *
 * Design note on categories: the spec (section 6) lists "Canonical" under
 * both "Technical Checks" and "Metadata". To avoid writing the same finding
 * twice (which would double-count it in any category-level aggregation done
 * by the Scoring module), canonical-related checks are written once, under
 * category METADATA.
 */
@Injectable()
export class TechnicalSeoAnalyzerService {
  private readonly logger = new Logger(TechnicalSeoAnalyzerService.name);

  constructor(private readonly prisma: PrismaService) {}

  async analyze(auditId: string, crawlJobId: string): Promise<void> {
    const [pages, crawlJob] = await Promise.all([
      this.prisma.page.findMany({
        where: { crawlJobId },
        include: { outboundLinks: true },
      }),
      this.prisma.crawlJob.findUniqueOrThrow({ where: { id: crawlJobId } }),
    ]);

    if (pages.length === 0) {
      this.logger.warn(`No pages found for crawl job ${crawlJobId}; skipping technical SEO analysis`);
      return;
    }

    // Inbound internal link counts, computed once for the whole crawl job.
    const inboundCounts = await this.computeInboundLinkCounts(pages.map((p) => p.id));

    const rows: Prisma.SEOCheckCreateManyInput[] = [];

    // ---- Site-wide checks -------------------------------------------------
    rows.push(...this.buildSiteWideChecks(auditId, crawlJob, pages));
    rows.push(...this.buildDuplicateTitleChecks(auditId, pages));
    rows.push(...this.buildDuplicateDescriptionChecks(auditId, pages));
    rows.push(...this.buildDuplicateCanonicalChecks(auditId, pages));
    rows.push(...this.buildDuplicateContentChecks(auditId, pages));
    rows.push(...this.buildSiteWideSchemaChecks(auditId, pages));

    // ---- Per-page checks ----------------------------------------------------
    for (const page of pages) {
      rows.push(...this.buildPageChecks(auditId, page, inboundCounts.get(page.id) ?? 0));
    }

    await this.writeChecks(rows);
  }

  // -------------------------------------------------------------------------
  // Helpers that build SEOCheckCreateManyInput rows for each check family
  // -------------------------------------------------------------------------

  private toRow(
    auditId: string,
    pageId: string | null,
    checkId: string,
    category: string,
    result: CheckResult,
  ): Prisma.SEOCheckCreateManyInput {
    const { score } = withScore(result);
    return {
      auditId,
      pageId,
      checkId,
      category,
      status: result.status,
      severity: result.severity,
      score,
      evidence: result.evidence,
      recommendation: result.recommendation,
    };
  }

  private buildPageChecks(
    auditId: string,
    page: Page & { outboundLinks: PageLink[] },
    inboundCount: number,
  ): Prisma.SEOCheckCreateManyInput[] {
    const headings = parseHeadings(page.headings);
    const images = parseImages(page.images);
    const rows: Prisma.SEOCheckCreateManyInput[] = [];
    const push = (checkId: string, category: string, result: CheckResult) =>
      rows.push(this.toRow(auditId, page.id, checkId, category, result));

    // Technical
    push('http-status', 'TECHNICAL', evaluateHttpStatus(page.statusCode, page.redirectedFrom));
    push('https-enforced', 'TECHNICAL', evaluateHttps(page.url));
    push('robots-directive', 'TECHNICAL', evaluateRobotsDirective(page.robotsMeta));
    push('indexability', 'TECHNICAL', evaluateIndexability(page.isIndexable, page.robotsMeta));
    push('broken-link', 'TECHNICAL', this.evaluateBrokenLinks(page.outboundLinks));

    // Metadata (canonical lives here, see class doc comment)
    push('missing-title', 'METADATA', evaluateTitleMissing(page.title));
    push('title-length', 'METADATA', evaluateTitleLength(page.title));
    push('missing-meta-description', 'METADATA', evaluateMetaDescriptionMissing(page.metaDescription));
    push('meta-description-length', 'METADATA', evaluateMetaDescriptionLength(page.metaDescription));
    push('open-graph-presence', 'METADATA', evaluateOpenGraph(page.ogData));
    push('missing-canonical', 'METADATA', evaluateCanonicalPresence(page.canonicalUrl));
    push('canonical-conflict', 'METADATA', evaluateCanonicalConflict(page.url, page.canonicalUrl));

    // Content structure
    push('h1-missing', 'CONTENT_STRUCTURE', evaluateH1Missing(headings));
    push('multiple-h1', 'CONTENT_STRUCTURE', evaluateMultipleH1(headings));
    push('heading-hierarchy', 'CONTENT_STRUCTURE', evaluateHeadingHierarchy(headings));
    push('empty-heading', 'CONTENT_STRUCTURE', evaluateEmptyHeadings(headings));
    push('thin-content', 'CONTENT_STRUCTURE', evaluateThinContent(page.wordCount));
    push('image-alt-text', 'CONTENT_STRUCTURE', evaluateImageAltCoverage(images));

    // Internal linking
    const outboundInternalCount = page.outboundLinks.filter((l) => l.isInternal).length;
    push(
      'orphan-page',
      'INTERNAL_LINKING',
      this.evaluateOrphanPage(page.normalizedUrl, page.url, inboundCount),
    );
    push(
      'low-internal-links',
      'INTERNAL_LINKING',
      this.evaluateLowOutboundLinks(outboundInternalCount),
    );
    push(
      'excessive-internal-links',
      'INTERNAL_LINKING',
      this.evaluateExcessiveOutboundLinks(outboundInternalCount),
    );
    push(
      'important-page-poor-linking',
      'INTERNAL_LINKING',
      this.evaluateImportantPageLinking(page.normalizedUrl, page.url, inboundCount, outboundInternalCount),
    );

    // Structured data (presence/applicability only - deep validity is the
    // Schema Analyzer's job, see schema-analyzer.service.ts).
    const jsonLdBlocks = flattenJsonLdBlocks(page.jsonLd);
    const presentTypes = new Set(jsonLdBlocks.flatMap((b) => getSchemaTypes(b)));
    const applicableTypes = guessApplicableSchemaTypes({
      url: page.url,
      normalizedUrl: page.normalizedUrl,
      title: page.title,
      headings,
      contentText: page.contentText,
    });
    for (const type of applicableTypes) {
      // Organization/WebSite are covered by the site-wide checks below to
      // avoid one row per page for what's really a site-level signal.
      if (type === 'Organization' || type === 'WebSite') continue;
      push(
        `schema-${type.toLowerCase()}-missing`,
        'STRUCTURED_DATA',
        this.evaluateSchemaPresence(type, presentTypes),
      );
    }

    return rows;
  }

  private evaluateBrokenLinks(outboundLinks: PageLink[]): CheckResult {
    const internal = outboundLinks.filter((l) => l.isInternal);
    if (internal.length === 0) {
      return {
        status: 'NOT_APPLICABLE',
        severity: 'LOW',
        evidence: 'Page has no internal outbound links to check.',
        recommendation: 'No action needed.',
      };
    }
    const broken = internal.filter((l) => l.isBroken);
    if (broken.length === 0) {
      return {
        status: 'PASS',
        severity: 'LOW',
        evidence: `All ${internal.length} internal outbound link(s) resolved successfully.`,
        recommendation: 'No action needed.',
      };
    }
    const sample = broken[0];
    return {
      status: 'FAIL',
      severity: broken.length > 3 ? 'HIGH' : 'MEDIUM',
      evidence: `${broken.length} of ${internal.length} internal link(s) are broken, e.g. "${sample.targetUrl}" returned ${sample.statusCode ?? 'no response'}.`,
      recommendation: 'Fix or remove broken internal links; redirect or restore the missing target pages.',
    };
  }

  private evaluateOrphanPage(normalizedUrl: string, url: string, inboundCount: number): CheckResult {
    const path = safePathname(normalizedUrl || url);
    if (isHomepagePath(path)) {
      return {
        status: 'NOT_APPLICABLE',
        severity: 'LOW',
        evidence: 'Homepage is the crawl entry point and is exempt from the orphan-page check.',
        recommendation: 'No action needed.',
      };
    }
    if (inboundCount === 0) {
      return {
        status: 'FAIL',
        severity: 'HIGH',
        evidence: `Page "${url}" has zero internal links pointing to it from any other crawled page (orphan page).`,
        recommendation: 'Add at least one internal link to this page from relevant navigation or content.',
      };
    }
    return {
      status: 'PASS',
      severity: 'LOW',
      evidence: `Page has ${inboundCount} internal inbound link(s).`,
      recommendation: 'No action needed.',
    };
  }

  private evaluateLowOutboundLinks(outboundInternalCount: number): CheckResult {
    if (outboundInternalCount < LOW_OUTBOUND_LINK_THRESHOLD) {
      return {
        status: 'WARNING',
        severity: 'MEDIUM',
        evidence: `Page has only ${outboundInternalCount} internal outbound link(s) (below the ${LOW_OUTBOUND_LINK_THRESHOLD}-link threshold).`,
        recommendation: 'Add contextual internal links to related pages to help users and crawlers navigate.',
      };
    }
    return {
      status: 'PASS',
      severity: 'LOW',
      evidence: `Page has ${outboundInternalCount} internal outbound link(s).`,
      recommendation: 'No action needed.',
    };
  }

  private evaluateExcessiveOutboundLinks(outboundInternalCount: number): CheckResult {
    if (outboundInternalCount > EXCESSIVE_OUTBOUND_LINK_THRESHOLD) {
      return {
        status: 'WARNING',
        severity: 'LOW',
        evidence: `Page has ${outboundInternalCount} internal outbound links (above the ${EXCESSIVE_OUTBOUND_LINK_THRESHOLD}-link threshold), which can dilute link equity.`,
        recommendation: 'Consider trimming low-value links or grouping them behind a "see more" pattern.',
      };
    }
    return {
      status: 'PASS',
      severity: 'LOW',
      evidence: `Page has ${outboundInternalCount} internal outbound link(s), within a reasonable range.`,
      recommendation: 'No action needed.',
    };
  }

  private evaluateImportantPageLinking(
    normalizedUrl: string,
    url: string,
    inboundCount: number,
    outboundInternalCount: number,
  ): CheckResult {
    const path = safePathname(normalizedUrl || url);
    const isImportant = isHomepagePath(path) || inboundCount >= IMPORTANT_PAGE_MIN_INBOUND * 2;
    if (!isImportant) {
      return {
        status: 'NOT_APPLICABLE',
        severity: 'LOW',
        evidence: 'Page is not classified as an important page (not the homepage and not highly linked-to).',
        recommendation: 'No action needed.',
      };
    }
    const poorInbound = !isHomepagePath(path) && inboundCount < IMPORTANT_PAGE_MIN_INBOUND;
    const poorOutbound = outboundInternalCount < IMPORTANT_PAGE_MIN_OUTBOUND;
    if (poorInbound || poorOutbound) {
      return {
        status: 'FAIL',
        severity: 'HIGH',
        evidence: `Important page "${url}" has ${inboundCount} inbound and ${outboundInternalCount} outbound internal link(s), below the bar expected for a high-value page.`,
        recommendation: 'Strengthen internal linking to and from this important page from other relevant content.',
      };
    }
    return {
      status: 'PASS',
      severity: 'LOW',
      evidence: `Important page "${url}" has ${inboundCount} inbound and ${outboundInternalCount} outbound internal link(s).`,
      recommendation: 'No action needed.',
    };
  }

  private evaluateSchemaPresence(type: string, presentTypes: Set<string>): CheckResult {
    if (presentTypes.has(type)) {
      return {
        status: 'PASS',
        severity: 'LOW',
        evidence: `Page carries ${type} JSON-LD structured data, matching its apparent page type.`,
        recommendation: 'No action needed.',
      };
    }
    return {
      status: 'WARNING',
      severity: 'MEDIUM',
      evidence: `Page looks like a ${type} page (based on URL/title/heading heuristics) but has no ${type} JSON-LD.`,
      recommendation: `Add ${type} structured data (JSON-LD) so search/AI systems can parse this page's meaning.`,
    };
  }

  // -------------------------------------------------------------------------
  // Site-wide checks
  // -------------------------------------------------------------------------

  private buildSiteWideChecks(
    auditId: string,
    crawlJob: { sitemapUrls: Prisma.JsonValue | null; robotsTxtContent: string | null },
    pages: Page[],
  ): Prisma.SEOCheckCreateManyInput[] {
    const rows: Prisma.SEOCheckCreateManyInput[] = [];

    const sitemapUrls = Array.isArray(crawlJob.sitemapUrls) ? crawlJob.sitemapUrls : [];
    rows.push(
      this.toRow(
        auditId,
        null,
        'sitemap-presence',
        'TECHNICAL',
        sitemapUrls.length > 0
          ? {
              status: 'PASS',
              severity: 'LOW',
              evidence: `Found ${sitemapUrls.length} sitemap URL(s), e.g. "${String(sitemapUrls[0])}".`,
              recommendation: 'No action needed.',
            }
          : {
              status: 'FAIL',
              severity: 'MEDIUM',
              evidence: 'No sitemap.xml was discovered for this website.',
              recommendation: 'Publish a sitemap.xml and reference it from robots.txt to help crawlers discover pages.',
            },
      ),
    );

    rows.push(
      this.toRow(
        auditId,
        null,
        'robots-txt-presence',
        'TECHNICAL',
        crawlJob.robotsTxtContent && crawlJob.robotsTxtContent.trim().length > 0
          ? {
              status: 'PASS',
              severity: 'LOW',
              evidence: `robots.txt was found (${crawlJob.robotsTxtContent.trim().length} characters).`,
              recommendation: 'No action needed.',
            }
          : {
              status: 'WARNING',
              severity: 'LOW',
              evidence: 'No robots.txt was found for this website.',
              recommendation: 'Publish a robots.txt file to give crawlers explicit crawling guidance.',
            },
      ),
    );

    return rows;
  }

  private buildDuplicateTitleChecks(auditId: string, pages: Page[]): Prisma.SEOCheckCreateManyInput[] {
    return this.buildDuplicateFieldChecks(auditId, pages, 'duplicate-title', 'METADATA', (p) => p.title, 'title');
  }

  private buildDuplicateDescriptionChecks(auditId: string, pages: Page[]): Prisma.SEOCheckCreateManyInput[] {
    return this.buildDuplicateFieldChecks(
      auditId,
      pages,
      'duplicate-meta-description',
      'METADATA',
      (p) => p.metaDescription,
      'meta description',
    );
  }

  private buildDuplicateFieldChecks(
    auditId: string,
    pages: Page[],
    checkId: string,
    category: string,
    getField: (p: Page) => string | null,
    label: string,
  ): Prisma.SEOCheckCreateManyInput[] {
    const groups = new Map<string, Page[]>();
    for (const page of pages) {
      const raw = (getField(page) ?? '').trim();
      if (!raw) continue; // missing-ness is handled by its own check
      const key = raw.toLowerCase();
      const arr = groups.get(key) ?? [];
      arr.push(page);
      groups.set(key, arr);
    }
    const rows: Prisma.SEOCheckCreateManyInput[] = [];
    for (const [key, group] of groups) {
      if (group.length < 2) continue;
      for (const page of group) {
        const others = group.filter((p) => p.id !== page.id).map((p) => p.url);
        rows.push(
          this.toRow(auditId, page.id, checkId, category, {
            status: 'FAIL',
            severity: 'MEDIUM',
            evidence: `${group.length} pages share the same ${label} "${(getField(page) ?? '').trim()}", including ${others.slice(0, 3).join(', ')}${others.length > 3 ? `, +${others.length - 3} more` : ''}.`,
            recommendation: `Write a unique ${label} for each page.`,
          }),
        );
      }
      void key;
    }
    return rows;
  }

  private buildDuplicateCanonicalChecks(auditId: string, pages: Page[]): Prisma.SEOCheckCreateManyInput[] {
    const groups = new Map<string, Page[]>();
    for (const page of pages) {
      const canonical = (page.canonicalUrl ?? '').trim();
      if (!canonical) continue;
      const arr = groups.get(canonical) ?? [];
      arr.push(page);
      groups.set(canonical, arr);
    }
    const rows: Prisma.SEOCheckCreateManyInput[] = [];
    for (const [canonicalTarget, group] of groups) {
      if (group.length < 2) continue;
      for (const page of group) {
        const others = group.filter((p) => p.id !== page.id).map((p) => p.url);
        rows.push(
          this.toRow(auditId, page.id, 'duplicate-canonical-target', 'TECHNICAL', {
            status: 'WARNING',
            severity: 'MEDIUM',
            evidence: `${group.length} pages declare the same canonical target "${canonicalTarget}": this page (${page.url}) and ${others.slice(0, 3).join(', ')}${others.length > 3 ? `, +${others.length - 3} more` : ''}.`,
            recommendation:
              'Confirm this is an intentional duplicate-content consolidation; otherwise give each page its own self-referencing canonical.',
          }),
        );
      }
    }
    return rows;
  }

  private buildDuplicateContentChecks(auditId: string, pages: Page[]): Prisma.SEOCheckCreateManyInput[] {
    const eligible = pages
      .map((p) => ({ page: p, words: normalizeToWordSet(p.contentText) }))
      .filter((p) => p.page.wordCount >= DUPLICATE_CONTENT_MIN_WORDS);

    const rows: Prisma.SEOCheckCreateManyInput[] = [];
    const matchedIds = new Set<string>();

    for (let i = 0; i < eligible.length; i++) {
      if (matchedIds.has(eligible[i].page.id)) continue;
      for (let j = i + 1; j < eligible.length; j++) {
        if (matchedIds.has(eligible[j].page.id)) continue;
        const similarity = jaccardSimilarity(eligible[i].words, eligible[j].words);
        if (similarity >= DUPLICATE_CONTENT_SIMILARITY_THRESHOLD) {
          matchedIds.add(eligible[i].page.id);
          matchedIds.add(eligible[j].page.id);
          const pct = Math.round(similarity * 100);
          rows.push(
            this.toRow(auditId, eligible[j].page.id, 'duplicate-content', 'CONTENT_STRUCTURE', {
              status: 'FAIL',
              severity: 'MEDIUM',
              evidence: `Content is ${pct}% similar (word-overlap heuristic) to "${eligible[i].page.url}".`,
              recommendation: 'Differentiate or canonicalize near-duplicate content to avoid diluting relevance signals.',
            }),
          );
          break;
        }
      }
    }

    for (const { page } of eligible) {
      if (!matchedIds.has(page.id)) {
        rows.push(
          this.toRow(auditId, page.id, 'duplicate-content', 'CONTENT_STRUCTURE', {
            status: 'PASS',
            severity: 'LOW',
            evidence: 'No near-duplicate content detected among crawled pages.',
            recommendation: 'No action needed.',
          }),
        );
      }
    }
    for (const page of pages) {
      if (page.wordCount < DUPLICATE_CONTENT_MIN_WORDS) {
        rows.push(
          this.toRow(auditId, page.id, 'duplicate-content', 'CONTENT_STRUCTURE', {
            status: 'NOT_APPLICABLE',
            severity: 'LOW',
            evidence: `Page has only ${page.wordCount} words, too little content to reliably compare for duplication.`,
            recommendation: 'No action needed.',
          }),
        );
      }
    }
    return rows;
  }

  /** Site-wide Organization/WebSite schema presence (spec section 6's
   * Structured Data list explicitly calls these out at the site level). */
  private buildSiteWideSchemaChecks(auditId: string, pages: Page[]): Prisma.SEOCheckCreateManyInput[] {
    const allTypes = new Set<string>();
    for (const page of pages) {
      for (const block of flattenJsonLdBlocks(page.jsonLd)) {
        for (const t of getSchemaTypes(block)) allTypes.add(t);
      }
    }
    const rows: Prisma.SEOCheckCreateManyInput[] = [];
    for (const type of ['Organization', 'WebSite'] as const) {
      rows.push(
        this.toRow(
          auditId,
          null,
          `schema-${type.toLowerCase()}-missing`,
          'STRUCTURED_DATA',
          allTypes.has(type)
            ? {
                status: 'PASS',
                severity: 'LOW',
                evidence: `${type} JSON-LD was found on at least one of ${pages.length} crawled page(s).`,
                recommendation: 'No action needed.',
              }
            : {
                status: 'FAIL',
                severity: 'HIGH',
                evidence: `No ${type} JSON-LD structured data was found on any of ${pages.length} crawled page(s).`,
                recommendation: `Add site-wide ${type} JSON-LD (typically on the homepage) so search/AI systems can identify this entity.`,
              },
        ),
      );
    }
    return rows;
  }

  // -------------------------------------------------------------------------
  // Data access helpers
  // -------------------------------------------------------------------------

  private async computeInboundLinkCounts(pageIds: string[]): Promise<Map<string, number>> {
    if (pageIds.length === 0) return new Map();
    const grouped = await this.prisma.pageLink.groupBy({
      by: ['targetPageId'],
      where: { targetPageId: { in: pageIds }, isInternal: true },
      _count: { _all: true },
    });
    const map = new Map<string, number>();
    for (const g of grouped) {
      if (g.targetPageId) map.set(g.targetPageId, g._count._all);
    }
    return map;
  }

  private async writeChecks(rows: Prisma.SEOCheckCreateManyInput[]): Promise<void> {
    if (rows.length === 0) return;
    await this.prisma.sEOCheck.createMany({ data: rows });
    this.logger.log(`Wrote ${rows.length} SEOCheck rows`);
  }
}

// Re-exported so consumers (and tests) that only need the shape don't need
// to reach into the helpers module.
export type { HeadingEntry };
