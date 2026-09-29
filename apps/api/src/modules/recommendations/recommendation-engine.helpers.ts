import { ImplementationType, Severity } from '@prisma/client';

/**
 * Pure, deterministic helper functions for the Recommendation Engine (spec
 * section 12). Nothing in this file touches Prisma/the network so it can be
 * unit-tested with plain in-memory fixtures (see
 * recommendation-engine.helpers.spec.ts).
 *
 * Every function here operates on one *real, already-persisted* finding
 * (a failing SEOCheck, an unanswered AEO question, a named GEO gap, an
 * invalid/missing SchemaAnalysis row) and turns it into a
 * RecommendationInput. Nothing here invents a finding - see
 * docs/AGENT_BRIEF.md's "no arbitrary recommendations / no mock data"
 * principle and spec section 12: "Do not create arbitrary recommendations."
 */

export interface RecommendationInput {
  title: string;
  category: string;
  severity: Severity;
  impact: number;
  effort: number;
  confidence: number;
  priority: number;
  evidence: string;
  explanation: string;
  action: string;
  example: string | null;
  affectedUrl: string | null;
  implementationType: ImplementationType;
}

// ---------------------------------------------------------------------------
// Shared scoring helpers
// ---------------------------------------------------------------------------

export function severityToImpact(severity: Severity): number {
  switch (severity) {
    case 'CRITICAL':
      return 9;
    case 'HIGH':
      return 7;
    case 'MEDIUM':
      return 5;
    case 'LOW':
      return 3;
    default:
      return 5;
  }
}

export const EFFORT_BY_IMPLEMENTATION_TYPE: Record<ImplementationType, number> = {
  META_TITLE: 2,
  META_DESCRIPTION: 2,
  JSON_LD: 4,
  FAQ: 5,
  ANSWER_SECTION: 4,
  INTERNAL_LINK: 3,
  CONTENT_UPDATE: 6,
  PAGE_OUTLINE: 5,
  OTHER: 4,
};

/** Priority = Impact x Confidence / Effort (spec section 12's exact
 * formula). Rounded to 4 decimal places purely to avoid floating point
 * noise (e.g. 2.9999999999996) - never to change the underlying math. */
export function computePriority(impact: number, confidence: number, effort: number): number {
  const raw = (impact * confidence) / effort;
  return Math.round(raw * 10000) / 10000;
}

/** Infers the closest ImplementationType enum member from free-text (a
 * SEOCheck's checkId/category/recommendation, or a GEO gap's description) -
 * keyword-matched so it stays correct regardless of the exact slug
 * conventions the sibling analyzer modules end up using. */
export function inferImplementationType(text: string): ImplementationType {
  const t = text.toLowerCase();
  if (/\btitle\b/.test(t)) return 'META_TITLE';
  if (/\b(meta description|description)\b/.test(t)) return 'META_DESCRIPTION';
  if (/\b(schema|json-?ld|structured data)\b/.test(t)) return 'JSON_LD';
  if (/\bfaq\b/.test(t)) return 'FAQ';
  if (/\banswer\b/.test(t)) return 'ANSWER_SECTION';
  if (/\b(internal link|inbound link|outbound link|\blinks?\b)\b/.test(t)) return 'INTERNAL_LINK';
  if (/\b(heading|h1|outline|hierarchy)\b/.test(t)) return 'PAGE_OUTLINE';
  if (/\b(content|word count|thin content|duplicate)\b/.test(t)) return 'CONTENT_UPDATE';
  return 'OTHER';
}

export function humanizeSlug(slug: string): string {
  return slug
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\w/, (c) => c.toUpperCase());
}

