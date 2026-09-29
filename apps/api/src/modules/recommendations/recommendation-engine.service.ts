import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * STUB - implements Milestone 9 / spec section 12 (Recommendation Engine).
 * generateRecommendations(auditId) must read FAIL/WARNING SEOCheck rows,
 * NOT_ANSWERED/PARTIALLY_ANSWERED entries in AEOAnalysis.details, GEOAnalysis
 * gaps, and missing/invalid SchemaAnalysis rows for the audit, and create one
 * Recommendation row per real finding (never an arbitrary/generic one - spec
 * section 12: "Do not create arbitrary recommendations"). Each row needs
 * impact (1-10), effort (1-10), confidence (0-1) and
 * priority = impact * confidence / effort (spec formula), plus evidence
 * quoting the actual page/check data, explanation, action, optional example,
 * affectedUrl, implementationType (see ImplementationType enum).
 */
@Injectable()
export class RecommendationEngineService {
  private readonly logger = new Logger(RecommendationEngineService.name);
  constructor(private readonly prisma: PrismaService) {}

  async generateRecommendations(auditId: string): Promise<void> {
    this.logger.warn(
      `RecommendationEngineService.generateRecommendations is a STUB (audit ${auditId})`,
    );
  }
}
