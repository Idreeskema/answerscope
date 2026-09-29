import { EntityType } from '@prisma/client';

/**
 * Pure, deterministic helper functions for the AI Query Generation Engine
 * (spec section 9). Nothing in this file touches Prisma/the network so it
 * can be unit-tested with plain in-memory fixtures (see
 * query-generation.helpers.spec.ts).
 *
 * Design principle (spec section 9 + docs/AGENT_BRIEF.md "no arbitrary
 * recommendations / no mock data"): every generated query must be traceable
 * to something real - a page's title/heading/contentText, or a real Entity
 * row. When a category's grounding signal isn't present on the site (e.g.
 * no LOCATION entity for "local" queries, no "for X" audience phrase for
 * "industry" queries), that category is simply skipped for this site rather
 * than filled with an invented placeholder.
 */

// ---------------------------------------------------------------------------
// Input shapes (structurally compatible with the relevant Prisma models -
// callers pass `prisma.page.findMany(...)` / `prisma.entity.findMany(...)`
// results directly).
// ---------------------------------------------------------------------------

export interface HeadingEntry {
  level: number;
  text: string;
}

export interface PageLike {
  id: string;
  url: string;
  normalizedUrl: string;
  title: string | null;
  metaDescription: string | null;
  headings: unknown;
  contentText: string | null;
  wordCount: number;
}

export interface EntityLike {
  id: string;
  name: string;
  type: EntityType | string;
  description: string | null;
  confidence: number;
  sourcePageId: string | null;
}

export interface WebsiteLike {
  domain: string;
  name: string | null;
}

export interface QueryCandidate {
  query: string;
  intent: string;
  category: string;
  topic: string | null;
  entity: string | null;
  importance: number;
  sourcePageId: string | null;
}

// ---------------------------------------------------------------------------
// The 15 query categories from spec section 9.
// ---------------------------------------------------------------------------

export const CATEGORY_LABELS = {
  informational: 'Informational',
  commercial: 'Commercial',
  transactional: 'Transactional',
  comparison: 'Comparison',
  alternative: 'Alternative',
  problem_solving: 'Problem-solving',
  product_service: 'Product/service-specific',
  brand: 'Brand',
  local: 'Local',
  industry: 'Industry',
  best: '"Best" queries',
  how_to: '"How to" queries',
  pricing: 'Pricing queries',
  feature: 'Feature queries',
  trust_credibility: 'Trust/credibility queries',
} as const;

export type CategoryKey = keyof typeof CATEGORY_LABELS;

