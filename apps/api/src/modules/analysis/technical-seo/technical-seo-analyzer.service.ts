import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * STUB - implements Milestone 3 (Technical SEO Analyzer, spec section 6).
 *
 * analyze(auditId, crawlJobId) must run every deterministic check listed in
 * section 6 (Technical Checks, Metadata, Content Structure, Internal Linking,
 * Structured Data presence) against every Page row for crawlJobId, and write
 * one SEOCheck row per check per page (pageId null for site-wide checks like
 * "duplicate titles across site"). Each SEOCheck must match the shape in
 * prisma/schema.prisma exactly: checkId, category, status (PASS/WARNING/FAIL/
 * NOT_APPLICABLE), severity (CRITICAL/HIGH/MEDIUM/LOW), score (0-100),
 * evidence (concrete, quoting the actual page data), recommendation.
 *
 * No AI/LLM calls here - deterministic rules only (spec section 6: "Do not
 * use AI for deterministic checks").
 */
@Injectable()
export class TechnicalSeoAnalyzerService {
  private readonly logger = new Logger(TechnicalSeoAnalyzerService.name);

  constructor(private readonly prisma: PrismaService) {}

  async analyze(auditId: string, _crawlJobId: string): Promise<void> {
    this.logger.warn(
      `TechnicalSeoAnalyzerService.analyze is a STUB (audit ${auditId})`,
    );
  }
}
