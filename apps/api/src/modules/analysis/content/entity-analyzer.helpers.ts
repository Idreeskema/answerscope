import { EntityType } from '@prisma/client';
import { getSchemaTypes } from './json-ld.helpers';

/**
 * Pure, deterministic helpers for the Entity Analyzer (Milestone 4 "Entity
 * Analyzer" piece / spec section 8 "Entity Clarity" feeder). No Prisma
 * access here so these can be unit-tested with plain fixtures.
 *
 * Confidence values are fixed, documented constants expressing how
 * reliable each *source* of the extraction is - never a fabricated
 * per-audit statistic. JSON-LD is real structured data the site author
 * published, so it gets the highest confidence; footer copyright text and
 * `og:site_name` are strong, well-known conventions; a title-suffix guess
 * is the weakest signal we use.
 */
export const CONFIDENCE_JSON_LD = 0.9;
export const CONFIDENCE_OG_SITE_NAME = 0.6;
export const CONFIDENCE_FOOTER_COPYRIGHT = 0.55;
export const CONFIDENCE_TITLE_SUFFIX = 0.45;

export interface EntityRelationship {
  type: string;
  targetName: string;
}

export interface EntityCandidate {
  name: string;
  type: EntityType;
  description: string | null;
  confidence: number;
  sourcePageId: string | null;
  relationships: EntityRelationship[];
}

const JSON_LD_TYPE_MAP: Record<string, EntityType> = {
  Organization: 'ORGANIZATION',
  Corporation: 'ORGANIZATION',
  NGO: 'ORGANIZATION',
  LocalBusiness: 'ORGANIZATION',
  Person: 'PERSON',
  Product: 'PRODUCT',
  Service: 'SERVICE',
};

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function namedRefRelationship(type: string, ref: unknown): EntityRelationship | null {
  if (!ref) return null;
  if (typeof ref === 'string') return { type, targetName: ref };
  if (typeof ref === 'object' && ref !== null) {
    const name = str((ref as Record<string, unknown>).name);
    if (name) return { type, targetName: name };
  }
  return null;
}

/**
 * Maps one flattened JSON-LD block to an EntityCandidate, or null if the
 * block's @type isn't one we extract entities for (Organization/Person/
 * Product/Service/LocalBusiness only - matches spec section 4's Entity
 * Analyzer scope).
 */
export function mapJsonLdBlockToCandidate(
  block: Record<string, any>,
  sourcePageId: string | null,
): EntityCandidate | null {
  const types = getSchemaTypes(block);
  const matchedType = types.map((t) => JSON_LD_TYPE_MAP[t]).find((t): t is EntityType => !!t);
  if (!matchedType) return null;

  const name = str(block.name);
  if (!name) return null;

  const relationships: EntityRelationship[] = [];
  if (matchedType === 'PERSON') {
    const worksFor = namedRefRelationship('WORKS_FOR', block.worksFor);
    if (worksFor) relationships.push(worksFor);
  }
  if (matchedType === 'PRODUCT') {
    const brand = namedRefRelationship('MANUFACTURED_BY', block.brand ?? block.manufacturer);
    if (brand) relationships.push(brand);
  }
  if (matchedType === 'SERVICE') {
    const provider = namedRefRelationship('PROVIDED_BY', block.provider);
    if (provider) relationships.push(provider);
  }
  if (matchedType === 'ORGANIZATION') {
    const sameAs = block.sameAs;
    const sameAsList = Array.isArray(sameAs) ? sameAs : sameAs ? [sameAs] : [];
    for (const s of sameAsList) {
      const v = str(s);
      if (v) relationships.push({ type: 'SAME_AS', targetName: v });
    }
  }

  return {
    name,
    type: matchedType,
    description: str(block.description),
    confidence: CONFIDENCE_JSON_LD,
    sourcePageId,
    relationships,
  };
}

// ---------------------------------------------------------------------------
// Heuristic fallbacks (only used when no JSON-LD Organization/LocalBusiness
// entity was found anywhere in the crawl - see entity-analyzer.service.ts).
// ---------------------------------------------------------------------------

export function extractOgSiteName(ogData: unknown): string | null {
  if (!ogData || typeof ogData !== 'object') return null;
  const og = ogData as Record<string, unknown>;
  return str(og.site_name) ?? str(og.siteName) ?? null;
}

const TITLE_SEPARATOR_RE = /\s*[|\-–—:]\s*/;

/**
 * Given a set of page titles, guesses the site/brand name by looking for a
 * short segment (after splitting on common separators like "|" or "-")
 * that repeats as either the first or last segment across multiple titles
 * - the classic "Page Name | Brand" or "Brand | Page Name" convention.
 * Returns null if no clear repeated pattern exists.
 */
export function guessBrandFromTitles(titles: string[]): string | null {
  const counts = new Map<string, number>();
  for (const title of titles) {
    const segments = title.split(TITLE_SEPARATOR_RE).map((s) => s.trim()).filter(Boolean);
    if (segments.length < 2) continue;
    const first = segments[0];
    const last = segments[segments.length - 1];
    for (const candidate of [first, last]) {
      // A brand segment is usually short (not a full sentence/page title).
      if (candidate.length > 0 && candidate.length <= 40) {
        counts.set(candidate, (counts.get(candidate) ?? 0) + 1);
      }
    }
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [candidate, count] of counts) {
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  // Require at least 2 titles agreeing, unless there's only one title total
  // (single-page site) in which case a single occurrence is all we can get.
  if (best && (bestCount >= 2 || titles.length === 1)) return best;
  return null;
}

const COPYRIGHT_RE =
  /(?:©|\(c\)|copyright)\s*\d{4}(?:\s*[-–]\s*\d{4})?\s*,?\s+([A-Z][A-Za-z0-9&.,'’\-\s]{1,60}?)(?=[.\n]|\s{2,}|all rights reserved|$)/i;

/** Extracts a candidate organization name from a footer-style copyright
 * line such as "© 2026 Acme Inc." or "Copyright 2024-2026, Acme Inc. All
 * rights reserved." */
export function extractCopyrightOwner(text: string | null | undefined): string | null {
  if (!text) return null;
  const match = COPYRIGHT_RE.exec(text);
  if (!match) return null;
  const owner = match[1].trim().replace(/\s+/g, ' ');
  return owner.length > 0 ? owner : null;
}

const ABOUT_CONTACT_PATH_RE = /\/(about|about-us|contact|contact-us|company|who-we-are)(\/|$)/i;
const ABOUT_CONTACT_TITLE_RE = /\b(about us|about|contact us|contact|company|who we are)\b/i;

export function looksLikeAboutOrContactPage(pathname: string, title: string | null): boolean {
  return ABOUT_CONTACT_PATH_RE.test(pathname) || (!!title && ABOUT_CONTACT_TITLE_RE.test(title));
}

/** Returns the first 1-2 sentences of a text block, for use as a short
 * description enrichment (e.g. from an About page). */
export function firstSentences(text: string | null | undefined, count = 2): string | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  const sentences = trimmed.split(/(?<=[.!?])\s+/).filter(Boolean);
  const picked = sentences.slice(0, count).join(' ').trim();
  return picked.length > 0 ? picked : null;
}