export function truncate(text: string, max: number): string {
  const t = text.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trim()}…`;
}

// ---------------------------------------------------------------------------
// SEOCheck -> Recommendation
// ---------------------------------------------------------------------------

export interface SeoCheckLike {
  id: string;
  pageId: string | null;
  checkId: string;
  category: string;
  status: string;
  severity: Severity;
  evidence: string;
  recommendation: string;
  pageUrl: string | null;
}

const SEO_CHECK_CONFIDENCE = 0.9;
const AGGREGATED_SEO_CHECK_CONFIDENCE = 0.85;

/** A single, page-specific SEOCheck failure becomes one Recommendation. */
export function buildRecommendationFromSeoCheck(check: SeoCheckLike): RecommendationInput {
  const implementationType = inferImplementationType(`${check.checkId} ${check.category} ${check.recommendation}`);
  const impact = severityToImpact(check.severity);
  const effort = EFFORT_BY_IMPLEMENTATION_TYPE[implementationType];
  const confidence = SEO_CHECK_CONFIDENCE;
  return {
    title: truncate(check.recommendation || humanizeSlug(check.checkId), 100),
    category: check.category,
    severity: check.severity,
    impact,
    effort,
    confidence,
    priority: computePriority(impact, confidence, effort),
    evidence: check.evidence,
    explanation: `Automated technical SEO check "${check.checkId}" (${check.category}) returned ${check.status} with ${check.severity} severity: ${check.evidence}`,
    action: check.recommendation,
    example: null,
    affectedUrl: check.pageUrl,
    implementationType,
  };
}

const SEVERITY_RANK: Record<Severity, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };

function worstSeverity(checks: SeoCheckLike[]): Severity {
  return checks.reduce<Severity>((worst, c) => (SEVERITY_RANK[c.severity] > SEVERITY_RANK[worst] ? c.severity : worst), 'LOW');
}

/** When the same checkId fails across many pages (e.g. "missing alt text" on
 * 40 images across a site), roll it up into ONE site-wide recommendation
 * with an aggregated evidence count instead of one row per page - per
 * docs/AGENT_BRIEF.md's dedupe guidance. */
export function buildAggregatedRecommendationFromSeoChecks(checkId: string, checks: SeoCheckLike[]): RecommendationInput {
  const first = checks[0];
  const distinctPages = new Set(checks.map((c) => c.pageId ?? 'sitewide'));
  const severity = worstSeverity(checks);
  const implementationType = inferImplementationType(`${first.checkId} ${first.category} ${first.recommendation}`);
  const impact = Math.min(10, severityToImpact(severity) + 1);
  const effort = EFFORT_BY_IMPLEMENTATION_TYPE[implementationType];
  const confidence = AGGREGATED_SEO_CHECK_CONFIDENCE;
  const examples = checks.slice(0, 3).map((c) => `"${c.evidence}"${c.pageUrl ? ` (${c.pageUrl})` : ''}`);
  const moreCount = checks.length - examples.length;
  return {
    title: `${truncate(first.recommendation || humanizeSlug(checkId), 70)} (${distinctPages.size} pages affected)`,
    category: first.category,
    severity,
    impact,
    effort,
    confidence,
    priority: computePriority(impact, confidence, effort),
    evidence: `Detected on ${distinctPages.size} distinct pages (${checks.length} occurrences), e.g.: ${examples.join('; ')}${moreCount > 0 ? ` [+${moreCount} more]` : ''}`,
    explanation: `Automated technical SEO check "${checkId}" (${first.category}) failed on ${distinctPages.size} pages across this site, worst severity ${severity}.`,
    action: first.recommendation,
    example: null,
    affectedUrl: null,
    implementationType,
  };
}

/** Groups failing SEOChecks by checkId and decides, per group, whether to
 * emit one recommendation per page (small groups) or a single aggregated
 * site-wide recommendation (3+ distinct pages). */
export function buildRecommendationsFromSeoChecks(checks: SeoCheckLike[]): RecommendationInput[] {
  const byCheckId = new Map<string, SeoCheckLike[]>();
  for (const c of checks) {
    const arr = byCheckId.get(c.checkId) ?? [];
    arr.push(c);
    byCheckId.set(c.checkId, arr);
  }
  const out: RecommendationInput[] = [];
  for (const [checkId, group] of byCheckId) {
    const distinctPages = new Set(group.map((c) => c.pageId ?? 'sitewide'));
    if (distinctPages.size <= 2) {
      for (const check of group) out.push(buildRecommendationFromSeoCheck(check));
    } else {
      out.push(buildAggregatedRecommendationFromSeoChecks(checkId, group));
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// AEOAnalysis.details.questions -> Recommendation
// ---------------------------------------------------------------------------

export interface AeoQuestionEntry {
  question: string;
  status: string; // AnswerStatus
  evidence?: string;
  recommendation?: string;
}

export interface AeoAnalysisLike {
  id: string;
  pageId: string;
  pageUrl: string | null;
  details: unknown;
}

const AEO_CONFIDENCE = 0.75;
const AGGREGATED_AEO_CONFIDENCE = 0.7;
const AEO_MIN_PAGES_TO_AGGREGATE = 3;

export function parseAeoQuestions(details: unknown): AeoQuestionEntry[] {
  if (!details || typeof details !== 'object') return [];
  const raw = (details as Record<string, unknown>).questions;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((q): q is Record<string, unknown> => !!q && typeof q === 'object')
    .map((q) => ({
      question: typeof q.question === 'string' ? q.question : '',
      status: typeof q.status === 'string' ? q.status : '',
      evidence: typeof q.evidence === 'string' ? q.evidence : undefined,
      recommendation: typeof q.recommendation === 'string' ? q.recommendation : undefined,
    }))
    .filter((q) => q.question.length > 0);
}

function aeoSeverityFor(status: string): Severity {
  return status === 'NOT_ANSWERED' ? 'HIGH' : 'MEDIUM';
}

export function buildRecommendationFromAeoQuestion(
  page: { pageUrl: string | null },
  entry: AeoQuestionEntry,
): RecommendationInput {
  const severity = aeoSeverityFor(entry.status);
  const impact = entry.status === 'NOT_ANSWERED' ? 8 : 5;
  const effort = EFFORT_BY_IMPLEMENTATION_TYPE.ANSWER_SECTION;
  const confidence = AEO_CONFIDENCE;
  const isNotAnswered = entry.status === 'NOT_ANSWERED';
  return {
    title: truncate(`Directly answer "${entry.question}"${page.pageUrl ? ' on this page' : ''}`, 100),
    category: 'AEO',
    severity,
    impact,
    effort,
    confidence,
    priority: computePriority(impact, confidence, effort),
    evidence: entry.evidence ?? `Question "${entry.question}" was ${entry.status.toLowerCase().replace('_', ' ')} on this page.`,
    explanation: `AI answer engines look for a direct, concise answer to "${entry.question}" within the first few hundred words. This page currently ${
      isNotAnswered ? 'does not answer it at all' : 'only partially answers it'
    }.`,
    action:
      entry.recommendation ??
      `Add a concise 2-3 sentence answer to "${entry.question}" near the top of the page, then expand with supporting detail below.`,
    example: `Missing Answer example: Q: "${entry.question}" -> A: [concise 2-3 sentence direct answer, expanded below with supporting detail].`,
    affectedUrl: page.pageUrl,
    implementationType: 'ANSWER_SECTION',
  };
}

export function buildAggregatedRecommendationFromAeoQuestion(
  question: string,
  entries: { pageUrl: string | null; entry: AeoQuestionEntry }[],
): RecommendationInput {
  const worstStatus = entries.some((e) => e.entry.status === 'NOT_ANSWERED') ? 'NOT_ANSWERED' : 'PARTIALLY_ANSWERED';
  const severity = aeoSeverityFor(worstStatus);
  const impact = Math.min(10, (worstStatus === 'NOT_ANSWERED' ? 8 : 5) + 1);
  const effort = EFFORT_BY_IMPLEMENTATION_TYPE.ANSWER_SECTION;
  const confidence = AGGREGATED_AEO_CONFIDENCE;
  const urls = entries.map((e) => e.pageUrl).filter((u): u is string => !!u).slice(0, 3);
  return {
    title: truncate(`Directly answer "${question}" (missing on ${entries.length} pages)`, 100),
    category: 'AEO',
    severity,
    impact,
    effort,
    confidence,
    priority: computePriority(impact, confidence, effort),
    evidence: `"${question}" is unanswered or only partially answered on ${entries.length} pages${urls.length ? `, e.g.: ${urls.join(', ')}` : ''}.`,
    explanation: `The same question "${question}" is not directly answered across multiple pages on this site, suggesting a sitewide FAQ/answer gap.`,
    action: `Add a shared, concise answer to "${question}" (e.g. in a sitewide FAQ section) and link to it from the affected pages.`,
    example: `Missing Answer example: Q: "${question}" -> A: [concise 2-3 sentence direct answer].`,
    affectedUrl: urls[0] ?? null,
    implementationType: 'ANSWER_SECTION',
  };
}

/** Builds one Recommendation per NOT_ANSWERED/PARTIALLY_ANSWERED AEO
 * question, aggregating the same question text across >=3 pages into a
 * single sitewide recommendation (same dedupe principle as the SEOCheck
 * rollup above). */
export function buildRecommendationsFromAeoAnalyses(analyses: AeoAnalysisLike[]): RecommendationInput[] {
  const byQuestion = new Map<string, { pageUrl: string | null; entry: AeoQuestionEntry }[]>();
  for (const analysis of analyses) {
    const questions = parseAeoQuestions(analysis.details).filter(
      (q) => q.status === 'NOT_ANSWERED' || q.status === 'PARTIALLY_ANSWERED',
    );
    for (const q of questions) {
      const key = q.question.trim().toLowerCase();
      const arr = byQuestion.get(key) ?? [];
      arr.push({ pageUrl: analysis.pageUrl, entry: q });
      byQuestion.set(key, arr);
    }
  }
  const out: RecommendationInput[] = [];
  for (const entries of byQuestion.values()) {
    if (entries.length >= AEO_MIN_PAGES_TO_AGGREGATE) {
      out.push(buildAggregatedRecommendationFromAeoQuestion(entries[0].entry.question, entries));
    } else {
      for (const e of entries) out.push(buildRecommendationFromAeoQuestion({ pageUrl: e.pageUrl }, e.entry));
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// GEOAnalysis.details gaps -> Recommendation
// ---------------------------------------------------------------------------

export interface GeoGapEntry {
  category?: string;
  description: string;
  evidence?: string;
  severity?: string;
  affectedUrl?: string;
  recommendation?: string;
}

const GEO_CONFIDENCE = 0.7;

/**
 * The GEO analyzer (spec section 8) is being built concurrently by another
 * agent and, at the time of writing, its `details` JSON shape is not yet
 * fixed by anything other than this repo's own doc-comments (unlike
 * AEOAnalysis.details, whose `{ questions: [...] }` shape IS documented
 * inline in schema.prisma). We defensively look for a `gaps` array (or the
 * common alternates `findings`/`issues`) and silently produce zero
 * GEO-derived recommendations if neither shape is present, rather than
 * crash - see the final report's "known limitations" section.
 */
export function parseGeoGaps(details: unknown): GeoGapEntry[] {
  if (!details || typeof details !== 'object') return [];
  const record = details as Record<string, unknown>;
  const raw = record.gaps ?? record.findings ?? record.issues;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((g): g is Record<string, unknown> => !!g && typeof g === 'object')
    .map((g) => ({
      category: typeof g.category === 'string' ? g.category : undefined,
      description: typeof g.description === 'string' ? g.description : '',
      evidence: typeof g.evidence === 'string' ? g.evidence : undefined,
      severity: typeof g.severity === 'string' ? g.severity : undefined,
      affectedUrl: typeof g.affectedUrl === 'string' ? g.affectedUrl : undefined,
      recommendation: typeof g.recommendation === 'string' ? g.recommendation : undefined,
    }))
    .filter((g) => g.description.length > 0);
}

function coerceSeverity(value: string | undefined): Severity {
  if (value === 'CRITICAL' || value === 'HIGH' || value === 'MEDIUM' || value === 'LOW') return value;
  return 'MEDIUM';
}

export function buildRecommendationFromGeoGap(gap: GeoGapEntry): RecommendationInput {
  const severity = coerceSeverity(gap.severity);
  const category = gap.category ?? 'GEO';
  const implementationType = inferImplementationType(`${category} ${gap.description}`);
  const impact = severityToImpact(severity);
  const effort = EFFORT_BY_IMPLEMENTATION_TYPE[implementationType];
  const confidence = GEO_CONFIDENCE;
  return {
    title: truncate(gap.description, 100),
    category,
    severity,
    impact,
    effort,
    confidence,
    priority: computePriority(impact, confidence, effort),
    evidence: gap.evidence ?? gap.description,
    explanation: `GEO (AI Search Readiness) analysis identified a gap in ${category}: ${gap.description}`,
    action: gap.recommendation ?? `Address the ${category} gap: ${gap.description}`,
    example: null,
    affectedUrl: gap.affectedUrl ?? null,
    implementationType,
  };
}

export function buildRecommendationsFromGeoAnalysis(details: unknown): RecommendationInput[] {
  return parseGeoGaps(details).map(buildRecommendationFromGeoGap);
}

// ---------------------------------------------------------------------------
// SchemaAnalysis -> Recommendation
// ---------------------------------------------------------------------------

export interface SchemaAnalysisLike {
  id: string;
  pageId: string;
  pageUrl: string | null;
  schemaType: string;
  isValid: boolean;
  errors: unknown;
}

const SCHEMA_CONFIDENCE = 0.9;
const AGGREGATED_SCHEMA_CONFIDENCE = 0.85;

function summarizeErrors(errors: unknown): string {
  if (!errors) return 'schema.org required properties are missing.';
  if (Array.isArray(errors)) return errors.map((e) => (typeof e === 'string' ? e : JSON.stringify(e))).join('; ');
  if (typeof errors === 'string') return errors;
  return JSON.stringify(errors);
}

export function buildRecommendationFromInvalidSchema(schema: SchemaAnalysisLike): RecommendationInput {
  const errorSummary = summarizeErrors(schema.errors);
  const severity: Severity = 'MEDIUM';
  const impact = severityToImpact(severity);
  const effort = EFFORT_BY_IMPLEMENTATION_TYPE.JSON_LD;
  const confidence = SCHEMA_CONFIDENCE;
  return {
    title: `Fix invalid ${schema.schemaType} structured data`,
    category: 'Structured Data',
    severity,
    impact,
    effort,
    confidence,
    priority: computePriority(impact, confidence, effort),
    evidence: `${schema.schemaType} JSON-LD on this page failed validation: ${errorSummary}`,
    explanation: `The ${schema.schemaType} JSON-LD block on this page does not satisfy schema.org's required properties, so search/AI engines cannot reliably parse it.`,
    action: `Fix the reported errors in the ${schema.schemaType} JSON-LD block: ${errorSummary}`,
    example: null,
    affectedUrl: schema.pageUrl,
    implementationType: 'JSON_LD',
  };
}

