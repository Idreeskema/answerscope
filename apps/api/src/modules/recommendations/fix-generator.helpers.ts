import { ImplementationType } from '@prisma/client';

/**
 * Pure, deterministic helper functions for the Automatic Fix Generator
 * (spec section 13). Nothing in this file touches Prisma/the network so it
 * can be unit-tested with plain in-memory fixtures (see
 * fix-generator.helpers.spec.ts).
 *
 * Every template here is grounded in real data already in Postgres (a
 * page's actual title/headings/contentText, a real Entity name/description,
 * the website's actual domain) - never a placeholder like "Your Company
 * Name" (docs/AGENT_BRIEF.md's "no mock data" principle, spec section 13).
 * Where content genuinely doesn't exist yet to answer a question, the
 * output is clearly marked "[NEEDS INPUT]" rather than invented.
 */

// ---------------------------------------------------------------------------
// Shared small utilities
// ---------------------------------------------------------------------------

export interface HeadingEntry {
  level: number;
  text: string;
}

export function parseHeadings(raw: unknown): HeadingEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((h): h is Record<string, unknown> => !!h && typeof h === 'object')
    .map((h) => ({
      level: typeof h.level === 'number' ? h.level : Number(h.level) || 0,
      text: typeof h.text === 'string' ? h.text.trim() : '',
    }))
    .filter((h) => h.text.length > 0);
}

const QUESTION_STARTERS = /^(what|who|why|how|is|are|does|do|can|should|which|where|will|would)\b/i;
export function isQuestionLike(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return QUESTION_STARTERS.test(t) || t.endsWith('?');
}

const SEPARATOR_CLASS = '[-|:–—]';

/** Strips a leading/trailing "Brand -/|/:" segment from a title, leaving the
 * descriptive topic phrase (same heuristic used by the query generator). */
export function stripBrandFromTitle(title: string | null | undefined, brandName: string): string | null {
  if (!title) return null;
  const brandEsc = brandName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let t = title.trim();
  t = t.replace(new RegExp(`^\\s*${brandEsc}\\s*${SEPARATOR_CLASS}\\s*`, 'i'), '');
  t = t.replace(new RegExp(`\\s*${SEPARATOR_CLASS}\\s*${brandEsc}\\s*$`, 'i'), '');
  t = t.trim();
  if (!t || t.toLowerCase() === brandName.toLowerCase()) return null;
  return t;
}

export function extractQuotedQuestion(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = text.match(/"([^"]+)"/);
  return m ? m[1] : null;
}

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'for', 'with', 'is', 'are', 'was',
  'were', 'be', 'been', 'this', 'that', 'it', 'as', 'at', 'by', 'from', 'we', 'you', 'your', 'our',
  'does', 'do', 'what', 'who', 'why', 'how', 'can', 'should', 'which', 'where',
]);

// ---------------------------------------------------------------------------
// META_TITLE (spec section 13 "Meta Title" example)
// ---------------------------------------------------------------------------

/** Composes "{topic} | {entity}", trimming the topic so the whole title
 * stays within the ~50-60 char healthy range whenever the real topic text
 * is long enough to allow it. */
export function buildMetaTitle(topic: string, entityName: string): string {
  const cleanTopic = topic.trim();
  let candidate = `${cleanTopic} | ${entityName}`;
  if (candidate.length > 60) {
    const maxTopicLen = Math.max(60 - 3 - entityName.length, 10);
    candidate = `${cleanTopic.slice(0, maxTopicLen).trim()} | ${entityName}`;
  }
  return candidate;
}

// ---------------------------------------------------------------------------
// META_DESCRIPTION
// ---------------------------------------------------------------------------

function firstNChars(text: string, n: number): string {
  if (text.length <= n) return text;
  const slice = text.slice(0, n);
  const lastSpace = slice.lastIndexOf(' ');
  const cut = lastSpace > 40 ? slice.slice(0, lastSpace) : slice;
  return `${cut.trim()}...`;
}

export function buildMetaDescription(
  contentText: string | null,
  pageTitle: string | null,
  entityName: string,
): string {
  const text = (contentText ?? '').replace(/\s+/g, ' ').trim();
  let base = text ? firstNChars(text, 157) : pageTitle ? `${pageTitle.trim()}.` : `Learn more about ${entityName}.`;
  if (!base.toLowerCase().includes(entityName.toLowerCase())) {
    base = `${entityName}: ${base}`;
  }
  return base.length > 160 ? `${base.slice(0, 157).trim()}...` : base;
}

// ---------------------------------------------------------------------------
// JSON_LD (spec section 13 "Schema" example)
// ---------------------------------------------------------------------------

export interface JsonLdContext {
  schemaType: string;
  entityName: string;
  entityDescription: string | null;
  websiteUrl: string;
  pageUrl: string | null;
  pageTitle: string | null;
}

const KNOWN_SCHEMA_TYPES = [
  'Organization',
  'WebSite',
  'Article',
  'Product',
  'FAQPage',
  'BreadcrumbList',
  'LocalBusiness',
  'Person',
  'Service',
];

