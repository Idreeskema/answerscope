/**
 * Pure, deterministic helper functions for the Content Analyzer (Milestone 4
 * "Content Analyzer" piece). No Prisma/network access here so these can be
 * unit-tested with plain strings.
 *
 * ---------------------------------------------------------------------------
 * Heuristics/thresholds used (documented once, here):
 * - Paragraphs: Page.contentText is assumed to join extracted paragraphs
 *   with newlines (the crawler's ExtractedPage.contentText comment says
 *   "extracted visible text (paragraphs joined)"). We split on one-or-more
 *   newlines and count non-empty, non-whitespace lines. If the text has no
 *   newlines at all (single blob), it counts as exactly one paragraph. This
 *   is a documented assumption/limitation - if the crawler ends up joining
 *   paragraphs differently, paragraphCount degrades gracefully to 1.
 * - Sentences: split on `.`, `!`, `?` followed by whitespace/end-of-string,
 *   a standard, cheap approximation (does not special-case abbreviations
 *   like "Mr." - acceptable for a readability estimate, not legal parsing).
 * - Readability: standard Flesch Reading Ease formula, computed from our
 *   own word/sentence/syllable counts (no external dependency):
 *     206.835 - 1.015*(words/sentences) - 84.6*(syllables/words)
 *   Syllables are estimated by counting vowel-groups per word (a common,
 *   simple English heuristic), which is accurate enough for a directional
 *   readability signal, not a precise linguistic analysis.
 * - Thin content: wordCount < 250, matching the Technical SEO Analyzer's
 *   thin-content FAIL threshold (see technical-seo.helpers.ts) so the two
 *   modules agree on what "thin" means.
 * - Duplicate content: same word-set Jaccard similarity heuristic used by
 *   the Technical SEO Analyzer (threshold 0.85), applied here to decide
 *   ContentAnalysis.duplicateOfPageId. Kept as an independent small copy
 *   rather than a cross-module import, since technical-seo/ and content/
 *   are being built by the same agent but are conceptually separate
 *   modules; either would be a "reasonable heuristic, don't over-engineer"
 *   per the agent brief.
 * - Topics: simple frequency-based keyword extraction over headings +
 *   contentText (unigrams and bigrams, stopwords removed, headings counted
 *   with extra weight since they signal what the page is "about"). No LLM.
 * ---------------------------------------------------------------------------
 */

export interface HeadingLike {
  level: number;
  text: string;
}

export const THIN_CONTENT_WORD_THRESHOLD = 250;
export const DUPLICATE_CONTENT_SIMILARITY_THRESHOLD = 0.85;
export const DUPLICATE_CONTENT_MIN_WORDS = 50;

export function countParagraphs(contentText: string | null | undefined): number {
  const text = (contentText ?? '').trim();
  if (!text) return 0;
  if (!text.includes('\n')) return 1;
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0).length;
}

const SENTENCE_SPLIT_RE = /[.!?]+(?:\s+|$)/;

export function splitSentences(text: string): string[] {
  return text
    .split(SENTENCE_SPLIT_RE)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function splitWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0);
}

export function computeAvgSentenceLength(text: string | null | undefined): number {
  const t = (text ?? '').trim();
  if (!t) return 0;
  const sentences = splitSentences(t);
  const words = splitWords(t);
  if (sentences.length === 0) return words.length;
  return Math.round((words.length / sentences.length) * 10) / 10;
}

function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  const groups = w.match(/[aeiouy]+/g);
  let count = groups ? groups.length : 0;
  if (w.endsWith('e') && !w.endsWith('le') && count > 1) count--;
  return Math.max(count, 1);
}

/**
 * Standard Flesch Reading Ease formula (higher = easier to read). Returns
 * null when there isn't enough text to compute a meaningful score.
 */
export function fleschReadingEase(text: string | null | undefined): number | null {
  const t = (text ?? '').trim();
  if (!t) return null;
  const words = splitWords(t);
  const sentences = splitSentences(t);
  if (words.length === 0 || sentences.length === 0) return null;
  const syllables = words.reduce((sum, w) => sum + countSyllables(w), 0);
  const score = 206.835 - 1.015 * (words.length / sentences.length) - 84.6 * (syllables / words.length);
  // Clamp to the conventional 0-100 display range; the raw formula can go
  // slightly outside it for unusual text.
  return Math.round(Math.max(0, Math.min(100, score)) * 10) / 10;
}

export function isThinContent(wordCount: number): boolean {
  return wordCount < THIN_CONTENT_WORD_THRESHOLD;
}

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'for', 'with', 'is', 'are', 'was',
  'were', 'be', 'been', 'being', 'this', 'that', 'these', 'those', 'it', 'its', 'as', 'at', 'by',
  'from', 'we', 'you', 'your', 'our', 'they', 'their', 'i', 'he', 'she', 'his', 'her', 'them', 'us',
  'not', 'no', 'so', 'if', 'then', 'than', 'also', 'can', 'will', 'would', 'should', 'could', 'about',
  'into', 'up', 'out', 'over', 'under', 'more', 'most', 'some', 'any', 'all', 'each', 'other', 'such',
  'what', 'which', 'who', 'when', 'where', 'why', 'how', 'do', 'does', 'did', 'have', 'has', 'had',
  'get', 'got', 'just', 'like', 'make', 'may', 'must', 'need', 'one', 'two', 'per', 'used', 'using',
]);

export function normalizeToWordSet(text: string | null | undefined): Set<string> {
  const words = splitWords(text ?? '').filter((w) => w.length > 2 && !STOPWORDS.has(w));
  return new Set(words);
}

export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const w of a) if (b.has(w)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Simple frequency-based topic/keyword extraction. Counts unigrams and
 * bigrams across contentText, weighting heading words more heavily (they
 * are a strong topical signal), removes stopwords, and returns the top N
 * distinct terms by weighted frequency. Deterministic, no LLM.
 */
export function extractTopics(headings: HeadingLike[], contentText: string | null | undefined, topN = 8): string[] {
  const counts = new Map<string, number>();

  const addTerms = (text: string, weight: number) => {
    const words = splitWords(text).filter((w) => w.length > 2 && !STOPWORDS.has(w));
    for (const w of words) {
      counts.set(w, (counts.get(w) ?? 0) + weight);
    }
    for (let i = 0; i < words.length - 1; i++) {
      const bigram = `${words[i]} ${words[i + 1]}`;
      counts.set(bigram, (counts.get(bigram) ?? 0) + weight);
    }
  };

  for (const h of headings) {
    if (h.text) addTerms(h.text, 3);
  }
  if (contentText) addTerms(contentText, 1);

  return [...counts.entries()]
    .filter(([term, count]) => count >= 2 || term.includes(' '))
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([term]) => term);
}
