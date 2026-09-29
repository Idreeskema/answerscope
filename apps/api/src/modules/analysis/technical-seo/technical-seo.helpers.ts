import { CheckStatus, Severity } from '@prisma/client';

/**
 * Pure, deterministic helper functions for the Technical SEO Analyzer
 * (spec section 6). Nothing in this file touches Prisma/the network so it
 * can be unit-tested with plain in-memory fixtures.
 *
 * ---------------------------------------------------------------------------
 * Heuristic thresholds used throughout (documented here once):
 * - Title length: 30-60 chars is the commonly-cited "healthy" range before
 *   Google/most SERPs truncate a title; <10 or >70 is flagged as FAIL,
 *   everything else in between is a WARNING.
 * - Meta description length: 70-160 chars mirrors typical SERP snippet
 *   length; <20 or >320 is FAIL, in-between is WARNING.
 * - Thin content: wordCount < 250 is FAIL, 250-399 is WARNING, >=400 PASS.
 * - Duplicate content: Jaccard similarity (word-set overlap) >= 0.85 between
 *   two pages' normalized contentText is treated as near-duplicate. This is
 *   intentionally a cheap O(words) heuristic, not a real shingling/simhash
 *   algorithm - the brief explicitly says "don't over-engineer".
 * - Internal linking: fewer than 2 internal outbound links is "low";
 *   more than 150 is "excessive". A page counts as "important" when it is
 *   the homepage or sits in the top 20% of pages by inbound internal link
 *   count (minimum 1 page) - important pages are held to a stricter bar
 *   (>=3 inbound AND >=2 outbound internal links).
 * ---------------------------------------------------------------------------
 */

export interface HeadingEntry {
  level: number;
  text: string;
}

export interface ImageEntry {
  src: string;
  alt?: string | null;
}

export interface CheckResult {
  status: CheckStatus;
  severity: Severity;
  evidence: string;
  recommendation: string;
}

export interface CheckResultWithScore extends CheckResult {
  score: number;
}

/** Maps a check outcome to a deterministic, reproducible 0-100 score. Never
 * a guessed/arbitrary number - PASS/NOT_APPLICABLE are neutral (100),
 * WARNING is a flat 60, FAIL scales by severity so a CRITICAL failure drags
 * the category score down far more than a LOW one. */
export function scoreFor(status: CheckStatus, severity: Severity): number {
  if (status === 'PASS' || status === 'NOT_APPLICABLE') return 100;
  if (status === 'WARNING') return 60;
  // FAIL
  switch (severity) {
    case 'CRITICAL':
      return 0;
    case 'HIGH':
      return 10;
    case 'MEDIUM':
      return 25;
    case 'LOW':
      return 40;
    default:
      return 0;
  }
}

export function withScore(result: CheckResult): CheckResultWithScore {
  return { ...result, score: scoreFor(result.status, result.severity) };
}

// ---------------------------------------------------------------------------
// JSON parsing helpers (Page.headings / Page.images / Page.jsonLd are Json?)
// ---------------------------------------------------------------------------

export function parseHeadings(raw: unknown): HeadingEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((h): h is Record<string, unknown> => !!h && typeof h === 'object')
    .map((h) => ({
      level: typeof h.level === 'number' ? h.level : Number(h.level) || 0,
      text: typeof h.text === 'string' ? h.text : '',
    }))
    .filter((h) => h.level > 0);
}

export function parseImages(raw: unknown): ImageEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((i): i is Record<string, unknown> => !!i && typeof i === 'object')
    .map((i) => ({
      src: typeof i.src === 'string' ? i.src : '',
      alt: typeof i.alt === 'string' ? i.alt : null,
    }));
}

/**
 * Page.jsonLd stores one entry per <script type="application/ld+json"> tag
 * found on the page. Each entry may itself be a single object, an array of
 * objects, or an object using an `@graph` wrapper. This flattens all of
 * those shapes into a flat list of schema.org objects, each expected to
 * carry its own `@type`.
 */
export function flattenJsonLdBlocks(raw: unknown): Record<string, any>[] {
  if (!raw) return [];
  const topLevel = Array.isArray(raw) ? raw : [raw];
  const result: Record<string, any>[] = [];
  for (const entry of topLevel) {
    collectJsonLdBlock(entry, result);
  }
  return result;
}

