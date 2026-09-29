/**
 * Pure, deterministic heuristics for the AEO Analyzer (spec section 7).
 * No Prisma / IO here on purpose - keeps this file trivially unit-testable
 * with plain in-memory fixtures (see aeo-heuristics.spec.ts) and guarantees
 * the "identical input -> identical output" property the scoring engine
 * relies on (spec section 21).
 *
 * No LLM is used (see docs/AGENT_BRIEF.md - no API keys configured, every
 * analyzer must be deterministic). Where the spec says "generate likely
 * user questions" / "evaluate answer completeness" we use pattern rules and
 * text-proximity heuristics instead; an LLM could replace/augment
 * `generateQuestions` and `evaluateAnswer` later without changing their
 * signatures.
 */

export interface Heading {
  level: number;
  text: string;
}

export type AnswerStatusValue = 'DIRECTLY_ANSWERED' | 'PARTIALLY_ANSWERED' | 'NOT_ANSWERED';

export interface QuestionContext {
  siteName: string;
  title: string | null;
  url: string;
  headings: Heading[];
  hasFaqJsonLd: boolean;
  isHomepage: boolean;
}

export interface AnswerEvaluation {
  status: AnswerStatusValue;
  evidence: string;
  recommendation: string;
}

/** Weights for AEOAnalysis.overallScore - mirrors spec section 14's worked
 * "Example AEO scoring" (Question Coverage 30 / Answer Directness 25 /
 * Content Structure 15 / FAQ Coverage 10 / Entity Clarity 10 / Structured
 * Data 10, summing to 100%). */
export const AEO_SCORE_WEIGHTS = {
  questionCoverage: 0.3,
  answerDirectness: 0.25,
  contentStructure: 0.15,
  faqCoverage: 0.1,
  entityClarity: 0.1,
  structuredData: 0.1,
} as const;

// ---------------------------------------------------------------------------
// URL / title helpers
// ---------------------------------------------------------------------------

export function pathOf(url: string): string {
  try {
    return new URL(url).pathname.toLowerCase();
  } catch {
    return '';
  }
}

export function isHomepagePath(url: string): boolean {
  const p = pathOf(url);
  return p === '' || p === '/';
}

/** Strips a trailing "| Site Name" / "- Site Name" suffix from a <title>. */
export function coreTitle(title: string | null | undefined): string {
  if (!title) return '';
  const parts = title.split(/\s[|\-–—]\s/);
  return parts[0].trim();
}

// ---------------------------------------------------------------------------
// Question generation (deterministic pattern rules)
// ---------------------------------------------------------------------------

const MAX_QUESTIONS = 8;
const MIN_QUESTIONS = 3;

export function generateQuestions(ctx: QuestionContext): string[] {
  const path = pathOf(ctx.url);
  const title = coreTitle(ctx.title) || ctx.siteName;
  const site = ctx.siteName;
  const headingTexts = ctx.headings.map((h) => h.text || '');
  const faqHeading = headingTexts.some((t) => /frequently asked questions|\bfaq\b/i.test(t));
  const qaHeadings = ctx.headings
    .map((h) => (h.text || '').trim())
    .filter((t) => /\?\s*$/.test(t));

  const buckets: string[][] = [];

  if (ctx.isHomepage || path === '/' || path === '') {
    buckets.push([`What is ${site}?`, `What does ${site} do?`, `Who is ${site} for?`]);
  }

  if (/pricing|plans?|\bcost\b/i.test(path) || /pricing|plans?|\bcost\b/i.test(title)) {
    buckets.push([
      `How much does ${site} cost?`,
      `What plans does ${site} offer?`,
      `Is there a free trial for ${site}?`,
    ]);
  }

  if (/how-to|guide|tutorial/i.test(path) || /^how (to|do|does)\b/i.test(title)) {
    const topic = title.replace(/^how (to|do i|does)\s*/i, '').trim() || title;
    buckets.push([
      `How do I ${topic}?`,
      `What are the steps to ${topic}?`,
      `What do I need before I ${topic}?`,
    ]);
  }

  if (faqHeading || ctx.hasFaqJsonLd) {
    if (qaHeadings.length > 0) {
      buckets.push(qaHeadings.slice(0, 5));
    } else {
      buckets.push([`What questions do customers ask about ${site}?`]);
    }
  }

  if (/product|service|solutions?/i.test(path)) {
    buckets.push([
      `What is ${title}?`,
      `Who is ${title} for?`,
      `What problem does ${title} solve?`,
    ]);
  }

  if (/about/i.test(path)) {
    buckets.push([`Who is behind ${site}?`, `What is ${site}'s mission?`, `Where is ${site} based?`]);
  }

  if (/contact/i.test(path)) {
    buckets.push([`How do I contact ${site}?`, `Where is ${site} located?`]);
  }

  if (/blog|article|news|\bpost\b/i.test(path)) {
    buckets.push([
      `What is this article about ${title}?`,
      `What are the key takeaways about ${title}?`,
    ]);
  }

  if (/\bvs\b|alternative/i.test(path) || /\bvs\b|alternative/i.test(title)) {
    buckets.push([`How does ${site} compare to alternatives?`]);
  }

  // Generic fallback - always considered last, guarantees >= MIN_QUESTIONS.
  buckets.push([`What is ${title}?`, `Why does ${title} matter?`, `What should I know about ${title}?`]);

  const seen = new Set<string>();
  const questions: string[] = [];
  for (const bucket of buckets) {
    for (const q of bucket) {
      const key = q.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      questions.push(q.trim());
      if (questions.length >= MAX_QUESTIONS) return questions;
    }
  }
  // In pathological cases (empty site/title) pad is unnecessary - the
  // generic bucket alone always yields MIN_QUESTIONS distinct strings.
  return questions;
}

