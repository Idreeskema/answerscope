/**
 * Shared JSON-LD parsing helpers used by both the Entity Analyzer and the
 * Schema Analyzer (both live under analysis/content/, so this is a
 * within-module shared file, not a cross-module dependency).
 *
 * Page.jsonLd stores one array entry per <script type="application/ld+json">
 * tag found on the page. Each entry may itself be a single object, an array
 * of objects, or an object using an `@graph` wrapper (a common pattern for
 * bundling multiple entities in one script tag). flattenJsonLdBlocks()
 * normalizes all of those shapes into a flat list of plain schema.org
 * objects, each expected to carry its own `@type`.
 */
export function flattenJsonLdBlocks(raw: unknown): Record<string, any>[] {
  if (!raw) return [];
  const topLevel = Array.isArray(raw) ? raw : [raw];
  const result: Record<string, any>[] = [];
  for (const entry of topLevel) {
    collect(entry, result);
  }
  return result;
}

function collect(entry: unknown, out: Record<string, any>[]): void {
  if (!entry || typeof entry !== 'object') return;
  if (Array.isArray(entry)) {
    for (const item of entry) collect(item, out);
    return;
  }
  const obj = entry as Record<string, any>;
  if (Array.isArray(obj['@graph'])) {
    for (const item of obj['@graph']) collect(item, out);
    return;
  }
  out.push(obj);
}

/** Normalizes a JSON-LD block's `@type` (string | string[] | undefined) into
 * a flat array of type names. */
export function getSchemaTypes(block: Record<string, any>): string[] {
  const t = block?.['@type'];
  if (!t) return [];
  return Array.isArray(t) ? t.filter((x) => typeof x === 'string') : typeof t === 'string' ? [t] : [];
}