// ---------------------------------------------------------------------------
// Small generic utilities
// ---------------------------------------------------------------------------

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function safePathname(urlOrPath: string | null | undefined): string {
  if (!urlOrPath) return '';
  try {
    return new URL(urlOrPath).pathname.toLowerCase();
  } catch {
    return urlOrPath.toLowerCase();
  }
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

function makeCandidate(
  query: string,
  key: CategoryKey,
  topic: string | null,
  entity: string | null,
  importance: number,
  sourcePageId: string | null,
  categorySuffix?: string,
): QueryCandidate {
  return {
    query: normalizeQueryText(query),
    intent: CATEGORY_LABELS[key],
    category: categorySuffix ? `${CATEGORY_LABELS[key]}: ${categorySuffix}` : CATEGORY_LABELS[key],
    topic,
    entity,
    importance: clamp(Math.round(importance), 1, 10),
    sourcePageId,
  };
}

export function normalizeQueryText(text: string): string {
  const t = text.trim().replace(/\s+/g, ' ');
  if (!t) return t;
  return t[0].toUpperCase() + t.slice(1);
}

// ---------------------------------------------------------------------------
// Page shape classification (URL path + title heuristics)
// ---------------------------------------------------------------------------

export interface PageShape {
  isHome: boolean;
  isPricing: boolean;
  isFeatures: boolean;
  isAbout: boolean;
  isBlog: boolean;
  isFaq: boolean;
  isContact: boolean;
}

export function classifyPageShape(page: Pick<PageLike, 'url' | 'normalizedUrl' | 'title'>): PageShape {
  const path = safePathname(page.normalizedUrl || page.url);
  const title = (page.title ?? '').toLowerCase();
  const isHome = path === '' || path === '/';
  const isPricing = /\/(pricing|plans|cost)(\/|$)/.test(path) || /\b(pricing|plans)\b/.test(title);
  const isFeatures =
    /\/(features?|product|solutions?)(\/|$)/.test(path) || /\bfeatures?\b/.test(title);
  const isAbout = /\/(about|about-us|company|team)(\/|$)/.test(path) || /\babout\b/.test(title);
  const isBlog = /\/(blog|resources|articles?|guides?|news)(\/|$)/.test(path);
  const isFaq = /\/(faq|help|support)(\/|$)/.test(path) || /\bfaq\b/.test(title);
  const isContact = /\/(contact|contact-us|locations?)(\/|$)/.test(path);
  return { isHome, isPricing, isFeatures, isAbout, isBlog, isFaq, isContact };
}

export function importanceForPage(shape: PageShape, wordCount = 0): number {
  let score = 5;
  if (shape.isHome) score += 4;
  else if (shape.isPricing) score += 3;
  else if (shape.isFeatures || shape.isAbout) score += 1;
  else if (shape.isFaq) score += 1;
  else if (shape.isBlog) score -= 1;
  if (wordCount >= 800) score += 1;
  return clamp(Math.round(score), 1, 10);
}

// ---------------------------------------------------------------------------
// Question mining from real heading text
// ---------------------------------------------------------------------------

const QUESTION_STARTERS = /^(what|who|why|how|is|are|does|do|can|should|which|where|will|would)\b/i;

export function isQuestionLike(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return QUESTION_STARTERS.test(t) || t.endsWith('?');
}

export function classifyQuestionCategory(text: string): CategoryKey {
  const t = text.toLowerCase();
  if (/^how to\b|^how do i\b/.test(t)) return 'how_to';
  if (/\b(cost|price|pricing|plans?)\b/.test(t)) return 'pricing';
  if (/\b(vs\.?|versus)\b/.test(t)) return 'comparison';
  if (/\balternatives?\b/.test(t)) return 'alternative';
  if (/\bbest\b/.test(t)) return 'best';
  if (/\b(integrat\w*|compatible|work with|support(s)?)\b/.test(t)) return 'feature';
  if (/\b(legit\w*|trust\w*|safe|secure|reliable|review)\b/.test(t)) return 'trust_credibility';
  if (/\bnear me\b/.test(t)) return 'local';
  if (/^(what|who) is\b/.test(t)) return 'brand';
  return 'informational';
}

export function mineQuestionHeadings(
  page: PageLike,
  shape: PageShape,
  brandName: string,
  headings: HeadingEntry[],
): QueryCandidate[] {
  const importance = importanceForPage(shape, page.wordCount);
  const out: QueryCandidate[] = [];
  for (const h of headings) {
    if (!isQuestionLike(h.text)) continue;
    const key = classifyQuestionCategory(h.text);
    const bump = key === 'pricing' || key === 'brand' ? 1 : 0;
    out.push(makeCandidate(h.text, key, page.title, brandName, importance + bump, page.id));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Template-based generation, gated on real signals found on the page
// ---------------------------------------------------------------------------

export function buildPricingCandidates(brandName: string, page: PageLike, shape: PageShape): QueryCandidate[] {
  const importance = importanceForPage(shape, page.wordCount);
  return [
    makeCandidate(`How much does ${brandName} cost?`, 'pricing', page.title, brandName, importance + 1, page.id),
    makeCandidate(`${brandName} pricing plans`, 'pricing', page.title, brandName, importance, page.id),
    makeCandidate(`Is ${brandName} worth it?`, 'commercial', page.title, brandName, importance, page.id),
  ];
}

const TRANSACTIONAL_SIGNALS: { pattern: RegExp; template: (brand: string) => string }[] = [
  { pattern: /free trial/i, template: (b) => `How do I start a free trial of ${b}?` },
  { pattern: /\bdemo\b/i, template: (b) => `How do I book a demo of ${b}?` },
  { pattern: /sign up|get started/i, template: (b) => `How do I sign up for ${b}?` },
];

export function buildTransactionalCandidates(
  brandName: string,
  page: PageLike,
  shape: PageShape,
): QueryCandidate[] {
  const signal = TRANSACTIONAL_SIGNALS.find((s) => s.pattern.test(page.contentText ?? ''));
  if (!signal) return [];
  const importance = importanceForPage(shape, page.wordCount);
  return [makeCandidate(signal.template(brandName), 'transactional', page.title, brandName, importance, page.id)];
}

export function buildFeatureCandidates(
  brandName: string,
  page: PageLike,
  shape: PageShape,
  headings: HeadingEntry[],
): QueryCandidate[] {
  if (!shape.isFeatures) return [];
  const importance = importanceForPage(shape, page.wordCount);
  const featureHeadings = headings
    .filter((h) => (h.level === 2 || h.level === 3) && !isQuestionLike(h.text) && h.text.length >= 3 && h.text.length <= 60)
    .slice(0, 5);
  return featureHeadings.map((h) =>
    makeCandidate(`Does ${brandName} support ${h.text}?`, 'feature', h.text, brandName, importance, page.id, h.text),
  );
}

const PROBLEM_PHRASES: { pattern: RegExp; phrase: string; verbPhrase: string }[] = [
  { pattern: /spreadsheets?/i, phrase: 'manually managing spreadsheets', verbPhrase: 'managing spreadsheets manually' },
  { pattern: /email chains?/i, phrase: 'tracking work over email chains', verbPhrase: 'tracking work over email' },
  { pattern: /sticky notes?/i, phrase: 'using sticky notes', verbPhrase: 'using sticky notes' },
  { pattern: /paper forms?/i, phrase: 'filling out paper forms', verbPhrase: 'filling out paper forms' },
  { pattern: /manual process(es)?/i, phrase: 'doing it manually', verbPhrase: 'doing it manually' },
];

export function findProblemPhrase(contentText: string | null): { phrase: string; verbPhrase: string } | null {
  if (!contentText) return null;
  for (const p of PROBLEM_PHRASES) {
    if (p.pattern.test(contentText)) return { phrase: p.phrase, verbPhrase: p.verbPhrase };
  }
  return null;
}

/**
 * Comparison queries per spec section 9: never invent a competitor name.
 * Only grounded when the page's own content names a real manual
 * process/alternative (e.g. "spreadsheets", "email chains") that visitors
 * are implicitly comparing this product against.
 */
export function buildComparisonCandidates(brandName: string, page: PageLike, shape: PageShape): QueryCandidate[] {
  const found = findProblemPhrase(page.contentText);
  if (!found) return [];
  const importance = importanceForPage(shape, page.wordCount);
  return [
    makeCandidate(`${brandName} vs ${found.phrase}`, 'comparison', page.title, brandName, importance, page.id),
    makeCandidate(
      `How does ${brandName} help with ${found.verbPhrase}?`,
      'problem_solving',
      page.title,
      brandName,
      importance,
      page.id,
    ),
  ];
}

export function buildBrandCandidates(
  brandName: string,
  homePage: PageLike | null,
  homeShape: PageShape | null,
): QueryCandidate[] {
  const importance = homePage && homeShape ? importanceForPage(homeShape, homePage.wordCount) : 6;
  const sourcePageId = homePage?.id ?? null;
  const items: { q: string; key: CategoryKey }[] = [
    { q: `What is ${brandName}?`, key: 'brand' },
    { q: `What does ${brandName} do?`, key: 'brand' },
    { q: `Who is ${brandName} for?`, key: 'brand' },
    { q: `Is ${brandName} legitimate?`, key: 'trust_credibility' },
  ];
  return items.map(({ q, key }) => makeCandidate(q, key, brandName, brandName, importance, sourcePageId));
}

export function buildAlternativeCandidates(
  brandName: string,
  homePage: PageLike | null,
  homeShape: PageShape | null,
): QueryCandidate[] {
  const importance = homePage && homeShape ? importanceForPage(homeShape, homePage.wordCount) : 5;
  return [makeCandidate(`${brandName} alternatives`, 'alternative', brandName, brandName, importance, homePage?.id ?? null)];
}

const SEPARATOR_CLASS = '[-|:–—]';

/** Strips a leading/trailing "Brand -/|/:" segment from a title, leaving the
 * descriptive topic phrase - e.g. "Acme — Project Management Software for
 * Small Teams" + "Acme" -> "Project Management Software for Small Teams". */
export function extractTopicPhrase(title: string | null | undefined, brandName: string): string | null {
  if (!title) return null;
  const brandEsc = brandName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let t = title.trim();
  t = t.replace(new RegExp(`^\\s*${brandEsc}\\s*${SEPARATOR_CLASS}\\s*`, 'i'), '');
  t = t.replace(new RegExp(`\\s*${SEPARATOR_CLASS}\\s*${brandEsc}\\s*$`, 'i'), '');
  t = t.trim();
  if (!t || t.toLowerCase() === brandName.toLowerCase()) return null;
  return t;
}

export function buildBestCandidates(
  brandName: string,
  homePage: PageLike | null,
  homeShape: PageShape | null,
): QueryCandidate[] {
  if (!homePage) return [];
  const topic = extractTopicPhrase(homePage.title, brandName) ?? extractTopicPhrase(homePage.metaDescription, brandName);
  if (!topic) return [];
  const importance = homeShape ? importanceForPage(homeShape, homePage.wordCount) : 6;
  const lowered = topic.charAt(0).toLowerCase() + topic.slice(1);
  return [makeCandidate(`Best ${lowered}`, 'best', topic, brandName, importance, homePage.id)];
}

export function extractAudiencePhrase(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = text.match(/\bfor\s+([a-z][a-z0-9\s-]{2,40}?)(?:[.,!?]|$)/i);
  if (!m) return null;
  return m[1].trim();
}

export function buildIndustryCandidates(
  brandName: string,
  homePage: PageLike | null,
  homeShape: PageShape | null,
  entityDescription: string | null,
): QueryCandidate[] {
  const audience =
    extractAudiencePhrase(homePage?.title) ??
    extractAudiencePhrase(homePage?.metaDescription) ??
    extractAudiencePhrase(entityDescription);
  if (!audience) return [];
  const importance = homePage && homeShape ? importanceForPage(homeShape, homePage.wordCount) : 5;
  return [makeCandidate(`Is ${brandName} suitable for ${audience}?`, 'industry', audience, brandName, importance, homePage?.id ?? null)];
}

export function buildLocalCandidates(brandName: string, locationEntities: EntityLike[]): QueryCandidate[] {
  return locationEntities.slice(0, 3).flatMap((loc) => [
    makeCandidate(`Is there a ${brandName} location in ${loc.name}?`, 'local', loc.name, brandName, 6, loc.sourcePageId),
    makeCandidate(`${brandName} near me`, 'local', loc.name, brandName, 6, loc.sourcePageId),
  ]);
}

export function buildProductServiceCandidates(
  entity: EntityLike,
  page: PageLike | null,
  shape: PageShape | null,
): QueryCandidate[] {
  const importance = page && shape ? importanceForPage(shape, page.wordCount) : 5;
  const sourcePageId = page?.id ?? entity.sourcePageId ?? null;
  return [
    makeCandidate(`What is ${entity.name}?`, 'product_service', entity.name, entity.name, importance + 1, sourcePageId),
    makeCandidate(`What does ${entity.name} include?`, 'product_service', entity.name, entity.name, importance, sourcePageId),
    makeCandidate(`Who is ${entity.name} designed for?`, 'product_service', entity.name, entity.name, importance, sourcePageId),
  ];
}

// ---------------------------------------------------------------------------
// Primary entity resolution
// ---------------------------------------------------------------------------

export function deriveNameFromDomain(domain: string): string {
  const host = domain.replace(/^www\./i, '').split(':')[0];
  const label = host.split('.')[0];
  if (!label) return host || 'This website';
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function pickPrimaryEntity(
  entities: EntityLike[],
  website: WebsiteLike,
): { name: string; description: string | null } {
  const org = entities.find((e) => e.type === EntityType.ORGANIZATION);
  if (org) return { name: org.name, description: org.description };
  const sorted = [...entities].sort((a, b) => b.confidence - a.confidence);
  if (sorted[0]) return { name: sorted[0].name, description: sorted[0].description };
  return { name: website.name?.trim() || deriveNameFromDomain(website.domain), description: null };
}

// ---------------------------------------------------------------------------
// Dedupe + cap to the 50-100 range (spec section 9)
// ---------------------------------------------------------------------------

function dedupeKey(query: string): string {
  return query.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function dedupeCandidates(candidates: QueryCandidate[]): QueryCandidate[] {
  const byKey = new Map<string, QueryCandidate>();
  for (const c of candidates) {
    const key = dedupeKey(c.query);
    if (!key) continue;
    const existing = byKey.get(key);
    if (!existing || c.importance > existing.importance) byKey.set(key, c);
  }
  return [...byKey.values()];
}

/** Caps the candidate list at `max`, round-robining across categories (by
 * `intent`) so a single prolific category (e.g. many FAQ headings) can't
 * crowd out the other 14 when trimming down to the target range. */
export function selectUpTo(candidates: QueryCandidate[], max: number): QueryCandidate[] {
  if (candidates.length <= max) return candidates;
  const groups = new Map<string, QueryCandidate[]>();
  for (const c of candidates) {
    const arr = groups.get(c.intent) ?? [];
    arr.push(c);
    groups.set(c.intent, arr);
  }
  for (const arr of groups.values()) arr.sort((a, b) => b.importance - a.importance);
  const groupArrays = [...groups.values()];
  const result: QueryCandidate[] = [];
  let idx = 0;
  while (result.length < max) {
    let addedAny = false;
    for (const g of groupArrays) {
      if (idx < g.length) {
        result.push(g[idx]);
        addedAny = true;
        if (result.length >= max) break;
      }
    }
    if (!addedAny) break;
    idx++;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Top-level assembly
// ---------------------------------------------------------------------------

export interface GenerateQueryCandidatesInput {
  website: WebsiteLike;
  entities: EntityLike[];
  pages: PageLike[];
}

export const MAX_QUERIES = 100;

export function generateQueryCandidates(input: GenerateQueryCandidatesInput): QueryCandidate[] {
  const { website, entities, pages } = input;
  const primaryEntity = pickPrimaryEntity(entities, website);
  const brandName = primaryEntity.name;

  const homePage = pages.find((p) => classifyPageShape(p).isHome) ?? null;
  const homeShape = homePage ? classifyPageShape(homePage) : null;
  const orgEntity = entities.find((e) => e.type === EntityType.ORGANIZATION) ?? null;
  const productEntities = entities.filter((e) => e.type === EntityType.PRODUCT || e.type === EntityType.SERVICE);
  const locationEntities = entities.filter((e) => e.type === EntityType.LOCATION);

  const candidates: QueryCandidate[] = [];

  for (const page of pages) {
    const shape = classifyPageShape(page);
    const headings = parseHeadings(page.headings);

    candidates.push(...mineQuestionHeadings(page, shape, brandName, headings));
    candidates.push(...buildComparisonCandidates(brandName, page, shape));
    candidates.push(...buildTransactionalCandidates(brandName, page, shape));

    if (shape.isPricing) {
      candidates.push(...buildPricingCandidates(brandName, page, shape));
    }
    if (shape.isFeatures) {
      candidates.push(...buildFeatureCandidates(brandName, page, shape, headings));
    }
  }

  candidates.push(...buildBrandCandidates(brandName, homePage, homeShape));
  candidates.push(...buildAlternativeCandidates(brandName, homePage, homeShape));
  candidates.push(...buildBestCandidates(brandName, homePage, homeShape));
  candidates.push(...buildIndustryCandidates(brandName, homePage, homeShape, orgEntity?.description ?? primaryEntity.description));
  candidates.push(...buildLocalCandidates(brandName, locationEntities));

  for (const ent of productEntities) {
    const page = pages.find((p) => p.id === ent.sourcePageId) ?? null;
    const shape = page ? classifyPageShape(page) : null;
    candidates.push(...buildProductServiceCandidates(ent, page, shape));
  }

  const deduped = dedupeCandidates(candidates);
  return selectUpTo(deduped, MAX_QUERIES);
}
