import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * STUB - implements the "Entity Analyzer" part of Milestone 4 and the
 * "Entity Clarity" section of the GEO analyzer (spec section 8).
 * analyze(auditId, websiteId, crawlJobId) must create Entity rows: what
 * organization/person/product/service this site represents, extracted
 * deterministically from JSON-LD (Organization/Person/Product/Service/
 * LocalBusiness types in Page.jsonLd), title/heading patterns, and About/
 * Contact page content. Record relationships (e.g. Product -> Organization)
 * in the `relationships` JSON field.
 */
@Injectable()
export class EntityAnalyzerService {
  private readonly logger = new Logger(EntityAnalyzerService.name);
  constructor(private readonly prisma: PrismaService) {}

  async analyze(auditId: string, _websiteId: string, _crawlJobId: string): Promise<void> {
    this.logger.warn(`EntityAnalyzerService.analyze is a STUB (audit ${auditId})`);
  }
}