export function extractSchemaTypeFromText(text: string): string {
  const match = KNOWN_SCHEMA_TYPES.find((type) => new RegExp(`\\b${type}\\b`, 'i').test(text));
  return match ?? 'Organization';
}

export function buildJsonLdFix(ctx: JsonLdContext): string {
  const type = ctx.schemaType.toLowerCase();
  const base: Record<string, unknown> = { '@context': 'https://schema.org', '@type': ctx.schemaType };

  if (type === 'organization' || type === 'localbusiness') {
    base.name = ctx.entityName;
    base.url = ctx.websiteUrl;
    if (ctx.entityDescription) base.description = ctx.entityDescription;
  } else if (type === 'website') {
    base.name = ctx.entityName;
    base.url = ctx.websiteUrl;
  } else if (type === 'product' || type === 'service') {
    base.name = ctx.pageTitle ?? ctx.entityName;
    if (ctx.entityDescription) base.description = ctx.entityDescription;
    base.brand = { '@type': 'Brand', name: ctx.entityName };
    if (ctx.pageUrl) base.url = ctx.pageUrl;
  } else if (type === 'person') {
    base.name = ctx.pageTitle ?? ctx.entityName;
    if (ctx.pageUrl) base.url = ctx.pageUrl;
  } else {
    base.name = ctx.pageTitle ?? ctx.entityName;
    if (ctx.pageUrl) base.url = ctx.pageUrl;
    if (ctx.entityDescription) base.description = ctx.entityDescription;
  }

  return JSON.stringify(base, null, 2);
}

// ---------------------------------------------------------------------------
// FAQ / ANSWER_SECTION - derive real answers from real page content
// ---------------------------------------------------------------------------

export interface DerivedAnswer {
  answer: string;
  needsInput: boolean;
}

const NEEDS_INPUT_ANSWER = '[NEEDS INPUT: no matching content was found on this page yet - a human should draft this answer.]';

/** Finds the sentence in contentText with the most keyword overlap with the
 * question. Never invents an answer: if nothing overlaps, returns a clearly
 * marked "needs input" placeholder instead. */
export function deriveAnswerFromContent(question: string, contentText: string | null): DerivedAnswer {
  if (!contentText || !contentText.trim()) return { answer: NEEDS_INPUT_ANSWER, needsInput: true };

  const keywords = question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOPWORDS.has(w));

  if (keywords.length === 0) return { answer: NEEDS_INPUT_ANSWER, needsInput: true };

  // Require at least 2 overlapping keywords whenever the question offers
  // that many - a single incidental match (e.g. the brand name appearing in
  // almost every sentence) is not enough to call a sentence "the answer".
  const requiredScore = keywords.length >= 2 ? 2 : 1;

  const sentences = contentText.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);
  let best: { sentence: string; score: number } | null = null;
  for (const s of sentences) {
    const lower = s.toLowerCase();
    const score = keywords.reduce((acc, k) => acc + (lower.includes(k) ? 1 : 0), 0);
    if (score >= requiredScore && (!best || score > best.score)) best = { sentence: s.trim(), score };
  }
  if (best) return { answer: best.sentence, needsInput: false };
  return { answer: NEEDS_INPUT_ANSWER, needsInput: true };
}

export interface FaqItem {
  question: string;
  answer: string;
  needsInput: boolean;
}

export function buildFaqFix(questions: string[], contentText: string | null): string {
  const items: FaqItem[] = questions.map((question) => {
    const { answer, needsInput } = deriveAnswerFromContent(question, contentText);
    return { question, answer, needsInput };
  });
  return JSON.stringify(items, null, 2);
}

export function buildAnswerSectionFix(question: string, contentText: string | null): string {
  const { answer, needsInput } = deriveAnswerFromContent(question, contentText);
  return `Q: ${question}\nA: ${answer}${needsInput ? ' [NEEDS INPUT]' : ''}`;
}

export function mineFallbackQuestions(headingsRaw: unknown, max = 5): string[] {
  return parseHeadings(headingsRaw)
    .map((h) => h.text)
    .filter(isQuestionLike)
    .slice(0, max);
}

// ---------------------------------------------------------------------------
// INTERNAL_LINK (spec section 13's exact required fields)
// ---------------------------------------------------------------------------

export interface InternalLinkFixInput {
  sourceUrl: string;
  targetUrl: string;
  suggestedAnchorText: string;
  reason: string;
}

export function buildInternalLinkFix(input: InternalLinkFixInput): string {
  return JSON.stringify(
    {
      sourcePage: input.sourceUrl,
      targetPage: input.targetUrl,
      suggestedAnchorText: input.suggestedAnchorText,
      reason: input.reason,
    },
    null,
    2,
  );
}

// ---------------------------------------------------------------------------
// CONTENT_UPDATE / PAGE_OUTLINE
// ---------------------------------------------------------------------------

export function buildContentUpdateFix(pageTitle: string | null, wordCount: number, gapEvidence: string): string {
  return `This page ("${pageTitle ?? 'untitled page'}") currently has ${wordCount} words. Expand it with a dedicated, substantive section that addresses: ${gapEvidence}`;
}

