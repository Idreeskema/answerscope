import { Injectable, Logger } from '@nestjs/common';
import { EntityType, Page, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  CONFIDENCE_FOOTER_COPYRIGHT,
  CONFIDENCE_OG_SITE_NAME,
  CONFIDENCE_TITLE_SUFFIX,
  EntityCandidate,
  extractCopyrightOwner,
  extractOgSiteName,
  firstSentences,
  guessBrandFromTitles,
  looksLikeAboutOrContactPage,
  mapJsonLdBlockToCandidate,
} from './entity-analyzer.helpers';
import { flattenJsonLdBlocks } from './json-ld.helpers';

function safePathname(url: string): string {
  try {
    return new URL(url).pathname.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

function isHomepage(page: Pick<Page, 'url' | 'normalizedUrl'>): boolean {
  const path = safePathname(page.normalizedUrl || page.url);
  return path === '' || path === '/';
}

/**
 * Entity Analyzer (Milestone 4 "Entity Analyzer" piece; feeds the GEO
 * analyzer's "Entity Clarity" section, spec section 8). Creates Entity rows
 * describing what organization/person/product/service the crawled website
 * represents.
 *
 * Extraction strategy, in priority order:
 *  1. JSON-LD (Organization/LocalBusiness/Person/Product/Service blocks in
 *     Page.jsonLd) - real structured data, highest confidence.
 *  2. If (and only if) no JSON-LD Organization/LocalBusiness entity was
 *     found anywhere in the crawl, fall back to deterministic textual
 *     heuristics to still name the site's primary organization:
 *       a. `og:site_name` (Page.ogData.site_name) - a well-known convention.
 *       b. A footer copyright line, e.g. "(c) 2026 Acme Inc." - `contentText`
 *          is expected to include page-chrome text like the footer.
 *       c. A brand segment repeated across multiple page <title>s, e.g.
 *          "Products | Acme", "About | Acme" -> "Acme".
 *     These fallbacks are tried in that order (most reliable first) and the
 *     first one that produces a name wins.
 *  3. Separately, if a crawled page looks like an About/Contact page (see
 *     looksLikeAboutOrContactPage), its opening sentences are used to
 *     enrich the organization entity's `description` when one wasn't
 *     already supplied by JSON-LD.
 *
 * Known limitation: Person/Product/Service entities are only ever created
 * from JSON-LD - there is no reliable deterministic textual heuristic for
 * "find the product this page is about" without NLP/NER, which is out of
 * scope for a rule-based extractor. This is a real gap the GEO analyzer's
 * "Entity Clarity" section should be aware of (fewer JSON-LD blocks =>
 * fewer entities, by design; we do not fabricate entities to compensate).
 */
@Injectable()
export class EntityAnalyzerService {
  private readonly logger = new Logger(EntityAnalyzerService.name);
  constructor(private readonly prisma: PrismaService) {}

  async analyze(auditId: string, websiteId: string, crawlJobId: string): Promise<void> {
    const pages = await this.prisma.page.findMany({ where: { crawlJobId } });
    if (pages.length === 0) {
      this.logger.warn(`No pages found for crawl job ${crawlJobId}; skipping entity analysis`);
      return;
    }

    const candidates: EntityCandidate[] = [];
    for (const page of pages) {
      for (const block of flattenJsonLdBlocks(page.jsonLd)) {
        const candidate = mapJsonLdBlockToCandidate(block, page.id);
        if (candidate) candidates.push(candidate);
      }
    }

    const merged = this.mergeCandidates(candidates);

    const hasJsonLdOrg = merged.some((c) => c.type === 'ORGANIZATION');
    if (!hasJsonLdOrg) {
      const fallback = this.buildOrganizationFallback(pages);
      if (fallback) merged.push(fallback);
    }

    // Enrich whichever organization entity we ended up with (JSON-LD or
    // fallback) with a description from an About/Contact page, if it
    // doesn't already have one.
    const orgEntity = merged.find((c) => c.type === 'ORGANIZATION');
    if (orgEntity && !orgEntity.description) {
      const aboutDescription = this.findAboutPageDescription(pages);
      if (aboutDescription) orgEntity.description = aboutDescription;
    }

    await this.prisma.$transaction([
      this.prisma.entity.deleteMany({ where: { auditId } }),
      this.prisma.entity.createMany({
        data: merged.map<Prisma.EntityCreateManyInput>((c) => ({
          websiteId,
          auditId,
          sourcePageId: c.sourcePageId,
          name: c.name,
          type: c.type,
          description: c.description,
          confidence: c.confidence,
          relationships: c.relationships as unknown as Prisma.InputJsonValue,
        })),
      }),
    ]);

    this.logger.log(`Wrote ${merged.length} Entity rows`);
  }

  /**
   * Collapses candidates referring to the same real-world entity (same
   * type + case-insensitive name) into one row - the same Organization
   * JSON-LD block repeated in every page's header/footer should produce
   * one Entity, not one per page. The first-seen occurrence's
   * `sourcePageId` is kept as the citation; relationships are unioned; and
   * descriptions prefer whichever occurrence's is longest/non-empty.
   */
  private mergeCandidates(candidates: EntityCandidate[]): EntityCandidate[] {
    const byKey = new Map<string, EntityCandidate>();
    for (const c of candidates) {
      const key = `${c.type}::${c.name.trim().toLowerCase()}`;
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, { ...c, relationships: [...c.relationships] });
        continue;
      }
      if ((c.description?.length ?? 0) > (existing.description?.length ?? 0)) {
        existing.description = c.description;
      }
      for (const rel of c.relationships) {
        if (!existing.relationships.some((r) => r.type === rel.type && r.targetName === rel.targetName)) {
          existing.relationships.push(rel);
        }
      }
    }
    return [...byKey.values()];
  }

  private buildOrganizationFallback(pages: Page[]): EntityCandidate | null {
    const homepage = pages.find((p) => isHomepage(p)) ?? pages[0];

    for (const page of pages) {
      const ogName = extractOgSiteName(page.ogData);
      if (ogName) {
        return {
          name: ogName,
          type: 'ORGANIZATION' as EntityType,
          description: null,
          confidence: CONFIDENCE_OG_SITE_NAME,
          sourcePageId: page.id,
          relationships: [],
        };
      }
    }

    for (const page of pages) {
      const owner = extractCopyrightOwner(page.contentText);
      if (owner) {
        return {
          name: owner,
          type: 'ORGANIZATION' as EntityType,
          description: null,
          confidence: CONFIDENCE_FOOTER_COPYRIGHT,
          sourcePageId: page.id,
          relationships: [],
        };
      }
    }

    const titles = pages.map((p) => p.title).filter((t): t is string => !!t);
    const brand = guessBrandFromTitles(titles);
    if (brand) {
      return {
        name: brand,
        type: 'ORGANIZATION' as EntityType,
        description: null,
        confidence: CONFIDENCE_TITLE_SUFFIX,
        sourcePageId: homepage?.id ?? null,
        relationships: [],
      };
    }

    return null;
  }

  private findAboutPageDescription(pages: Page[]): string | null {
    for (const page of pages) {
      const path = safePathname(page.normalizedUrl || page.url);
      if (looksLikeAboutOrContactPage(path, page.title)) {
        const sentences = firstSentences(page.contentText, 2);
        if (sentences) return sentences;
      }
    }
    return null;
  }
}
