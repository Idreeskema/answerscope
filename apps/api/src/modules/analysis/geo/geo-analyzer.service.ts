import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * STUB - implements Milestone 5 / spec section 8 (GEO / AI Search Readiness
 * Analyzer). analyze(auditId) must run AFTER technical-seo/content/entity/
 * schema/aeo analyzers have persisted their rows for this audit, since it
 * aggregates across them (Entity rows for entity clarity, ContentAnalysis +
 * Page.headings for topical coverage, SchemaAnalysis + Page structure for
 * machine readability, external links/statistics/dates in Page.contentText
 * for citation readiness). Writes exactly one GEOAnalysis row per audit with
 * the 5 sub-scores + overallScore + `details` JSON explaining exactly which
 * measurable characteristics contributed (never a bare number - see spec
 * section 3 and section 26's ban on unexplained/predictive scores).
 */
@Injectable()
export class GeoAnalyzerService {
  private readonly logger = new Logger(GeoAnalyzerService.name);
  constructor(private readonly prisma: PrismaService) {}

  async analyze(auditId: string): Promise<void> {
    this.logger.warn(`GeoAnalyzerService.analyze is a STUB (audit ${auditId})`);
  }
}