/** Spec section 12's own worked example: recommend adding Organization
 * schema when none was detected anywhere in the audit's crawled pages. */
export function buildOrganizationSchemaGapRecommendation(
  homepageUrl: string,
  schemaTypesFound: string[],
): RecommendationInput {
  const severity: Severity = 'HIGH';
  const impact = severityToImpact(severity);
  const effort = EFFORT_BY_IMPLEMENTATION_TYPE.JSON_LD;
  const confidence = 0.85;
  const evidence =
    schemaTypesFound.length > 0
      ? `No Organization schema was detected. Structured data types found on this site: ${schemaTypesFound.join(', ')}.`
      : 'No structured data (JSON-LD) of any type was detected on any crawled page of this audit.';
  return {
    title: 'Add Organization structured data',
    category: 'Structured Data',
    severity,
    impact,
    effort,
    confidence,
    priority: computePriority(impact, confidence, effort),
    evidence,
    explanation: 'Improves machine-readable entity understanding for search engines and AI answer engines.',
    action: 'Provide a valid Organization JSON-LD block on the homepage naming the business, its URL, and (if available) logo/sameAs links.',
    example:
      'Why: No Organization schema was detected.\nImpact: Improves machine-readable entity understanding.\nSuggested implementation: Provide valid JSON-LD.',
    affectedUrl: homepageUrl,
    implementationType: 'JSON_LD',
  };
}

