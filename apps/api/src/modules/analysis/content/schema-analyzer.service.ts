import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * STUB - implements the "Schema Analyzer" part of Milestone 4 and the
 * Structured Data checks in spec section 6 (Organization, WebSite, Article,
 * Product, FAQPage, BreadcrumbList, LocalBusiness, Person, Service).
 * analyze(auditId, crawlJobId) must, for every JSON-LD block found in
 * Page.jsonLd, create a SchemaAnalysis row (schemaType, isValid based on
 * schema.org required-property presence, errors, rawJsonLd). Only validate
 * schema types applicable to the page's apparent purpose - do not flag a
 * blog post for missing Product schema.
 */
@Injectable()
export class SchemaAnalyzerService {
  private readonly logger = new Logger(SchemaAnalyzerService.name);
  constructor(private readonly prisma: PrismaService) {}

  async analyze(auditId: string, _crawlJobId: string): Promise<void> {
    this.logger.warn(`SchemaAnalyzerService.analyze is a STUB (audit ${auditId})`);
  }
}