function collectJsonLdBlock(entry: unknown, out: Record<string, any>[]): void {
  if (!entry || typeof entry !== 'object') return;
  if (Array.isArray(entry)) {
    for (const item of entry) collectJsonLdBlock(item, out);
    return;
  }
  const obj = entry as Record<string, any>;
  if (Array.isArray(obj['@graph'])) {
    for (const item of obj['@graph']) collectJsonLdBlock(item, out);
    return;
  }
  out.push(obj);
}

/** Normalizes a JSON-LD block's `@type` (string | string[] | undefined) into
 * a flat array of type names. */
export function getSchemaTypes(block: Record<string, any>): string[] {
  const t = block['@type'];
  if (!t) return [];
  return Array.isArray(t) ? t.filter((x) => typeof x === 'string') : typeof t === 'string' ? [t] : [];
}

export function safePathname(urlOrPath: string | null | undefined): string {
  if (!urlOrPath) return '';
  try {
    return new URL(urlOrPath).pathname.toLowerCase();
  } catch {
    // Already a path, or malformed - fall back to using it verbatim.
    return urlOrPath.toLowerCase();
  }
}

// ---------------------------------------------------------------------------
// Metadata checks
// ---------------------------------------------------------------------------

export function evaluateTitleMissing(title: string | null | undefined): CheckResult {
  const t = (title ?? '').trim();
  if (!t) {
    return {
      status: 'FAIL',
      severity: 'CRITICAL',
      evidence: 'This page has no <title> element (title is empty or missing).',
      recommendation:
        'Add a unique, descriptive <title> of roughly 30-60 characters that summarizes the page content.',
    };
  }
  return {
    status: 'PASS',
    severity: 'LOW',
    evidence: `Title is present: "${t}" (${t.length} characters).`,
    recommendation: 'No action needed.',
  };
}

export function evaluateTitleLength(title: string | null | undefined): CheckResult {
  const t = (title ?? '').trim();
  if (!t) {
    return {
      status: 'NOT_APPLICABLE',
      severity: 'LOW',
      evidence: 'No title present to evaluate length (see missing-title check).',
      recommendation: 'Add a title first.',
    };
  }
  const len = t.length;
  if (len >= 30 && len <= 60) {
    return {
      status: 'PASS',
      severity: 'LOW',
      evidence: `Title is ${len} characters: "${t}" (healthy 30-60 char range).`,
      recommendation: 'No action needed.',
    };
  }
  if (len < 10 || len > 70) {
    return {
      status: 'FAIL',
      severity: 'MEDIUM',
      evidence: `Title is ${len} characters: "${t}" (${len < 10 ? 'far too short' : 'far too long, will likely be truncated in search results'}).`,
      recommendation: 'Rewrite the title to be roughly 30-60 characters, describing the page uniquely.',
    };
  }
  return {
    status: 'WARNING',
    severity: 'LOW',
    evidence: `Title is ${len} characters: "${t}" (outside the ideal 30-60 char range).`,
    recommendation: 'Consider tightening or expanding the title toward 30-60 characters.',
  };
}

export function evaluateMetaDescriptionMissing(desc: string | null | undefined): CheckResult {
  const d = (desc ?? '').trim();
  if (!d) {
    return {
      status: 'FAIL',
      severity: 'MEDIUM',
      evidence: 'This page has no meta description.',
      recommendation: 'Add a meta description of roughly 70-160 characters summarizing the page.',
    };
  }
  return {
    status: 'PASS',
    severity: 'LOW',
    evidence: `Meta description is present: "${d}" (${d.length} characters).`,
    recommendation: 'No action needed.',
  };
}

export function evaluateMetaDescriptionLength(desc: string | null | undefined): CheckResult {
  const d = (desc ?? '').trim();
  if (!d) {
    return {
      status: 'NOT_APPLICABLE',
      severity: 'LOW',
      evidence: 'No meta description present to evaluate length.',
      recommendation: 'Add a meta description first.',
    };
  }
  const len = d.length;
  if (len >= 70 && len <= 160) {
    return {
      status: 'PASS',
      severity: 'LOW',
      evidence: `Meta description is ${len} characters (healthy 70-160 char range).`,
      recommendation: 'No action needed.',
    };
  }
  if (len < 20 || len > 320) {
    return {
      status: 'FAIL',
      severity: 'LOW',
      evidence: `Meta description is ${len} characters (${len < 20 ? 'far too short to be useful' : 'far too long, will be truncated'}).`,
      recommendation: 'Rewrite the meta description to be roughly 70-160 characters.',
    };
  }
  return {
    status: 'WARNING',
    severity: 'LOW',
    evidence: `Meta description is ${len} characters (outside the ideal 70-160 char range).`,
    recommendation: 'Consider adjusting the meta description length toward 70-160 characters.',
  };
}

