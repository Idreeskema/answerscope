import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * STUB - implements Milestone 6 / spec section 9 (AI Query Generation
 * Engine). generateQueries(auditId, websiteId) must create 50-100 Query
 * rows using Entity + Page (title/headings/topics) data already persisted
 * for this audit, spanning the 15 categories listed in section 9
 * (informational, commercial, transactional, comparison, alternative,
 * problem-solving, product/service-specific, brand, local, industry,
 * "best", "how to", pricing, feature, trust/credibility). Every query must
 * be traceable to a sourcePage/entity - no generic queries unrelated to the
 * site. status starts PENDING (see QueryStatus enum) so users can
 * edit/approve/reject/group them via QueriesController.
 */
@Injectable()
export class QueryGeneratorService {
  private readonly logger = new Logger(QueryGeneratorService.name);
  constructor(private readonly prisma: PrismaService) {}

  async generateQueries(auditId: string, _websiteId: string): Promise<void> {
    this.logger.warn(`QueryGeneratorService.generateQueries is a STUB (audit ${auditId})`);
  }
}
