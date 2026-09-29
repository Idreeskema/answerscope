import { fetchViaHttp, HttpFetchResult } from './http-client';
import { discoverSitemapUrls } from './sitemap';

jest.mock('./http-client');
const mockFetchViaHttp = fetchViaHttp as jest.MockedFunction<typeof fetchViaHttp>;

function xmlResult(url: string, statusCode: number, body: string): HttpFetchResult {
  return { requestedUrl: url, finalUrl: url, redirectedFrom: null, statusCode, headers: {}, body, fetchTimeMs: 5 };
}

describe('discoverSitemapUrls', () => {
  const options = { timeoutMs: 5000, userAgent: 'TestBot/1.0' };

  beforeEach(() => {
    mockFetchViaHttp.mockReset();
  });

  it('parses a flat urlset sitemap', async () => {
    mockFetchViaHttp.mockResolvedValue(
      xmlResult(
        'https://example.com/sitemap.xml',
        200,
        '<?xml version="1.0"?><urlset><url><loc>https://example.com/</loc></url><url><loc>https://example.com/about</loc></url></urlset>',
      ),
    );

    const urls = await discoverSitemapUrls(['https://example.com/sitemap.xml'], options);
    expect(urls.sort()).toEqual(['https://example.com/', 'https://example.com/about']);
  });

  it('handles a urlset with a single <url> entry (fast-xml-parser does not wrap it in an array)', async () => {
    mockFetchViaHttp.mockResolvedValue(
      xmlResult(
        'https://example.com/sitemap.xml',
        200,
        '<?xml version="1.0"?><urlset><url><loc>https://example.com/only</loc></url></urlset>',
      ),
    );

    const urls = await discoverSitemapUrls(['https://example.com/sitemap.xml'], options);
    expect(urls).toEqual(['https://example.com/only']);
  });

  it('recursively follows a sitemap index into its child sitemaps', async () => {
    mockFetchViaHttp.mockImplementation(async (url: string) => {
      if (url === 'https://example.com/sitemap-index.xml') {
        return xmlResult(
          url,
          200,
          '<sitemapindex><sitemap><loc>https://example.com/sitemap-a.xml</loc></sitemap><sitemap><loc>https://example.com/sitemap-b.xml</loc></sitemap></sitemapindex>',
        );
      }
      if (url === 'https://example.com/sitemap-a.xml') {
        return xmlResult(url, 200, '<urlset><url><loc>https://example.com/a1</loc></url></urlset>');
      }
      if (url === 'https://example.com/sitemap-b.xml') {
        return xmlResult(url, 200, '<urlset><url><loc>https://example.com/b1</loc></url></urlset>');
      }
      throw new Error(`unexpected url ${url}`);
    });

    const urls = await discoverSitemapUrls(['https://example.com/sitemap-index.xml'], options);
    expect(urls.sort()).toEqual(['https://example.com/a1', 'https://example.com/b1']);
  });

  it('skips a sitemap that 404s and keeps discovering from the rest', async () => {
    mockFetchViaHttp.mockImplementation(async (url: string) => {
      if (url === 'https://example.com/broken.xml') {
        return xmlResult(url, 404, '');
      }
      return xmlResult(url, 200, '<urlset><url><loc>https://example.com/ok</loc></url></urlset>');
    });

    const urls = await discoverSitemapUrls(
      ['https://example.com/broken.xml', 'https://example.com/good.xml'],
      options,
    );
    expect(urls).toEqual(['https://example.com/ok']);
  });

  it('skips a sitemap with malformed XML rather than throwing', async () => {
    mockFetchViaHttp.mockResolvedValue(xmlResult('https://example.com/sitemap.xml', 200, '<not><valid'));

    await expect(discoverSitemapUrls(['https://example.com/sitemap.xml'], options)).resolves.toEqual([]);
  });

  it('skips a candidate sitemap URL blocked by the SSRF guard without throwing', async () => {
    const urls = await discoverSitemapUrls(['http://127.0.0.1/sitemap.xml'], options);
    expect(urls).toEqual([]);
    expect(mockFetchViaHttp).not.toHaveBeenCalled();
  });

  it('deduplicates URLs discovered across multiple sitemaps', async () => {
    mockFetchViaHttp.mockImplementation(async (url: string) => {
      return xmlResult(url, 200, '<urlset><url><loc>https://example.com/shared</loc></url></urlset>');
    });

    const urls = await discoverSitemapUrls(
      ['https://example.com/sitemap-1.xml', 'https://example.com/sitemap-2.xml'],
      options,
    );
    expect(urls).toEqual(['https://example.com/shared']);
  });
});