export function evaluateOpenGraph(ogData: unknown): CheckResult {
  const og = (ogData && typeof ogData === 'object' ? (ogData as Record<string, unknown>) : {}) as Record<
    string,
    unknown
  >;
  const hasCore = typeof og.title === 'string' && typeof og.description === 'string';
  if (hasCore) {
    return {
      status: 'PASS',
      severity: 'LOW',
      evidence: `Open Graph tags present: og:title="${og.title}"${
        typeof og.image === 'string' ? `, og:image present` : ', og:image missing'
      }.`,
      recommendation: 'No action needed.',
    };
  }
  const keys = Object.keys(og);
  return {
    status: 'WARNING',
    severity: 'MEDIUM',
    evidence:
      keys.length > 0
        ? `Only partial Open Graph data found (keys: ${keys.join(', ')}); missing og:title/og:description.`
        : 'No Open Graph metadata found on this page.',
    recommendation: 'Add og:title, og:description, og:image, and og:url so shared links render correctly.',
  };
}

// ---------------------------------------------------------------------------
// Canonical checks
// ---------------------------------------------------------------------------

export function evaluateCanonicalPresence(canonicalUrl: string | null | undefined): CheckResult {
  if (!canonicalUrl) {
    return {
      status: 'WARNING',
      severity: 'MEDIUM',
      evidence: 'No canonical tag was found on this page.',
      recommendation: 'Add a self-referencing <link rel="canonical"> to avoid duplicate-content ambiguity.',
    };
  }
  return {
    status: 'PASS',
    severity: 'LOW',
    evidence: `Canonical tag points to "${canonicalUrl}".`,
    recommendation: 'No action needed.',
  };
}

export function evaluateCanonicalConflict(
  pageUrl: string,
  canonicalUrl: string | null | undefined,
): CheckResult {
  if (!canonicalUrl) {
    return {
      status: 'NOT_APPLICABLE',
      severity: 'LOW',
      evidence: 'No canonical tag present, so no cross-domain conflict to check.',
      recommendation: 'Add a canonical tag first.',
    };
  }
  let pageHost = '';
  let canonicalHost = '';
  try {
    pageHost = new URL(pageUrl).hostname.replace(/^www\./, '');
  } catch {
    /* ignore */
  }
  try {
    canonicalHost = new URL(canonicalUrl).hostname.replace(/^www\./, '');
  } catch {
    return {
      status: 'FAIL',
      severity: 'HIGH',
      evidence: `Canonical tag value "${canonicalUrl}" is not a valid absolute URL.`,
      recommendation: 'Use a valid absolute URL in the canonical tag.',
    };
  }
  if (pageHost && canonicalHost && pageHost !== canonicalHost) {
    return {
      status: 'FAIL',
      severity: 'HIGH',
      evidence: `Page "${pageUrl}" declares a canonical pointing to a different domain: "${canonicalUrl}".`,
      recommendation: 'Point the canonical tag at a URL on the same domain, or remove it if unintentional.',
    };
  }
  return {
    status: 'PASS',
    severity: 'LOW',
    evidence: `Canonical target "${canonicalUrl}" is on the same domain as the page.`,
    recommendation: 'No action needed.',
  };
}

// ---------------------------------------------------------------------------
// HTTP / indexability checks
// ---------------------------------------------------------------------------

