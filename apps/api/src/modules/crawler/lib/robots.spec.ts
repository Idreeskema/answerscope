import { fetchViaHttp } from './http-client';
import { fetchRobots, parseRobotsTxt } from './robots';

jest.mock('./http-client');
const mockFetchViaHttp = fetchViaHttp as jest.MockedFunction<typeof fetchViaHttp>;

describe('parseRobotsTxt (pure, no network - built directly from a robots.txt string)', () => {
  const sample = [
    'User-agent: *',
    'Disallow: /private',
    'Disallow: /admin/',
    'Allow: /',
    'Sitemap: https://example.com/sitemap.xml',
    'Sitemap: https://example.com/sitemap-news.xml',
  ].join('\n');

  it('allows a path with no matching Disallow rule', () => {
    const robots = parseRobotsTxt('https://example.com/robots.txt', sample);
    expect(robots.isAllowed('https://example.com/', 'AnyBot/1.0')).toBe(true);
    expect(robots.isAllowed('https://example.com/blog/post', 'AnyBot/1.0')).toBe(true);
  });

  it('disallows a path matching a Disallow rule', () => {
    const robots = parseRobotsTxt('https://example.com/robots.txt', sample);
    expect(robots.isAllowed('https://example.com/private', 'AnyBot/1.0')).toBe(false);
    expect(robots.isAllowed('https://example.com/admin/settings', 'AnyBot/1.0')).toBe(false);
  });

  it('extracts every Sitemap: line', () => {
    const robots = parseRobotsTxt('https://example.com/robots.txt', sample);
    expect(robots.sitemaps).toEqual([
      'https://example.com/sitemap.xml',
      'https://example.com/sitemap-news.xml',
    ]);
  });

  it('stores the raw content verbatim', () => {
    const robots = parseRobotsTxt('https://example.com/robots.txt', sample);
    expect(robots.content).toBe(sample);
  });

  it('defaults to allow-all for an empty robots.txt', () => {
    const robots = parseRobotsTxt('https://example.com/robots.txt', '');
    expect(robots.isAllowed('https://example.com/anything', 'AnyBot/1.0')).toBe(true);
    expect(robots.sitemaps).toEqual([]);
  });
});

describe('fetchRobots (network via the mocked HTTP client)', () => {
  const options = { timeoutMs: 5000, userAgent: 'TestBot/1.0' };

  beforeEach(() => {
    mockFetchViaHttp.mockReset();
  });

  it('parses a successfully-fetched robots.txt', async () => {
    mockFetchViaHttp.mockResolvedValue({
      requestedUrl: 'https://example.com/robots.txt',
      finalUrl: 'https://example.com/robots.txt',
      redirectedFrom: null,
      statusCode: 200,
      headers: {},
      body: 'User-agent: *\nDisallow: /secret\nSitemap: https://example.com/sitemap.xml',
      fetchTimeMs: 10,
    });

    const robots = await fetchRobots('https://example.com/', options);
    expect(robots.content).toContain('Disallow: /secret');
    expect(robots.sitemaps).toEqual(['https://example.com/sitemap.xml']);
    expect(robots.isAllowed('https://example.com/secret', 'TestBot/1.0')).toBe(false);
  });

  it('degrades to allow-all when robots.txt returns a 404', async () => {
    mockFetchViaHttp.mockResolvedValue({
      requestedUrl: 'https://example.com/robots.txt',
      finalUrl: 'https://example.com/robots.txt',
      redirectedFrom: null,
      statusCode: 404,
      headers: {},
      body: '',
      fetchTimeMs: 5,
    });

    const robots = await fetchRobots('https://example.com/', options);
    expect(robots.content).toBeNull();
    expect(robots.isAllowed('https://example.com/anything', 'TestBot/1.0')).toBe(true);
  });

  it('degrades to allow-all when the fetch throws (network error, timeout, ...)', async () => {
    mockFetchViaHttp.mockRejectedValue(new Error('simulated network failure'));

    const robots = await fetchRobots('https://example.com/', options);
    expect(robots.content).toBeNull();
    expect(robots.sitemaps).toEqual([]);
    expect(robots.isAllowed('https://example.com/anything', 'TestBot/1.0')).toBe(true);
  });

  it('degrades to allow-all when the site root URL is blocked by the SSRF guard (never calls the HTTP client)', async () => {
    const robots = await fetchRobots('http://127.0.0.1/', options);
    expect(robots.content).toBeNull();
    expect(robots.isAllowed('http://127.0.0.1/anything', 'TestBot/1.0')).toBe(true);
    expect(mockFetchViaHttp).not.toHaveBeenCalled();
  });
});