export function buildRecommendationsFromSchemaAnalyses(analyses: SchemaAnalysisLike[]): RecommendationInput[] {
  const invalid = analyses.filter((a) => !a.isValid);
  const byType = new Map<string, SchemaAnalysisLike[]>();
  for (const a of invalid) {
    const arr = byType.get(a.schemaType) ?? [];
    arr.push(a);
    byType.set(a.schemaType, arr);
  }
  const out: RecommendationInput[] = [];
  for (const [schemaType, group] of byType) {
    const distinctPages = new Set(group.map((g) => g.pageId));
    if (distinctPages.size <= 2) {
      for (const s of group) out.push(buildRecommendationFromInvalidSchema(s));
    } else {
      const first = group[0];
      const severity: Severity = 'MEDIUM';
      const impact = Math.min(10, severityToImpact(severity) + 1);
      const effort = EFFORT_BY_IMPLEMENTATION_TYPE.JSON_LD;
      const confidence = AGGREGATED_SCHEMA_CONFIDENCE;
      const examples = group.slice(0, 3).map((g) => `${g.pageUrl ?? g.pageId}: ${summarizeErrors(g.errors)}`);
      out.push({
        title: `Fix invalid ${schemaType} structured data (${distinctPages.size} pages affected)`,
        category: 'Structured Data',
        severity,
        impact,
        effort,
        confidence,
        priority: computePriority(impact, confidence, effort),
        evidence: `${schemaType} JSON-LD fails validation on ${distinctPages.size} pages, e.g.: ${examples.join('; ')}`,
        explanation: `The ${schemaType} JSON-LD block fails schema.org validation on multiple pages across this site.`,
        action: `Fix the reported errors in every ${schemaType} JSON-LD block: ${summarizeErrors(first.errors)}`,
        example: null,
        affectedUrl: null,
        implementationType: 'JSON_LD',
      });
    }
  }
  return out;
}
