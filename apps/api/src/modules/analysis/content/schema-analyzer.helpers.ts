/**
 * Pure, deterministic schema.org "required property" validation for the
 * Schema Analyzer (spec section 6's Structured Data list + Milestone 4).
 *
 * This is intentionally a small, self-authored lookup table - not a full
 * schema.org/Google Rich Results validator. It covers the 9 types the spec
 * explicitly calls out (Organization, WebSite, Article, Product, FAQPage,
 * BreadcrumbList, LocalBusiness, Person, Service). For any other JSON-LD
 * @type we encounter (ImageObject, Review, Recipe, ...), we don't have a
 * documented rule, so we deliberately do NOT fail it - we record it with
 * isValid=true and no errors, rather than fabricating a validation
 * judgment we can't actually back up with a rule (see agent brief's "no
 * arbitrary score" principle - the same applies to arbitrary "invalid"
 * judgments).
 */

export interface SchemaValidationResult {
  isValid: boolean;
  errors: string[];
}

/** Top-level properties required for each known type. Structural checks
 * (array shape, nested required fields) for FAQPage/BreadcrumbList/
 * LocalBusiness are handled separately in validateSchemaBlock below. */
const REQUIRED_TOP_LEVEL_FIELDS: Record<string, string[]> = {
  Organization: ['name', 'url'],
  WebSite: ['name', 'url'],
  Article: ['headline', 'author'],
  BlogPosting: ['headline', 'author'],
  NewsArticle: ['headline', 'author'],
  Product: ['name'],
  FAQPage: ['mainEntity'],
  BreadcrumbList: ['itemListElement'],
  LocalBusiness: ['name'],
  Person: ['name'],
  Service: ['name'],
};

const KNOWN_TYPES = new Set(Object.keys(REQUIRED_TOP_LEVEL_FIELDS));

export function isKnownSchemaType(type: string): boolean {
  return KNOWN_TYPES.has(type);
}

function hasValue(v: unknown): boolean {
  return v !== undefined && v !== null && v !== '';
}

export function validateSchemaBlock(type: string, block: Record<string, any>): SchemaValidationResult {
  const requiredFields = REQUIRED_TOP_LEVEL_FIELDS[type];
  if (!requiredFields) {
    // Unknown/unsupported type - no fabricated verdict, see doc comment.
    return { isValid: true, errors: [] };
  }

  const errors: string[] = [];
  for (const field of requiredFields) {
    if (!hasValue(block[field])) {
      errors.push(`Missing required property "${field}" for ${type}`);
    }
  }

  if (type === 'FAQPage' && hasValue(block.mainEntity)) {
    const items = Array.isArray(block.mainEntity) ? block.mainEntity : [block.mainEntity];
    if (items.length === 0) {
      errors.push('FAQPage.mainEntity must be a non-empty array of Question items');
    }
    items.forEach((item: any, i: number) => {
      if (!hasValue(item?.name)) {
        errors.push(`FAQPage.mainEntity[${i}] is missing a question "name"`);
      }
      if (!hasValue(item?.acceptedAnswer?.text)) {
        errors.push(`FAQPage.mainEntity[${i}] is missing "acceptedAnswer.text"`);
      }
    });
  }

  if (type === 'BreadcrumbList' && hasValue(block.itemListElement)) {
    const items = Array.isArray(block.itemListElement) ? block.itemListElement : [block.itemListElement];
    if (items.length === 0) {
      errors.push('BreadcrumbList.itemListElement must be a non-empty array');
    }
    items.forEach((item: any, i: number) => {
      if (!hasValue(item?.position)) {
        errors.push(`BreadcrumbList.itemListElement[${i}] is missing "position"`);
      }
      if (!hasValue(item?.name) && !hasValue(item?.item)) {
        errors.push(`BreadcrumbList.itemListElement[${i}] is missing both "name" and "item"`);
      }
    });
  }

  if (type === 'LocalBusiness' && !hasValue(block.address)) {
    errors.push('Missing required property "address" for LocalBusiness');
  }

  return { isValid: errors.length === 0, errors };
}