export function evaluateHttpStatus(statusCode: number | null | undefined, redirectedFrom?: string | null): CheckResult {
  if (statusCode == null) {
    return {
      status: 'WARNING',
      severity: 'MEDIUM',
      evidence: 'No HTTP status code was recorded for this page.',
      recommendation: 'Re-crawl the page to confirm it responds with a valid HTTP status.',
    };
  }
  if (statusCode >= 200 && statusCode < 300) {
    return {
      status: 'PASS',
      severity: 'LOW',
      evidence: `Page responded with HTTP ${statusCode}.`,
      recommendation: 'No action needed.',
    };
  }
  if (statusCode >= 300 && statusCode < 400) {
    return {
      status: 'WARNING',
      severity: 'MEDIUM',
      evidence: `Page responded with a redirect (HTTP ${statusCode})${
        redirectedFrom ? ` from "${redirectedFrom}"` : ''
      }.`,
      recommendation: 'Update internal links to point directly at the final destination URL to avoid redirect hops.',
    };
  }
  if (statusCode >= 400 && statusCode < 500) {
    return {
      status: 'FAIL',
      severity: 'HIGH',
      evidence: `Page responded with a client error (HTTP ${statusCode}).`,
      recommendation: 'Fix or remove links to this URL, or restore the missing page.',
    };
  }
  return {
    status: 'FAIL',
    severity: 'CRITICAL',
    evidence: `Page responded with a server error (HTTP ${statusCode}).`,
    recommendation: 'Investigate the server error; this page is likely inaccessible to crawlers.',
  };
}

export function evaluateHttps(url: string): CheckResult {
  const isHttps = url.trim().toLowerCase().startsWith('https://');
  if (isHttps) {
    return {
      status: 'PASS',
      severity: 'LOW',
      evidence: `Page is served over HTTPS: "${url}".`,
      recommendation: 'No action needed.',
    };
  }
  return {
    status: 'FAIL',
    severity: 'HIGH',
    evidence: `Page is served over unencrypted HTTP: "${url}".`,
    recommendation: 'Migrate the site to HTTPS; browsers and search engines penalize/flag plain HTTP.',
  };
}

export function evaluateRobotsDirective(robotsMeta: string | null | undefined): CheckResult {
  const meta = (robotsMeta ?? '').toLowerCase();
  if (meta.includes('noindex')) {
    return {
      status: 'FAIL',
      severity: 'HIGH',
      evidence: `Page has a robots meta directive of "${robotsMeta}", which includes "noindex".`,
      recommendation: 'Remove the noindex directive if this page should appear in search results.',
    };
  }
  if (meta.includes('nofollow')) {
    return {
      status: 'WARNING',
      severity: 'MEDIUM',
      evidence: `Page has a robots meta directive of "${robotsMeta}", which includes "nofollow".`,
      recommendation: 'Remove nofollow if outbound links on this page should pass link equity.',
    };
  }
  return {
    status: 'PASS',
    severity: 'LOW',
    evidence: robotsMeta ? `Robots meta directive is "${robotsMeta}" (no blocking directives).` : 'No blocking robots meta directive present.',
    recommendation: 'No action needed.',
  };
}

export function evaluateIndexability(isIndexable: boolean, robotsMeta: string | null | undefined): CheckResult {
  if (!isIndexable) {
    return {
      status: 'FAIL',
      severity: 'HIGH',
      evidence: `Page is marked non-indexable by the crawler${robotsMeta ? ` (robots meta: "${robotsMeta}")` : ''}.`,
      recommendation: 'Confirm this is intentional; otherwise remove the blocking directive.',
    };
  }
  return {
    status: 'PASS',
    severity: 'LOW',
    evidence: 'Page is indexable.',
    recommendation: 'No action needed.',
  };
}

// ---------------------------------------------------------------------------
// Content structure checks
// ---------------------------------------------------------------------------

export function evaluateH1Missing(headings: HeadingEntry[]): CheckResult {
  const h1s = headings.filter((h) => h.level === 1);
  if (h1s.length === 0) {
    return {
      status: 'FAIL',
      severity: 'HIGH',
      evidence: `Page has ${headings.length} heading(s) total but zero <h1>.`,
      recommendation: 'Add a single, descriptive <h1> that states the page topic.',
    };
  }
  return {
    status: 'PASS',
    severity: 'LOW',
    evidence: `Page has an <h1>: "${h1s[0].text}".`,
    recommendation: 'No action needed.',
  };
}

export function evaluateMultipleH1(headings: HeadingEntry[]): CheckResult {
  const h1s = headings.filter((h) => h.level === 1);
  if (h1s.length > 1) {
    return {
      status: 'WARNING',
      severity: 'MEDIUM',
      evidence: `Page has ${h1s.length} <h1> elements: ${h1s.map((h) => `"${h.text}"`).join(', ')}.`,
      recommendation: 'Keep a single <h1> per page and demote the others to <h2>/<h3>.',
    };
  }
  return {
    status: 'PASS',
    severity: 'LOW',
    evidence: `Page has ${h1s.length} <h1> element(s).`,
    recommendation: 'No action needed.',
  };
}

