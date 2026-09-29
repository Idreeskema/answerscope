import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { generateQueryCandidates } from './query-generation.helpers';

/**
 * Implements Milestone 6 / spec section 9 (AI Query Generation Engine).
 *
 * generateQueries(auditId, websiteId) reads the Entity + Page rows already
 * persisted for this audit (by the entity analyzer and crawler, which run
 * earlier in the AuditsService pipeline - see audits.service.ts) and turns
 * them into 50-100 Query rows spanning the 15 categories from spec section
 * 9. All the actual heuristics live in query-generation.helpers.ts (pure
 * functions, unit-tested independently) - this service is just the Prisma
 * I/O wrapper around them.
 *
 * Every candidate query is grounded in a real page/entity (see helpers file
 * docblock) - per spec section 9 ("Avoid generic questions that have no
 * relationship to the website") and docs/AGENT_BRIEF.md's "no mock data"
 * principle, we never fabricate a competitor name or a generic query with
 * no traceable source. If a category's real-world signal (e.g. a LOCATION
 * entity for "local" queries) isn't present on this site, that category is
 * simply skipped rather than filled with a placeholder.
 */
@Injectable()
export class QueryGeneratorService {
  private readonly logger = new Logger(QueryGeneratorService.name);
  constructor(private readonly prisma: PrismaService) {}

  async generateQueries(auditId: string, websiteId: string): Promise<void> {
    const audit = await this.prisma.audit.findUniqueOrThrow({ where: { id: auditId } });
    const website = await this.prisma.website.findUniqueOrThrow({ where: { id: websiteId } });

    const [entities, pages] = await Promise.all([
      this.prisma.entity.findMany({ where: { auditId } }),
      audit.crawlJobId
        ? this.prisma.page.findMany({ where: { crawlJobId: audit.crawlJobId } })
        : Promise.resolve([]),
    ]);

    if (pages.length === 0) {
      this.logger.warn(
        `Audit ${auditId} has no crawled pages yet; skipping query generation (nothing real to ground queries in).`,
      );
      return;
    }

    const candidates = generateQueryCandidates({
      website: { domain: website.domain, name: website.name },
      entities,
      pages,
    });

    if (candidates.length === 0) {
      this.logger.warn(`Query generation produced zero grounded candidates for audit ${auditId}.`);
      return;
    }

    await this.prisma.query.createMany({
      data: candidates.map((c) => ({
        websiteId,
        auditId,
        sourcePageId: c.sourcePageId,
        query: c.query,
        intent: c.intent,
        category: c.category,
        topic: c.topic,
        entity: c.entity,
        importance: c.importance,
        status: 'PENDING',
      })),
    });

    this.logger.log(`Generated ${candidates.length} queries for audit ${auditId} (website ${websiteId}).`);
  }
}
