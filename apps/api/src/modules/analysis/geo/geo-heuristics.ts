/**
 * Pure, deterministic heuristics for the GEO / AI Search Readiness Analyzer
 * (spec section 8). No Prisma / IO here on purpose - unit-testable with
 * plain in-memory fixtures (see geo-heuristics.spec.ts).
 *
 * Every function returns { score, evidence } where `evidence` is a list of
 * concrete, human-readable sentences citing counts/urls/titles actually
 * observed - never a bare number (spec sections 3 & 26 ban an unexplained
 * or predictive score such as "80% chance of being cited").
 */

export interface EntityLite {
  name: string;
  type: string;
  description: string | null;
  confidence: number;
}

export interface ContentAnalysisLite {
  topics: unknown;
}

export interface PageLite {
  url: string;
  title: string | null;
  contentText: string | null;
  headings: unknown;
  jsonLd: unknown;
}

export interface SchemaAnalysisLite {
  isValid: boolean;
}

export interface AeoAnalysisLite {
  contentStructureScore: number;
  structuredDataScore: number;
}

export interface ScoreComponent {
  score: number;
  evidence: string[];
}

/** Weights for GEOAnalysis.overallScore. The spec (section 8) does not
 * prescribe exact percentages the way section 14 does for AEO, so these are
 * this analyzer's documented choice: Entity Clarity and Machine
 * Readability/Content Quality are weighted highest because they are the
 * most directly measurable "is this machine-understandable" signals;
 * Citation Readiness is weighted lowest because it is the most
 * speculative/proxy-based signal (spec section 26 forbids treating it as a
 * citation-probability prediction). */
export const GEO_SCORE_WEIGHTS = {
  entityClarity: 0.25,
  topicalCoverage: 0.2,
  contentQuality: 0.2,
  machineReadability: 0.2,
  citationReadiness: 0.15,
} as const;