export function buildPageOutlineFix(headings: HeadingEntry[], gapDescription: string): string {
  const lines = headings.map((h) => `H${h.level}: ${h.text}`);
  lines.push(`H2: [NEW] ${truncateOneLine(gapDescription, 80)}`);
  return lines.join('\n');
}

function truncateOneLine(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trim()}…`;
}

// ---------------------------------------------------------------------------
// OTHER fallback
// ---------------------------------------------------------------------------

export function buildOtherFix(action: string): string {
  return action;
}

// ---------------------------------------------------------------------------
// Top-level dispatcher
// ---------------------------------------------------------------------------

export interface FixPageContext {
  title: string | null;
  metaDescription: string | null;
  headings: unknown;
  contentText: string | null;
  wordCount: number;
  url: string;
  existingRawJsonLd?: unknown;
}

export interface FixGenerationContext {
  implementationType: ImplementationType;
  recommendationTitle: string;
  recommendationCategory: string;
  recommendationEvidence: string;
  recommendationAction: string;
  entityName: string;
  entityDescription: string | null;
  websiteUrl: string;
  page: FixPageContext | null;
  /** NOT_ANSWERED / PARTIALLY_ANSWERED questions from AEOAnalysis.details
   * for this specific page, if any. */
  aeoQuestions: string[];
  /** A real candidate target page for an INTERNAL_LINK fix, if one was
   * found on this site. */
  internalLinkTarget: { url: string; title: string | null } | null;
}

export interface GeneratedFixContent {
  before: string | null;
  after: string;
}

export function generateFixContent(ctx: FixGenerationContext): GeneratedFixContent {
  switch (ctx.implementationType) {
    case 'META_TITLE': {
      const headings = parseHeadings(ctx.page?.headings);
      const h1 = headings.find((h) => h.level === 1)?.text ?? null;
      const topic =
        h1 || stripBrandFromTitle(ctx.page?.title ?? null, ctx.entityName) || ctx.page?.title || ctx.recommendationTitle;
      return { before: ctx.page?.title ?? null, after: buildMetaTitle(topic, ctx.entityName) };
    }
    case 'META_DESCRIPTION': {
      const after = buildMetaDescription(ctx.page?.contentText ?? null, ctx.page?.title ?? null, ctx.entityName);
      return { before: ctx.page?.metaDescription ?? null, after };
    }
    case 'JSON_LD': {
      const schemaType = extractSchemaTypeFromText(`${ctx.recommendationTitle} ${ctx.recommendationCategory}`);
      const after = buildJsonLdFix({
        schemaType,
        entityName: ctx.entityName,
        entityDescription: ctx.entityDescription,
        websiteUrl: ctx.websiteUrl,
        pageUrl: ctx.page?.url ?? null,
        pageTitle: ctx.page?.title ?? null,
      });
      const before = ctx.page?.existingRawJsonLd ? JSON.stringify(ctx.page.existingRawJsonLd, null, 2) : null;
      return { before, after };
    }
    case 'FAQ': {
      const questions = ctx.aeoQuestions.length > 0 ? ctx.aeoQuestions : mineFallbackQuestions(ctx.page?.headings);
      if (questions.length === 0) return { before: null, after: buildOtherFix(ctx.recommendationAction) };
      return { before: null, after: buildFaqFix(questions, ctx.page?.contentText ?? null) };
    }
    case 'ANSWER_SECTION': {
      const question =
        extractQuotedQuestion(ctx.recommendationTitle) ??
        extractQuotedQuestion(ctx.recommendationEvidence) ??
        ctx.aeoQuestions[0] ??
        null;
      if (!question) return { before: null, after: buildOtherFix(ctx.recommendationAction) };
      return { before: null, after: buildAnswerSectionFix(question, ctx.page?.contentText ?? null) };
    }
    case 'INTERNAL_LINK': {
      if (ctx.page && ctx.internalLinkTarget) {
        const anchor = ctx.internalLinkTarget.title ?? 'Learn more';
        const after = buildInternalLinkFix({
          sourceUrl: ctx.page.url,
          targetUrl: ctx.internalLinkTarget.url,
          suggestedAnchorText: anchor,
          reason: `"${ctx.page.title ?? ctx.page.url}" currently has no link to the related page "${
            ctx.internalLinkTarget.title ?? ctx.internalLinkTarget.url
          }", hurting discoverability and topical linking between the two.`,
        });
        return { before: null, after };
      }
      return { before: null, after: buildOtherFix(ctx.recommendationAction) };
    }
    case 'CONTENT_UPDATE': {
      const after = buildContentUpdateFix(ctx.page?.title ?? null, ctx.page?.wordCount ?? 0, ctx.recommendationEvidence);
      return { before: null, after };
    }
    case 'PAGE_OUTLINE': {
      const headings = parseHeadings(ctx.page?.headings);
      const before = headings.length ? headings.map((h) => `H${h.level}: ${h.text}`).join('\n') : null;
      const after = buildPageOutlineFix(headings, ctx.recommendationEvidence);
      return { before, after };
    }
    case 'OTHER':
    default:
      return { before: null, after: buildOtherFix(ctx.recommendationAction) };
  }
}
