import { extractHtml, hasNoIndexDirective, looksLikeJsRenderedShell } from './html-extractor';

const PAGE_URL = 'https://example.com/blog/post';
const HOST = 'example.com';

describe('extractHtml', () => {
  it('extracts title, meta description, canonical, robots meta, and language', () => {
    const html = `
      <html lang="en-US">
        <head>
          <title> My Great Post </title>
          <meta name="description" content="A description of the post.">
          <link rel="canonical" href="/blog/post">
          <meta name="robots" content="index, follow">
        </head>
        <body><h1>Hi</h1></body>
      </html>`;
    const result = extractHtml(html, PAGE_URL, HOST);
    expect(result.title).toBe('My Great Post');
    expect(result.metaDescription).toBe('A description of the post.');
    expect(result.canonicalUrl).toBe('https://example.com/blog/post');
    expect(result.robotsMeta).toBe('index, follow');
    expect(result.language).toBe('en-US');
  });

  it('extracts headings for every level, in document order, including empty ones', () => {
    const html = `<html><body>
      <h1>Title</h1>
      <h2></h2>
      <h3>  Sub  </h3>
    </body></html>`;
    const result = extractHtml(html, PAGE_URL, HOST);
    expect(result.headings).toEqual([
      { level: 1, text: 'Title' },
      { level: 2, text: '' },
      { level: 3, text: 'Sub' },
    ]);
  });

  it('extracts Open Graph and Twitter Card tags, stripping the og:/twitter: prefix', () => {
    const html = `<html><head>
      <meta property="og:title" content="OG Title">
      <meta property="og:description" content="OG Desc">
      <meta property="og:image" content="/img.png">
      <meta name="twitter:card" content="summary_large_image">
      <meta name="twitter:title" content="Tw Title">
    </head><body></body></html>`;
    const result = extractHtml(html, PAGE_URL, HOST);
    expect(result.ogData).toEqual({ title: 'OG Title', description: 'OG Desc', image: '/img.png' });
    expect(result.twitterData).toEqual({ card: 'summary_large_image', title: 'Tw Title' });
  });

  it('returns null for ogData/twitterData when none are present', () => {
    const result = extractHtml('<html><body>hi</body></html>', PAGE_URL, HOST);
    expect(result.ogData).toBeNull();
    expect(result.twitterData).toBeNull();
  });

  it('parses every JSON-LD block and skips malformed ones without crashing', () => {
    const html = `<html><body>
      <script type="application/ld+json">{"@type": "Organization", "name": "Acme"}</script>
      <script type="application/ld+json">[{"@type": "Product", "name": "Widget"}]</script>
      <script type="application/ld+json">{ not valid json </script>
    </body></html>`;
    const result = extractHtml(html, PAGE_URL, HOST);
    expect(result.jsonLd).toEqual([
      { '@type': 'Organization', name: 'Acme' },
      { '@type': 'Product', name: 'Widget' },
    ]);
  });

  it('extracts images with resolved absolute src and alt text', () => {
    const html = `<html><body>
      <img src="/logo.png" alt="Logo">
      <img src="https://cdn.example.com/photo.jpg">
    </body></html>`;
    const result = extractHtml(html, PAGE_URL, HOST);
    expect(result.images).toEqual([
      { src: 'https://example.com/logo.png', alt: 'Logo' },
      { src: 'https://cdn.example.com/photo.jpg', alt: null },
    ]);
  });

  it('classifies links as internal/external and skips non-navigable hrefs', () => {
    const html = `<html><body>
      <a href="/about">About</a>
      <a href="https://www.example.com/team">Team (www)</a>
      <a href="https://other.com/">Other site</a>
      <a href="mailto:hi@example.com">Email</a>
      <a href="#top">Back to top</a>
      <a href="">Empty</a>
    </body></html>`;
    const result = extractHtml(html, PAGE_URL, HOST);
    expect(result.links).toEqual([
      { href: 'https://example.com/about', anchorText: 'About', isInternal: true },
      { href: 'https://www.example.com/team', anchorText: 'Team (www)', isInternal: true },
      { href: 'https://other.com/', anchorText: 'Other site', isInternal: false },
    ]);
  });

  it('computes contentText/wordCount from visible body text, excluding script/style/nav/footer/header', () => {
    const html = `<html><body>
      <header>Site Nav</header>
      <nav>Menu Item</nav>
      <main><p>This is the real page content that matters for word count.</p></main>
      <footer>Copyright 2026</footer>
      <script>var x = 1;</script>
      <style>.a { color: red; }</style>
    </body></html>`;
    const result = extractHtml(html, PAGE_URL, HOST);
    expect(result.contentText).toBe('This is the real page content that matters for word count.');
    expect(result.wordCount).toBe(11);
  });

  it('does not crash on a document with no <body>', () => {
    const result = extractHtml('<html><head><title>Only Head</title></head></html>', PAGE_URL, HOST);
    expect(result.title).toBe('Only Head');
    expect(result.contentText).toBe('');
    expect(result.wordCount).toBe(0);
  });
});

describe('hasNoIndexDirective', () => {
  it('detects noindex from the meta tag', () => {
    expect(hasNoIndexDirective('noindex, nofollow')).toBe(true);
  });

  it('detects noindex from the X-Robots-Tag header', () => {
    expect(hasNoIndexDirective(null, 'noindex')).toBe(true);
  });

  it('returns false when neither source has noindex', () => {
    expect(hasNoIndexDirective('index, follow', 'all')).toBe(false);
    expect(hasNoIndexDirective(null, null)).toBe(false);
  });
});

describe('looksLikeJsRenderedShell', () => {
  it('flags a low-word-count page backed by substantial HTML as a likely JS shell', () => {
    const extraction = extractHtml('<html><body><div id="root"></div></body></html>', PAGE_URL, HOST);
    expect(looksLikeJsRenderedShell(extraction, 5000)).toBe(true);
  });

  it('does not flag a normal content-rich page', () => {
    const html = `<html><body><p>${'word '.repeat(100)}</p></body></html>`;
    const extraction = extractHtml(html, PAGE_URL, HOST);
    expect(looksLikeJsRenderedShell(extraction, html.length)).toBe(false);
  });
});