function average(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function weightedAverage(components: { value: number; weight: number }[]): number {
  const totalWeight = components.reduce((s, c) => s + c.weight, 0);
  if (totalWeight === 0) return 0;
  return components.reduce((s, c) => s + c.value * c.weight, 0) / totalWeight;
}

function headingArray(json: unknown): { level: number; text: string }[] {
  if (!Array.isArray(json)) return [];
  return json
    .filter((h): h is Record<string, unknown> => !!h && typeof h === 'object')
    .map((h) => ({ level: Number((h as any).level) || 0, text: String((h as any).text ?? '') }));
}

function jsonLdArray(json: unknown): unknown[] {
  return Array.isArray(json) ? json : [];
}

function topicLabel(t: unknown): string | null {
  if (typeof t === 'string') {
    const v = t.trim().toLowerCase();
    return v || null;
  }
  if (t && typeof t === 'object') {
    const obj = t as Record<string, unknown>;
    const v = obj.name ?? obj.topic ?? obj.label;
    if (typeof v === 'string') {
      const trimmed = v.trim().toLowerCase();
      return trimmed || null;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Entity Clarity
// ---------------------------------------------------------------------------

export function computeEntityClarity(entities: EntityLite[]): ScoreComponent {
  const orgs = entities.filter((e) => e.type === 'ORGANIZATION');
  const productsOrServices = entities.filter((e) => e.type === 'PRODUCT' || e.type === 'SERVICE');
  const orgWithDesc = orgs.find((e) => (e.description ?? '').trim().length > 20);
  const productWithDesc = productsOrServices.find((e) => (e.description ?? '').trim().length > 20);
  const avgConfidence = entities.length > 0 ? average(entities.map((e) => e.confidence)) : 0; // 0-1

  const orgPoints = orgWithDesc ? 40 : orgs.length > 0 ? 15 : 0;
  const productPoints = productWithDesc ? 25 : productsOrServices.length > 0 ? 10 : 0;
  const breadthPoints = Math.min(20, entities.length * 4);
  const confidencePoints = avgConfidence * 15;

  const score = Math.min(100, Math.round(orgPoints + productPoints + breadthPoints + confidencePoints));

  const evidence: string[] = [
    orgWithDesc
      ? `Organization entity "${orgWithDesc.name}" has a ${(orgWithDesc.description ?? '').length}-character description.`
      : orgs.length > 0
        ? `${orgs.length} Organization entit${orgs.length === 1 ? 'y' : 'ies'} detected but none has a substantive (>20 char) description.`
        : 'No Organization entity detected for this site.',
    productWithDesc
      ? `Product/Service entity "${productWithDesc.name}" has a ${(productWithDesc.description ?? '').length}-character description.`
      : productsOrServices.length > 0
        ? `${productsOrServices.length} Product/Service entit${productsOrServices.length === 1 ? 'y' : 'ies'} detected but none has a substantive description.`
        : 'No Product/Service entity detected.',
    `${entities.length} total entit${entities.length === 1 ? 'y' : 'ies'} extracted, average confidence ${(avgConfidence * 100).toFixed(0)}%.`,
  ];

  return { score, evidence };
}

// ---------------------------------------------------------------------------
// Topical Coverage
// ---------------------------------------------------------------------------

export function computeTopicalCoverage(
  contentAnalyses: ContentAnalysisLite[],
  pages: PageLite[],
): ScoreComponent {
  const topicSet = new Set<string>();
  let pagesWithTopics = 0;

  for (const ca of contentAnalyses) {
    const arr = Array.isArray(ca.topics) ? (ca.topics as unknown[]) : [];
    if (arr.length > 0) pagesWithTopics++;
    for (const t of arr) {
      const label = topicLabel(t);
      if (label) topicSet.add(label);
    }
  }

  // Fallback proxy when no ContentAnalysis.topics data exists yet: distinct
  // H2 headings across the site approximate subtopic breadth.
  let usedHeadingFallback = false;
  if (topicSet.size === 0) {
    usedHeadingFallback = true;
    for (const p of pages) {
      for (const h of headingArray(p.headings)) {
        if (h.level === 2 && h.text.trim()) topicSet.add(h.text.trim().toLowerCase());
      }
    }
  }

  const breadthPoints = Math.min(70, topicSet.size * 5);
  const coverageRatio = pages.length > 0 ? pagesWithTopics / pages.length : 0;
  const coveragePoints = coverageRatio * 30;
  const score = Math.min(100, Math.round(breadthPoints + coveragePoints));

  const sample = Array.from(topicSet).slice(0, 5);
  const evidence: string[] = [
    topicSet.size > 0
      ? `${topicSet.size} distinct ${usedHeadingFallback ? 'H2 heading(s) (topic proxy)' : 'topic(s)'} identified across the site${sample.length > 0 ? ` (e.g. ${sample.join(', ')})` : ''}.`
      : `No topics or H2 headings could be identified across ${pages.length} page(s).`,
    `${pagesWithTopics} of ${pages.length} page(s) have recorded topic data (ContentAnalysis.topics).`,
  ];

  return { score, evidence };
}

// ---------------------------------------------------------------------------
// Content Quality Signals
// ---------------------------------------------------------------------------

function pageHasAuthorSignal(p: PageLite): boolean {
  return jsonLdArray(p.jsonLd).some((block) => /"author"/i.test(JSON.stringify(block)));
}

function pageHasDateSignal(p: PageLite): boolean {
  return jsonLdArray(p.jsonLd).some((block) => /"date(published|modified)"/i.test(JSON.stringify(block)));
}

export function computeContentQuality(pages: PageLite[], externalLinkCount: number): ScoreComponent {
  const aboutPage = pages.find((p) => /\/about/i.test(p.url) || /\babout\b/i.test(p.title ?? ''));
  const contactPage = pages.find((p) => /\/contact/i.test(p.url) || /\bcontact\b/i.test(p.title ?? ''));
  const authorPages = pages.filter(pageHasAuthorSignal);
  const datedPages = pages.filter(pageHasDateSignal);

  const aboutPoints = aboutPage ? 20 : 0;
  const contactPoints = contactPage ? 10 : 0;
  const authorPoints = authorPages.length > 0 ? 20 : 0;
  const externalPoints = Math.min(25, externalLinkCount * 2);
  const datePoints = datedPages.length > 0 ? 25 : 0;

  const score = Math.min(100, Math.round(aboutPoints + contactPoints + authorPoints + externalPoints + datePoints));

  const evidence: string[] = [
    aboutPage ? `About page found: "${aboutPage.title ?? aboutPage.url}".` : 'No About page detected.',
    contactPage ? `Contact page found: "${contactPage.title ?? contactPage.url}".` : 'No Contact page detected.',
    authorPages.length > 0
      ? `${authorPages.length} page(s) contain author/byline signals in JSON-LD.`
      : 'No author/byline JSON-LD signals found on any page.',
    `${externalLinkCount} outbound link(s) to external domains found (citation-adjacent proxy).`,
    datedPages.length > 0
      ? `${datedPages.length} page(s) contain datePublished/dateModified signals in JSON-LD.`
      : 'No datePublished/dateModified JSON-LD signals found across the site.',
  ];

  return { score, evidence };
}

// ---------------------------------------------------------------------------
// Machine Readability
// ---------------------------------------------------------------------------

export function computeMachineReadability(
  pages: PageLite[],
  schemaAnalyses: SchemaAnalysisLite[],
  aeoAnalyses: AeoAnalysisLite[],
): ScoreComponent {
  const perPageScores = pages.map((p) => {
    const headings = headingArray(p.headings);
    const hasH1 = headings.some((h) => h.level === 1);
    const levels = new Set(headings.map((h) => h.level));
    const hasDepth = levels.size >= 2;
    const hasJsonLd = jsonLdArray(p.jsonLd).length > 0;
    return (hasH1 ? 34 : 0) + (hasJsonLd ? 33 : 0) + (hasDepth ? 33 : 0);
  });
  const pageAvg = perPageScores.length > 0 ? average(perPageScores) : null;

  const schemaValidRatio =
    schemaAnalyses.length > 0 ? (schemaAnalyses.filter((s) => s.isValid).length / schemaAnalyses.length) * 100 : null;

  const aeoStructuralAvg =
    aeoAnalyses.length > 0
      ? average(aeoAnalyses.map((a) => (a.contentStructureScore + a.structuredDataScore) / 2))
      : null;

  const components: { value: number; weight: number }[] = [];
  if (pageAvg !== null) components.push({ value: pageAvg, weight: 0.6 });
  if (schemaValidRatio !== null) components.push({ value: schemaValidRatio, weight: 0.25 });
  if (aeoStructuralAvg !== null) components.push({ value: aeoStructuralAvg, weight: 0.15 });

  const score = components.length > 0 ? Math.round(weightedAverage(components)) : 0;

  const pagesWithH1 = pages.filter((p) => headingArray(p.headings).some((h) => h.level === 1)).length;
  const pagesWithJsonLd = pages.filter((p) => jsonLdArray(p.jsonLd).length > 0).length;

  const evidence: string[] = [
    `${pagesWithH1} of ${pages.length} page(s) have a clear H1 heading.`,
    `${pagesWithJsonLd} of ${pages.length} page(s) publish JSON-LD structured data.`,
  ];
  if (schemaValidRatio !== null) {
    evidence.push(
      `${Math.round(schemaValidRatio)}% of ${schemaAnalyses.length} detected schema block(s) validated successfully.`,
    );
  } else {
    evidence.push('No SchemaAnalysis rows available yet to assess schema validity.');
  }
  if (aeoStructuralAvg !== null) {
    evidence.push(
      `AEO analysis of ${aeoAnalyses.length} page(s) shows an average content-structure/structured-data signal of ${Math.round(aeoStructuralAvg)}/100.`,
    );
  }

  return { score, evidence };
}

// ---------------------------------------------------------------------------
// Citation Readiness
// ---------------------------------------------------------------------------

const STATS_RE = /\$\s?\d|\d+(\.\d+)?\s?%|\b\d{3,}\b/;

export function computeCitationReadiness(pages: PageLite[], externalLinkCount: number): ScoreComponent {
  const pagesWithStats = pages.filter((p) => STATS_RE.test(p.contentText ?? ''));
  const statsRatio = pages.length > 0 ? pagesWithStats.length / pages.length : 0;
  const statsPoints = statsRatio * 40;

  const externalPoints = Math.min(30, externalLinkCount * 2);

  const articlePages = pages.filter((p) =>
    jsonLdArray(p.jsonLd).some((block) => {
      const s = JSON.stringify(block);
      return /"@type"\s*:\s*"(Article|BlogPosting|NewsArticle)"/i.test(s) && /"date(published|modified)"/i.test(s);
    }),
  );
  const articlePoints = Math.min(30, articlePages.length * 10);

  const score = Math.min(100, Math.round(statsPoints + externalPoints + articlePoints));

  const evidence: string[] = [
    `${pagesWithStats.length} of ${pages.length} page(s) contain statistics/numeric evidence (currency, percentages, or multi-digit figures) in their body text.`,
    `${externalLinkCount} outbound link(s) to external domains found across the site.`,
    `${articlePages.length} page(s) publish Article/BlogPosting/NewsArticle JSON-LD with a publish or update date.`,
  ];

  return { score, evidence };
}