export function evaluateHeadingHierarchy(headings: HeadingEntry[]): CheckResult {
  if (headings.length === 0) {
    return {
      status: 'NOT_APPLICABLE',
      severity: 'LOW',
      evidence: 'No headings present to evaluate hierarchy.',
      recommendation: 'Add headings to structure the content.',
    };
  }
  let maxSeenLevel = 0;
  for (const h of headings) {
    if (h.level > maxSeenLevel + 1) {
      return {
        status: 'WARNING',
        severity: 'MEDIUM',
        evidence: `Heading "${h.text}" is an <h${h.level}> but no <h${h.level - 1}> (or higher) appeared before it (highest seen so far: h${maxSeenLevel || 'none'}).`,
        recommendation: 'Use headings in strict descending order (h1 -> h2 -> h3) without skipping levels.',
      };
    }
    maxSeenLevel = Math.max(maxSeenLevel, h.level);
  }
  return {
    status: 'PASS',
    severity: 'LOW',
    evidence: `Heading levels (${headings.map((h) => `h${h.level}`).join(', ')}) follow a valid hierarchy.`,
    recommendation: 'No action needed.',
  };
}

export function evaluateEmptyHeadings(headings: HeadingEntry[]): CheckResult {
  if (headings.length === 0) {
    return {
      status: 'NOT_APPLICABLE',
      severity: 'LOW',
      evidence: 'No headings present.',
      recommendation: 'Add headings to structure the content.',
    };
  }
  const empty = headings.filter((h) => !h.text || !h.text.trim());
  if (empty.length > 0) {
    return {
      status: 'WARNING',
      severity: 'LOW',
      evidence: `${empty.length} of ${headings.length} heading(s) have no text (empty <h${empty[0].level}>).`,
      recommendation: 'Remove empty heading elements or give them descriptive text.',
    };
  }
  return {
    status: 'PASS',
    severity: 'LOW',
    evidence: `All ${headings.length} heading(s) contain text.`,
    recommendation: 'No action needed.',
  };
}

const THIN_CONTENT_FAIL_THRESHOLD = 250;
const THIN_CONTENT_WARNING_THRESHOLD = 400;

export function evaluateThinContent(wordCount: number): CheckResult {
  if (wordCount < THIN_CONTENT_FAIL_THRESHOLD) {
    return {
      status: 'FAIL',
      severity: 'MEDIUM',
      evidence: `Page has only ${wordCount} words of extracted content (below the ${THIN_CONTENT_FAIL_THRESHOLD}-word thin-content threshold).`,
      recommendation: 'Expand the page with substantive, unique content covering the topic in depth.',
    };
  }
  if (wordCount < THIN_CONTENT_WARNING_THRESHOLD) {
    return {
      status: 'WARNING',
      severity: 'LOW',
      evidence: `Page has ${wordCount} words of extracted content (below the ${THIN_CONTENT_WARNING_THRESHOLD}-word comfortable threshold).`,
      recommendation: 'Consider adding more supporting detail to strengthen topical coverage.',
    };
  }
  return {
    status: 'PASS',
    severity: 'LOW',
    evidence: `Page has ${wordCount} words of extracted content.`,
    recommendation: 'No action needed.',
  };
}

export function evaluateImageAltCoverage(images: ImageEntry[]): CheckResult {
  if (images.length === 0) {
    return {
      status: 'NOT_APPLICABLE',
      severity: 'LOW',
      evidence: 'Page has no images.',
      recommendation: 'No action needed.',
    };
  }
  const missing = images.filter((i) => !i.alt || !i.alt.trim());
  const coverage = (images.length - missing.length) / images.length;
  if (missing.length === 0) {
    return {
      status: 'PASS',
      severity: 'LOW',
      evidence: `All ${images.length} image(s) have alt text.`,
      recommendation: 'No action needed.',
    };
  }
  if (coverage >= 0.5) {
    return {
      status: 'WARNING',
      severity: 'MEDIUM',
      evidence: `${missing.length} of ${images.length} image(s) are missing alt text, e.g. "${missing[0].src}".`,
      recommendation: 'Add descriptive alt text to every content image.',
    };
  }
  return {
    status: 'FAIL',
    severity: 'MEDIUM',
    evidence: `${missing.length} of ${images.length} image(s) are missing alt text, e.g. "${missing[0].src}".`,
    recommendation: 'Add descriptive alt text to every content image so screen readers and AI crawlers can understand them.',
  };
}

