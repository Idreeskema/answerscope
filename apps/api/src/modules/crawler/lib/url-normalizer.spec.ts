import { isSameSite, normalizeHostname, normalizeUrl, resolveHref } from './url-normalizer';

describe('normalizeUrl', () => {
  it('lower-cases scheme and host', () => {
    expect(normalizeUrl('HTTPS://Example.COM/Path')).toBe('https://example.com/Path');
  });

  it('strips the default port for http and https', () => {
    expect(normalizeUrl('http://example.com:80/foo')).toBe('http://example.com/foo');
    expect(normalizeUrl('https://example.com:443/foo')).toBe('https://example.com/foo');
  });

  it('keeps a non-default port', () => {
    expect(normalizeUrl('http://example.com:8080/foo')).toBe('http://example.com:8080/foo');
  });

  it('strips the fragment', () => {
    expect(normalizeUrl('https://example.com/foo#section-2')).toBe('https://example.com/foo');
  });

  it('strips utm_* and other common tracking params, keeps and sorts the rest', () => {
    expect(normalizeUrl('https://example.com/foo?utm_source=x&b=2&utm_campaign=y&a=1')).toBe(
      'https://example.com/foo?a=1&b=2',
    );
    expect(normalizeUrl('https://example.com/foo?fbclid=abc&gclid=xyz')).toBe('https://example.com/foo');
  });

  it('normalizes trailing slashes but keeps the root "/"', () => {
    expect(normalizeUrl('https://example.com/foo/')).toBe('https://example.com/foo');
    expect(normalizeUrl('https://example.com/')).toBe('https://example.com/');
    expect(normalizeUrl('https://example.com')).toBe('https://example.com/');
  });

  it('produces the same dedup key for equivalent URLs', () => {
    const a = normalizeUrl('https://Example.com:443/products/?utm_source=fb&b=2&a=1');
    const b = normalizeUrl('https://example.com/products?a=1&b=2&utm_source=google#reviews');
    expect(a).toBe(b);
  });

  it('resolves a relative URL against a base', () => {
    expect(normalizeUrl('/about', 'https://example.com/other')).toBe('https://example.com/about');
  });
});

describe('normalizeHostname', () => {
  it('strips a leading www.', () => {
    expect(normalizeHostname('www.Example.com')).toBe('example.com');
    expect(normalizeHostname('example.com')).toBe('example.com');
  });
});

describe('isSameSite', () => {
  it('treats www and bare domain as the same site', () => {
    expect(isSameSite('https://www.example.com/a', 'https://example.com/b')).toBe(true);
  });

  it('treats different domains as different sites', () => {
    expect(isSameSite('https://example.com/a', 'https://other.com/a')).toBe(false);
  });

  it('returns false for an unparsable URL rather than throwing', () => {
    expect(isSameSite('not a url', 'https://example.com/')).toBe(false);
  });
});

describe('resolveHref', () => {
  const base = 'https://example.com/blog/post';

  it('resolves a relative href against the base', () => {
    expect(resolveHref('/about', base)?.toString()).toBe('https://example.com/about');
    expect(resolveHref('../pricing', base)?.toString()).toBe('https://example.com/pricing');
  });

  it('rejects a pure-fragment href', () => {
    expect(resolveHref('#section', base)).toBeNull();
  });

  it('rejects non-http(s) schemes', () => {
    expect(resolveHref('mailto:hello@example.com', base)).toBeNull();
    expect(resolveHref('tel:+15551234567', base)).toBeNull();
    expect(resolveHref('javascript:void(0)', base)).toBeNull();
  });

  it('rejects an empty href', () => {
    expect(resolveHref('', base)).toBeNull();
  });

  it('resolves an already-absolute href unchanged', () => {
    expect(resolveHref('https://other.com/page', base)?.toString()).toBe('https://other.com/page');
  });
});
