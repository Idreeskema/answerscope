import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export const SCORE_CATEGORIES = [
  'TECHNICAL_SEO',
  'CONTENT_QUALITY',
  'AEO',
  'ENTITY_SEMANTIC_CLARITY',
  'STRUCTURED_DATA',
  'CITATION_EVIDENCE_READINESS',
  'INTERNAL_LINKING',
] as const;

export const DEFAULT_SCORE_WEIGHTS: Record<(typeof SCORE_CATEGORIES)[number], number> = {
  TECHNICAL_SEO: 0.2,
  CONTENT_QUALITY: 0.2,
  AEO: 0.2,
  ENTITY_SEMANTIC_CLARITY: 0.15,
  STRUCTURED_DATA: 0.1,
  CITATION_EVIDENCE_READINESS: 0.1,
  INTERNAL_LINKING: 0.05,
};

export const SCORE_VERSION_V1 = 'v1';

/**
 * SEOCheck.category is a plain string (not a schema enum) written by
 * TechnicalSeoAnalyzerService, which is being implemented by another agent
 * in parallel. These constants document the exact category strings this
 * scoring engine expects - chosen to mirror spec section 6's own section
 * headers ("Technical Checks", "Metadata", "Content Structure", "Internal
 * Linking", "Structured Data"). If the technical-seo/schema analyzer ends up
 * using different strings, the affected category's rawScore will compute to
 * 0 with a `note` in its breakdown explaining no matching checks were found
 * (never a fabricated score) until the strings are aligned - see this
 * service's final report for this known integration risk.
 */
const TECHNICAL_SEO_CHECK_CATEGORIES = ['TECHNICAL', 'METADATA'];
const STRUCTURED_DATA_CHECK_CATEGORY = 'STRUCTURED_DATA';
const INTERNAL_LINKING_CHECK_CATEGORY = 'INTERNAL_LINKING';
const CONTENT_STRUCTURE_CHECK_CATEGORY = 'CONTENT_STRUCTURE';

type ScoreCategory = (typeof SCORE_CATEGORIES)[number];

interface CategoryResult {
  rawScore: number;
  breakdown: Record<string, unknown>;
}

function average(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function tally(items: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const it of items) out[it] = (out[it] ?? 0) + 1;
  return out;
}

/** Blends 1-2 optional (value, weight) components, renormalizing weights
 * over whichever components are actually present so a missing signal never
 * silently drags the score toward 0. Returns 0 (with the caller expected to
 * note it) only when NO component is present at all. */
function weightedBlend(components: { value: number | null; weight: number }[]): number {
  const present = components.filter(
    (c): c is { value: number; weight: number } => c.value !== null && Number.isFinite(c.value),
  );
  const totalWeight = present.reduce((s, c) => s + c.weight, 0);
  if (totalWeight === 0) return 0;
  return present.reduce((s, c) => s + c.value * c.weight, 0) / totalWeight;
}

/**
 * Implements the Explainable Scoring Engine (spec section 14).
 *
 * computeScores(auditId) reads every upstream analyzer's already-persisted
 * rows for this audit, derives one 0-100 rawScore per category via an
 * explicit, documented formula (see each block below and the final report),
 * writes one Score row per category (+ one "OVERALL" row), and updates
 * Audit.overallScore/calculationVersion. All aggregation uses averages/sums
 * over explicitly `orderBy`-sorted query results, so identical input rows
 * always produce an identical output (spec section 21).
 */
@Injectable()
export class ScoringService {
  private readonly logger = new Logger(ScoringService.name);
  constructor(private readonly prisma: PrismaService) {}

  async ensureScoreVersion(): Promise<void> {
    await this.prisma.scoreVersion.upsert({
      where: { version: SCORE_VERSION_V1 },
      update: {},
      create: {
        version: SCORE_VERSION_V1,
        weights: DEFAULT_SCORE_WEIGHTS,
        description: 'Initial explainable scoring weights (spec section 14)',
        isActive: true,
      },
    });
  }

