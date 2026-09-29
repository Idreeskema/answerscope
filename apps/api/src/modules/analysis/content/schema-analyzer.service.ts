import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { flattenJsonLdBlocks, getSchemaTypes } from './json-ld.helpers';
import { validateSchemaBlock } from './schema-analyzer.helpers';

/**
 * Schema Analyzer (Milestone 4 "Schema Analyzer" piece; spec section 6's
 * Structured Data checks - Organization, WebSite, Article, Product,
 * FAQPage, BreadcrumbList, LocalBusiness, Person, Service). For every
 * JSON-LD block found on every page, writes one SchemaAnalysis row with
 * its @type, a schema.org "required property" validity verdict, any
 * missing-field errors, and the raw block for later inspection/UI
 * rendering. Deep validity checking (required properties) happens here;
 * presence/applicability-per-page-type is the Technical SEO Analyzer's job
 * (technical-seo-analyzer.service.ts).
 *
 * If a JSON-LD block declares multiple @type values (e.g.
 * `"@type": ["Product", "Review"]`), we validate against whichever of
 * those types we have a rule for (see schema-analyzer.helpers.ts); if none
 * match a known type, the first declared type is recorded and it is not
 * penalized (see helpers file doc comment on unknown types).
 */
@Injectable()
export class SchemaAnalyzerService {
  private readonly logger = new Logger(SchemaAnalyzerService.name);
  constructor(private readonly prisma: PrismaService) {}

  async analyze(auditId: string, crawlJobId: string): Promise<void> {
    const pages = await this.prisma.page.findMany({ where: { crawlJobId } });
    if (pages.length === 0) {
      this.logger.warn(`No pages found for crawl job ${crawlJobId}; skipping schema analysis`);
      return;
    }

    const rows: Prisma.SchemaAnalysisCreateManyInput[] = [];
    for (const page of pages) {
      for (const block of flattenJsonLdBlocks(page.jsonLd)) {
        const types = getSchemaTypes(block);
        const schemaType = types[0] ?? 'Unknown';
        const { isValid, errors } = this.validateBlock(types, block);

        rows.push({
          pageId: page.id,
          auditId,
          schemaType,
          isValid,
          errors,
          rawJsonLd: block as unknown as Prisma.InputJsonValue,
        });
      }
    }

    await this.prisma.$transaction([
      this.prisma.schemaAnalysis.deleteMany({ where: { auditId } }),
      this.prisma.schemaAnalysis.createMany({ data: rows }),
    ]);

    this.logger.log(`Wrote ${rows.length} SchemaAnalysis rows`);
  }

  /**
   * Validates a block against every @type it declares and unions the
   * errors, so `"@type": ["Product", "Article"]` is checked against both
   * rule sets rather than silently only the first. A block with no
   * recognizable @type at all is validated as the synthetic "Unknown"
   * type, which always passes (see schema-analyzer.helpers.ts).
   */
  private validateBlock(types: string[], block: Record<string, any>): { isValid: boolean; errors: string[] } {
    const typesToCheck = types.length > 0 ? types : ['Unknown'];
    const errors: string[] = [];
    for (const type of typesToCheck) {
      errors.push(...validateSchemaBlock(type, block).errors);
    }
    return { isValid: errors.length === 0, errors };
  }
}
