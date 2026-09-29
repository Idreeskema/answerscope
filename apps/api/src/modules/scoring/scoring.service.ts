import { Injectable, Logger } from '@nestjs/common';
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
 * STUB - implements the Explainable Scoring Engine (spec section 14).
 *
 * ensureScoreVersion() must upsert a ScoreVersion row for SCORE_VERSION_V1
 * with weights = DEFAULT_SCORE_WEIGHTS (isActive: true) if it doesn't exist.
 *
 * computeScores(auditId) must, using the ACTIVE ScoreVersion's weights:
 *  - read SEOCheck rows for the audit -> TECHNICAL_SEO, STRUCTURED_DATA,
 *    INTERNAL_LINKING raw scores (average score per relevant category)
 *  - read ContentAnalysis rows -> CONTENT_QUALITY raw score
 *  - read AEOAnalysis rows -> AEO raw score (average overallScore)
 *  - read Entity rows + GEOAnalysis.entityClarityScore -> ENTITY_SEMANTIC_CLARITY
 *  - read GEOAnalysis.citationReadinessScore -> CITATION_EVIDENCE_READINESS
 *  - write one Score row per category (rawScore, weight, normalizedScore =
 *    rawScore * weight, calculationVersion, breakdown JSON citing the
 *    contributing check ids/counts) plus one Score row category="OVERALL"
 *    (sum of normalizedScore across categories)
 *  - update Audit.overallScore and Audit.calculationVersion
 *  - MUST be deterministic: identical input rows always produce an
 *    identical score (spec section 21 testing requirement)
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
    this.logger.warn(`ScoringService.computeScores is a STUB (audit ${auditId})`);
    await this.ensureScoreVersion();
    await this.prisma.audit.update({
      where: { id: auditId },
      data: { overallScore: 0, calculationVersion: SCORE_VERSION_V1 },
    });
    return { overallScore: 0 };
  }
}