// ---------------------------------------------------------------------------
// Answer detection (text-proximity heuristics against Page.contentText)
// ---------------------------------------------------------------------------

const QUESTION_STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'do', 'does', 'did', 'how', 'what', 'who', 'where', 'when', 'why',
  'i', 'you', 'your', 'yours', 'we', 'our', 'it', 'its', 'this', 'that', 'these', 'those',
  'of', 'for', 'to', 'on', 'in', 'and', 'or', 'with', 'about', 'from', 'by', 'as', 'be', 'can',
  'will', 'would', 'should', 'could', 'my', 'me', 'us', 'they', 'their', 'there', 'does',
]);

export function extractKeyTerms(question: string): string[] {
  const words = question
    .toLowerCase()
    .replace(/[?.,!'"()]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const terms = words.filter((w) => !QUESTION_STOPWORDS.has(w) && w.length > 1);
  return Array.from(new Set(terms));
}

export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Loose stem-agnostic match ("cost" <-> "costs", "plan" <-> "plans") - a
 * deliberately simple heuristic, not real stemming/lemmatization. */
function wordsMatch(word: string, term: string): boolean {
  if (word === term) return true;
  if (Math.min(word.length, term.length) < 3) return false;
  return word.startsWith(term) || term.startsWith(word);
}

function matchedTerms(sentence: string, terms: string[]): string[] {
  const words = sentence
    .toLowerCase()
    .replace(/[?.,!'"()]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  return terms.filter((t) => words.some((w) => wordsMatch(w, t)));
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;
}

// Number/currency/percent, or a definitional/step phrase - a proxy for
// "answer-shaped" content (concise, concrete, extractable by an answer engine).
const ANSWER_SHAPE_RE =
  /\$\s?\d|\d+(\.\d+)?\s?%|\b\d{2,}\b|\bis a\b|\bis an\b|\bis the\b|\brefers to\b|\bmeans\b|\bincludes?\b|:\s|\bstep\s?\d|\bfor example\b|\bfirst,/i;

const EARLY_SENTENCE_CUTOFF = 4;
const DIRECT_MATCH_THRESHOLD = 0.6;
const PARTIAL_MATCH_THRESHOLD = 0.4;

export function evaluateAnswer(
  question: string,
  contentText: string | null | undefined,
  wordCount: number,
): AnswerEvaluation {
  const terms = extractKeyTerms(question);
  const text = (contentText || '').trim();

  if (!text || terms.length === 0) {
    return {
      status: 'NOT_ANSWERED',
      evidence: `Page has no extracted body text (wordCount ${wordCount}); there is no content to answer "${question}".`,
      recommendation: `Add a concise, direct answer to "${question}" near the top of the page - the page currently has no analyzable body text.`,
    };
  }

  const sentences = splitSentences(text);

  // Pass 1: an early, concise, answer-shaped sentence covering most terms.
  for (let i = 0; i < sentences.length && i < EARLY_SENTENCE_CUTOFF; i++) {
    const sentence = sentences[i];
    const matched = matchedTerms(sentence, terms);
    const ratio = matched.length / terms.length;
    if (ratio >= DIRECT_MATCH_THRESHOLD && ANSWER_SHAPE_RE.test(sentence)) {
      return {
        status: 'DIRECTLY_ANSWERED',
        evidence: `Sentence ${i + 1} of ${sentences.length} (early in the page) directly addresses this: "${truncate(sentence, 220)}"`,
        recommendation: `Keep this section near the top of the page - it already gives a concise, direct answer to "${question}".`,
      };
    }
  }

  // Pass 2: related content anywhere in the page, but not concise/early.
  let best: { index: number; ratio: number; sentence: string; matched: string[] } | null = null;
  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];
    const matched = matchedTerms(sentence, terms);
    const ratio = matched.length / terms.length;
    if (ratio >= PARTIAL_MATCH_THRESHOLD && (!best || ratio > best.ratio)) {
      best = { index: i, ratio, sentence, matched };
    }
  }

  if (best) {
    return {
      status: 'PARTIALLY_ANSWERED',
      evidence: `Related content exists at sentence ${best.index + 1} of ${sentences.length}: "${truncate(best.sentence, 220)}" - mentions ${best.matched.join(', ')} but is not a concise, early, direct answer.`,
      recommendation: `Add a concise 1-2 sentence direct answer to "${question}" near the top of the page - related content exists further down but isn't stated clearly or early enough for an answer engine to extract.`,
    };
  }

  return {
    status: 'NOT_ANSWERED',
    evidence: `None of the ${sentences.length} sentence(s) on this page (${wordCount} words) mention ${terms.slice(0, 6).join(', ')}.`,
    recommendation: `Add a short, direct answer to "${question}" near the top of the page - no related content was found anywhere on the page.`,
  };
}

// ---------------------------------------------------------------------------
// Sub-score heuristics
// ---------------------------------------------------------------------------

const LIST_PATTERN_RE = /(^|\n)\s*([-*•]|\d+[.)])\s+\S/m;

/** Heading hierarchy + list usage - "Content Structure" (spec section 7/14). */
export function computeContentStructureScore(headings: Heading[], contentText: string | null | undefined): number {
  if (!headings || headings.length === 0) return 0;

  const h1Count = headings.filter((h) => h.level === 1).length;
  const singleH1Points = h1Count === 1 ? 30 : h1Count > 1 ? 10 : 0;
  const depthPoints = Math.min(30, Math.max(0, headings.length - 1) * 5);

  let jumps = 0;
  for (let i = 1; i < headings.length; i++) {
    if (headings[i].level - headings[i - 1].level > 1) jumps++;
  }
  const hierarchyPoints = jumps === 0 ? 20 : jumps <= 2 ? 10 : 0;

  const listPoints = LIST_PATTERN_RE.test(contentText || '') ? 20 : 0;

  return Math.min(100, singleH1Points + depthPoints + hierarchyPoints + listPoints);
}

/** FAQ-shaped headings / FAQPage JSON-LD - "FAQ Coverage" (spec section 7/14). */
export function computeFaqCoverageScore(headings: Heading[], hasFaqJsonLd: boolean): number {
  const faqHeading = headings.some((h) => /frequently asked questions|\bfaq\b/i.test(h.text || ''));
  const qaHeadingCount = headings.filter((h) => /\?\s*$/.test((h.text || '').trim())).length;

  if (hasFaqJsonLd && faqHeading) return 100;
  if (hasFaqJsonLd || (faqHeading && qaHeadingCount >= 2)) return 70;
  if (faqHeading || qaHeadingCount >= 2) return 45;
  if (qaHeadingCount === 1) return 20;
  return 0;
}

/** Entity rows tied to this page - "Entity Clarity" (spec section 7/14). */
export function computeEntityClarityScore(entities: { confidence: number }[]): number {
  if (entities.length === 0) return 0;
  const avgConfidence = entities.reduce((s, e) => s + e.confidence, 0) / entities.length; // 0-1
  const countPoints = Math.min(60, entities.length * 30);
  const confidencePoints = avgConfidence * 40;
  return Math.min(100, Math.round(countPoints + confidencePoints));
}

/** SchemaAnalysis rows tied to this page - "Structured Data" (spec section 7/14). */
export function computeStructuredDataScore(schemaRows: { isValid: boolean }[], jsonLdBlockCount: number): number {
  if (schemaRows.length > 0) {
    const validRatio = schemaRows.filter((s) => s.isValid).length / schemaRows.length;
    return Math.round(validRatio * 100);
  }
  // No SchemaAnalysis rows yet (schema analyzer may not have run) - give
  // partial, unvalidated credit for raw JSON-LD presence rather than 0.
  if (jsonLdBlockCount > 0) return 40;
  return 0;
}
