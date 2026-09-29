import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * STUB - implements Milestone 5 / spec section 7 (AEO Analyzer).
 * analyze(auditId, crawlJobId) must, for "important" pages (homepage +
 * highest word-count pages, capped), generate likely user questions
 * deterministically from title/headings/entity/topic, decide
 * DIRECTLY_ANSWERED / PARTIALLY_ANSWERED / NOT_ANSWERED per question using
 * text-proximity heuristics against Page.contentText, and write one
 * AEOAnalysis row per analyzed page with the 6 sub-scores + overallScore +
 * `details` JSON containing the per-question breakdown (question, status,
 * evidence, recommendation) - this JSON is what the dashboard drill-down
 * renders per spec section 3/15.
 */
@Injectable()
export class AeoAnalyzerService {
  private readonly logger = new Logger(AeoAnalyzerService.name);
  constructor(private readonly prisma: PrismaService) {}

  async analyze(auditId: string, _crawlJobId: string): Promise<void> {
    this.logger.warn(`AeoAnalyzerService.analyze is a STUB (audit ${auditId})`);
  }
}