  async computeScores(auditId: string): Promise<{ overallScore: number }> {
    await this.ensureScoreVersion();
    const scoreVersion = await this.prisma.scoreVersion.findFirstOrThrow({ where: { isActive: true } });
    const weights = scoreVersion.weights as unknown as Partial<Record<ScoreCategory, number>>;

    const [seoChecks, schemaAnalyses, contentAnalyses, aeoAnalyses, entities, geo] = await Promise.all([
      this.prisma.sEOCheck.findMany({
        where: { auditId },
        orderBy: [{ checkId: 'asc' }, { pageId: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.schemaAnalysis.findMany({ where: { auditId }, orderBy: { id: 'asc' } }),
      this.prisma.contentAnalysis.findMany({ where: { auditId }, orderBy: { id: 'asc' } }),
      this.prisma.aEOAnalysis.findMany({ where: { auditId }, orderBy: { id: 'asc' } }),
      this.prisma.entity.findMany({ where: { auditId }, orderBy: { id: 'asc' } }),
      this.prisma.gEOAnalysis.findUnique({ where: { auditId } }),
    ]);

    const results: Record<ScoreCategory, CategoryResult> = {
      TECHNICAL_SEO: this.computeTechnicalSeo(seoChecks),
      STRUCTURED_DATA: this.computeStructuredData(seoChecks, schemaAnalyses),
      INTERNAL_LINKING: this.computeInternalLinking(seoChecks),
      CONTENT_QUALITY: this.computeContentQuality(seoChecks, contentAnalyses),
      AEO: this.computeAeo(aeoAnalyses),
      ENTITY_SEMANTIC_CLARITY: this.computeEntitySemanticClarity(entities, geo),
      CITATION_EVIDENCE_READINESS: this.computeCitationEvidenceReadiness(geo),
    };

    const categorySummaries: { category: ScoreCategory; rawScore: number; weight: number; normalizedScore: number }[] =
      [];

    for (const category of SCORE_CATEGORIES) {
      const { rawScore, breakdown } = results[category];
      const weight = typeof weights[category] === 'number' ? (weights[category] as number) : DEFAULT_SCORE_WEIGHTS[category];
      const rawRounded = round2(clamp(rawScore, 0, 100));
      const normalizedScore = round2(rawRounded * weight);

      await this.prisma.score.upsert({
        where: { auditId_category: { auditId, category } },
        create: {
          auditId,
          category,
          rawScore: rawRounded,
          weight,
          normalizedScore,
          calculationVersion: SCORE_VERSION_V1,
          breakdown: breakdown as Prisma.InputJsonValue,
        },
        update: {
          rawScore: rawRounded,
          weight,
          normalizedScore,
          calculationVersion: SCORE_VERSION_V1,
          breakdown: breakdown as Prisma.InputJsonValue,
        },
      });

      categorySummaries.push({ category, rawScore: rawRounded, weight, normalizedScore });
    }

    const overallScore = round2(categorySummaries.reduce((s, c) => s + c.normalizedScore, 0));

    await this.prisma.score.upsert({
      where: { auditId_category: { auditId, category: 'OVERALL' } },
      create: {
        auditId,
        category: 'OVERALL',
        rawScore: overallScore,
        weight: 1,
        normalizedScore: overallScore,
        calculationVersion: SCORE_VERSION_V1,
        breakdown: {
          formula: 'sum of normalizedScore across the 7 weighted categories',
          categories: categorySummaries,
        } as Prisma.InputJsonValue,
      },
      update: {
        rawScore: overallScore,
        weight: 1,
        normalizedScore: overallScore,
        calculationVersion: SCORE_VERSION_V1,
        breakdown: {
          formula: 'sum of normalizedScore across the 7 weighted categories',
          categories: categorySummaries,
        } as Prisma.InputJsonValue,
      },
    });

    await this.prisma.audit.update({
      where: { id: auditId },
      data: { overallScore, calculationVersion: SCORE_VERSION_V1 },
    });

    this.logger.log(`Scoring complete for audit ${auditId}: overall ${overallScore}/100 (${SCORE_VERSION_V1})`);
    return { overallScore };
  }

  // ---------------------------------------------------------------------
  // Per-category raw-score derivations. Each returns { rawScore, breakdown }
  // where breakdown cites exactly which rows/values contributed - this is
  // what "clicking a score shows exactly how it was calculated" renders
  // (spec section 15).
  // ---------------------------------------------------------------------

  private computeTechnicalSeo(seoChecks: { checkId: string; pageId: string | null; status: string; score: number; category: string }[]): CategoryResult {
    const checks = seoChecks.filter((c) => TECHNICAL_SEO_CHECK_CATEGORIES.includes(c.category));
    const avg = average(checks.map((c) => c.score));
    return {
      rawScore: avg ?? 0,
      breakdown: {
        formula: `average(SEOCheck.score) where category in [${TECHNICAL_SEO_CHECK_CATEGORIES.join(', ')}]`,
        checkCount: checks.length,
        statusCounts: tally(checks.map((c) => c.status)),
        average: avg,
        checks: checks.map((c) => ({ checkId: c.checkId, pageId: c.pageId, status: c.status, score: c.score })),
        note: checks.length === 0 ? 'No TECHNICAL/METADATA SEOCheck rows found for this audit yet.' : undefined,
      },
    };
  }

  private computeStructuredData(
    seoChecks: { checkId: string; pageId: string | null; status: string; score: number; category: string }[],
    schemaAnalyses: { isValid: boolean }[],
  ): CategoryResult {
    const checks = seoChecks.filter((c) => c.category === STRUCTURED_DATA_CHECK_CATEGORY);
    const checkAvg = average(checks.map((c) => c.score));
    const validCount = schemaAnalyses.filter((s) => s.isValid).length;
    const validRatioPct = schemaAnalyses.length > 0 ? (validCount / schemaAnalyses.length) * 100 : null;

    const raw = weightedBlend([
      { value: checkAvg, weight: 0.6 },
      { value: validRatioPct, weight: 0.4 },
    ]);

    return {
      rawScore: raw,
      breakdown: {
        formula:
          '60% average(SEOCheck.score where category=STRUCTURED_DATA) blended with 40% (valid SchemaAnalysis rows / total SchemaAnalysis rows * 100); whichever side is missing is dropped and the other counts fully',
        seoCheckCount: checks.length,
        seoCheckAverage: checkAvg,
        schemaAnalysisCount: schemaAnalyses.length,
        schemaValidCount: validCount,
        schemaValidRatioPct: validRatioPct,
        checks: checks.map((c) => ({ checkId: c.checkId, pageId: c.pageId, score: c.score })),
        note: checks.length === 0 && schemaAnalyses.length === 0 ? 'No STRUCTURED_DATA SEOCheck or SchemaAnalysis rows found for this audit yet.' : undefined,
      },
    };
  }

  private computeInternalLinking(
    seoChecks: { checkId: string; pageId: string | null; status: string; score: number; category: string }[],
  ): CategoryResult {
    const checks = seoChecks.filter((c) => c.category === INTERNAL_LINKING_CHECK_CATEGORY);
    const avg = average(checks.map((c) => c.score));
    return {
      rawScore: avg ?? 0,
      breakdown: {
        formula: 'average(SEOCheck.score) where category = INTERNAL_LINKING',
        checkCount: checks.length,
        average: avg,
        checks: checks.map((c) => ({ checkId: c.checkId, pageId: c.pageId, status: c.status, score: c.score })),
        note: checks.length === 0 ? 'No INTERNAL_LINKING SEOCheck rows found for this audit yet.' : undefined,
      },
    };
  }

  private computeContentQuality(
    seoChecks: { checkId: string; pageId: string | null; score: number; category: string }[],
    contentAnalyses: { pageId: string; thinContent: boolean; readabilityScore: number | null }[],
  ): CategoryResult {
    const thinCount = contentAnalyses.filter((c) => c.thinContent).length;
    const nonThinRatioPct = contentAnalyses.length > 0 ? (1 - thinCount / contentAnalyses.length) * 100 : null;

    const readabilityValues = contentAnalyses
      .map((c) => c.readabilityScore)
      .filter((v): v is number => v !== null && Number.isFinite(v));
    const avgReadability = readabilityValues.length > 0 ? clamp(average(readabilityValues) ?? 0, 0, 100) : null;

    const contentAnalysisComponents = [nonThinRatioPct, avgReadability].filter(
      (v): v is number => v !== null,
    );
    const contentAnalysisScore = contentAnalysisComponents.length > 0 ? average(contentAnalysisComponents) : null;

    const structureChecks = seoChecks.filter((c) => c.category === CONTENT_STRUCTURE_CHECK_CATEGORY);
    const structureAvg = average(structureChecks.map((c) => c.score));

    const raw = weightedBlend([
      { value: contentAnalysisScore, weight: 0.6 },
      { value: structureAvg, weight: 0.4 },
    ]);

    return {
      rawScore: raw,
      breakdown: {
        formula:
          "60% average(1 - thinContentRatio, avgReadabilityScore) from ContentAnalysis rows, blended with 40% average(SEOCheck.score where category=CONTENT_STRUCTURE); whichever side is missing is dropped and the other counts fully",
        contentAnalysisCount: contentAnalyses.length,
        thinContentCount: thinCount,
        nonThinRatioPct,
        avgReadabilityScore: avgReadability,
        contentStructureCheckCount: structureChecks.length,
        contentStructureAverage: structureAvg,
        note:
          contentAnalyses.length === 0 && structureChecks.length === 0
            ? 'No ContentAnalysis or CONTENT_STRUCTURE SEOCheck rows found for this audit yet.'
            : undefined,
      },
    };
  }

  private computeAeo(aeoAnalyses: { pageId: string; overallScore: number }[]): CategoryResult {
    const avg = average(aeoAnalyses.map((a) => a.overallScore));
    return {
      rawScore: avg ?? 0,
      breakdown: {
        formula: 'average(AEOAnalysis.overallScore) across analyzed pages for this audit',
        pageCount: aeoAnalyses.length,
        average: avg,
        perPage: aeoAnalyses.map((a) => ({ pageId: a.pageId, overallScore: a.overallScore })),
        note: aeoAnalyses.length === 0 ? 'No AEOAnalysis rows found for this audit yet.' : undefined,
      },
    };
  }

  private computeEntitySemanticClarity(
    entities: { confidence: number }[],
    geo: { entityClarityScore: number } | null,
  ): CategoryResult {
    const avgConfidence = entities.length > 0 ? (average(entities.map((e) => e.confidence)) ?? 0) : 0;
    const countComponent = Math.min(100, entities.length * 15);
    const confidenceComponent = avgConfidence * 100;
    const entityRowScore = entities.length > 0 ? average([countComponent, confidenceComponent]) : null;
    const geoEntityScore = geo?.entityClarityScore ?? null;

    const raw = weightedBlend([
      { value: entityRowScore, weight: 0.5 },
      { value: geoEntityScore, weight: 0.5 },
    ]);

    return {
      rawScore: raw,
      breakdown: {
        formula:
          '50% average(min(100, entityCount*15), avgConfidence*100) from Entity rows, blended with 50% GEOAnalysis.entityClarityScore; whichever side is missing is dropped and the other counts fully',
        entityCount: entities.length,
        avgConfidence,
        entityRowScore,
        geoEntityClarityScore: geoEntityScore,
        note: entities.length === 0 && geoEntityScore === null ? 'No Entity rows or GEOAnalysis found for this audit yet.' : undefined,
      },
    };
  }

  private computeCitationEvidenceReadiness(geo: { citationReadinessScore: number } | null): CategoryResult {
    const raw = geo?.citationReadinessScore ?? 0;
    return {
      rawScore: raw,
      breakdown: {
        formula: 'GEOAnalysis.citationReadinessScore for this audit',
        geoAnalysisPresent: !!geo,
        value: geo?.citationReadinessScore ?? null,
        note: !geo ? 'GEOAnalysis has not run for this audit yet.' : undefined,
      },
    };
  }
}