// ---------------------------------------------------------------------------
// Duplicate content (word-set Jaccard similarity - cheap heuristic)
// ---------------------------------------------------------------------------

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'for', 'with', 'is', 'are', 'was',
  'were', 'be', 'been', 'this', 'that', 'it', 'as', 'at', 'by', 'from', 'we', 'you', 'your', 'our',
]);

export function normalizeToWordSet(text: string | null | undefined): Set<string> {
  if (!text) return new Set();
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
  return new Set(words);
}

export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const w of a) if (b.has(w)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export const DUPLICATE_CONTENT_SIMILARITY_THRESHOLD = 0.85;
export const DUPLICATE_CONTENT_MIN_WORDS = 50;

// ---------------------------------------------------------------------------
// Internal linking thresholds
// ---------------------------------------------------------------------------

export const LOW_OUTBOUND_LINK_THRESHOLD = 2;
export const EXCESSIVE_OUTBOUND_LINK_THRESHOLD = 150;
export const IMPORTANT_PAGE_MIN_INBOUND = 3;
export const IMPORTANT_PAGE_MIN_OUTBOUND = 2;

export function isHomepagePath(pathname: string): boolean {
  return pathname === '' || pathname === '/';
}

// ---------------------------------------------------------------------------
// Structured-data applicability heuristic
//
// We only ask "does this page look like the kind of page that SHOULD carry
// schema X" - deep validity checking of whatever JSON-LD is present is the
// Schema Analyzer's job (schema-analyzer.service.ts). The heuristic below is
// intentionally simple and documented rather than a real page classifier:
// it looks at URL path segments, the title, and heading text for a handful
// of high-signal keywords. A page can match more than one type (e.g. a
// product page nested under a category is also "breadcrumb-able").
// ---------------------------------------------------------------------------

export type ApplicableSchemaType =
  | 'Organization'
  | 'WebSite'
  | 'Article'
  | 'Product'
  | 'FAQPage'
  | 'BreadcrumbList'
  | 'LocalBusiness'
  | 'Person'
  | 'Service';

export interface PageTypeInput {
  url: string;
  normalizedUrl: string;
  title: string | null;
  headings: HeadingEntry[];
  contentText: string | null;
}

export function guessApplicableSchemaTypes(page: PageTypeInput): Set<ApplicableSchemaType> {
  const types = new Set<ApplicableSchemaType>();
  const path = safePathname(page.normalizedUrl || page.url);
  const title = (page.title ?? '').toLowerCase();
  const headingTexts = page.headings.map((h) => h.text.toLowerCase());
  const combinedShortText = `${title} ${headingTexts.join(' ')}`;
  const contentSample = (page.contentText ?? '').slice(0, 1500).toLowerCase();
  const segments = path.split('/').filter(Boolean);

  if (isHomepagePath(path)) {
    types.add('Organization');
    types.add('WebSite');
  }

  if (/\/(blog|news|articles?|posts?|insights)(\/|$)/.test(path)) {
    types.add('Article');
  }

  if (
    /\/(product|products|shop|store|item|items)(\/|$)/.test(path) ||
    /(add to cart|buy now|in stock|out of stock|sku:)/.test(combinedShortText)
  ) {
    types.add('Product');
  }

  const questionHeadings = headingTexts.filter((h) => h.trim().endsWith('?'));
  if (/faq/.test(path) || /frequently asked questions|\bfaq\b/.test(title) || questionHeadings.length >= 3) {
    types.add('FAQPage');
  }

  if (!isHomepagePath(path) && segments.length >= 2) {
    types.add('BreadcrumbList');
  }

  if (
    /\/(contact|contact-us|location|locations|store-locator|find-us)(\/|$)/.test(path) ||
    /\b\d{5}\b[^]{0,40}\b(street|st\.|avenue|ave\.|road|rd\.|suite|ste\.)\b/i.test(contentSample)
  ) {
    types.add('LocalBusiness');
  }

  if (/\/(author|team|about|bio|people|staff)(\/|$)/.test(path) || /\bauthor\b/.test(title)) {
    types.add('Person');
  }

  if (/\/(service|services|solutions)(\/|$)/.test(path)) {
    types.add('Service');
  }

  return types;
}
