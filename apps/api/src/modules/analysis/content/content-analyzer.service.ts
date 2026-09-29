import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * STUB - implements the "Content Analyzer" part of Milestone 4.
 * analyze(auditId, crawlJobId) must create one ContentAnalysis row per Page
 * (paragraphCount, avgSentenceLength, readabilityScore, duplicateOfPageId when
 * near-duplicate content is detected across pages, thinContent, topics).
 */
@Injectable()
export class ContentAnalyzerService {
  private readonly logger = new Logger(ContentAnalyzerService.name);
  constructor(private readonly prisma: PrismaService) {}

  async analyze(auditId: string, _crawlJobId: string): Promise<void> {
    this.logger.warn(`ContentAnalyzerService.analyze is a STUB (audit ${auditId})`);
  }
}
