/**
 * URL normalization for crawl deduplication (spec section 5, items 7-9:
 * "avoid duplicate URLs", "normalize URLs").
 *
 * `normalizeUrl` produces a stable dedup key: lower-cased scheme+host,
 * default ports (80/443) stripped, fragment stripped, tracking params
 * (utm_* and a handful of other very common ones) stripped, remaining query
 * params sorted, and trailing slashes normalized (root "/" kept, every other
 * path has its trailing slash removed). Two URLs that differ only in these
 * respects normalize to the same string, which is what gets stored as
 * `Page.normalizedUrl` (the crawl-job-scoped unique dedup key) alongside the
 * original, untouched `Page.url`.
 */

const TRACKING_PARAM_PREFIXES = ['utm_'];
const TRACKING_PARAM_NAMES = new Set([
  'gclid',
  'fbclid',
  'msclkid',
  'mc_cid',
  'mc_eid',
  'igshid',
  'ref',
]);

function isTrackingParam(key: string): boolean {
  const lower = key.toLowerCase();
  return TRACKING_PARAM_PREFIXES.some((prefix) => lower.startsWith(prefix)) || TRACKING_PARAM_NAMES.has(lower);
}

export function normalizeUrl(rawUrl: string, base?: string): string {
  const url = new URL(rawUrl, base);
  url.hash = '';

  const protocol = url.protocol.toLowerCase();
  const hostname = url.hostname.toLowerCase();
  const isDefaultPort =
    url.port === '' ||
    (protocol === 'http:' && url.port === '80') ||
    (protocol === 'https:' && url.port === '443');
  const portPart = isDefaultPort ? '' : `:${url.port}`;

  const params = new URLSearchParams(url.search);
  for (const key of [...params.keys()]) {
    if (isTrackingParam(key)) params.delete(key);
  }
  const sortedEntries = [...params.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const sortedParams = new URLSearchParams();
  sortedEntries.forEach(([k, v]) => sortedParams.append(k, v));
  const searchString = sortedParams.toString();

  let pathname = url.pathname || '/';
  if (pathname.length > 1 && pathname.endsWith('/')) {
    pathname = pathname.slice(0, -1);
  }

  return `${protocol}//${hostname}${portPart}${pathname}${searchString ? `?${searchString}` : ''}`;
}

/** Strips a leading "www." label so "www.example.com" and "example.com" compare equal. */
export function normalizeHostname(hostname: string): string {
  const lower = hostname.toLowerCase();
  return lower.startsWith('www.') ? lower.slice(4) : lower;
}

export function isSameSite(urlA: string, urlB: string): boolean {
  try {
    return normalizeHostname(new URL(urlA).hostname) === normalizeHostname(new URL(urlB).hostname);
  } catch {
    return false;
  }
}

/**
 * Resolves a possibly-relative href against a base URL. Returns null for
 * non-navigable hrefs: empty, pure-fragment ("#section"), or a non-http(s)
 * scheme (mailto:, tel:, javascript:, etc).
 */
export function resolveHref(href: string, base: string): URL | null {
  const trimmed = href.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  try {
    const resolved = new URL(trimmed, base);
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') return null;
    return resolved;
  } catch {
    return null;
  }
}
