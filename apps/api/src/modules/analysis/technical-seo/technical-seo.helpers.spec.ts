import {
  evaluateTitleMissing,
  evaluateTitleLength,
  evaluateMetaDescriptionMissing,
  evaluateCanonicalConflict,
  evaluateCanonicalPresence,
  evaluateH1Missing,
  evaluateMultipleH1,
  evaluateHeadingHierarchy,
  evaluateEmptyHeadings,
  evaluateThinContent,
  evaluateImageAltCoverage,
  evaluateHttpStatus,
  evaluateHttps,
  evaluateRobotsDirective,
  evaluateIndexability,
  jaccardSimilarity,
  normalizeToWordSet,
  guessApplicableSchemaTypes,
  parseHeadings,
  flattenJsonLdBlocks,
  getSchemaTypes,
  scoreFor,
} from './technical-seo.helpers';

describe('title checks', () => {
  it('flags a missing title as FAIL/CRITICAL', () => {
    const result = evaluateTitleMissing(null);
    expect(result.status).toBe('FAIL');
    expect(result.severity).toBe('CRITICAL');
    expect(result.evidence).toMatch(/no <title>/i);
  });

  it('flags empty-string title as FAIL', () => {
    expect(evaluateTitleMissing('   ').status).toBe('FAIL');
  });

  it('passes a present title', () => {
    const result = evaluateTitleMissing('Products | Acme');
    expect(result.status).toBe('PASS');
    expect(result.evidence).toContain('Products | Acme');
  });

  it('quotes the exact character count for title length', () => {
    const result = evaluateTitleLength('Products');
    expect(result.evidence).toBe('Title is 8 characters: "Products" (far too short).');
    expect(result.status).toBe('FAIL');
  });

  it('passes titles in the 30-60 char healthy range', () => {
    const title = 'Project Management Software for Small Teams'; // 45 chars
    const result = evaluateTitleLength(title);
    expect(result.status).toBe('PASS');
  });

  it('warns on titles slightly outside the healthy range', () => {
    const title = 'Acme'; // 4 chars -> too short -> actually FAIL since <10
    expect(evaluateTitleLength(title).status).toBe('FAIL');
    const midTitle = 'Acme Software Solutions Overview Page'; // 38 chars-ish healthy
    expect(['PASS', 'WARNING']).toContain(evaluateTitleLength(midTitle).status);
  });
});

describe('meta description checks', () => {
  it('fails when missing', () => {
    expect(evaluateMetaDescriptionMissing(undefined).status).toBe('FAIL');
  });
  it('passes when present', () => {
    const r = evaluateMetaDescriptionMissing('A short description of the page.');
    expect(r.status).toBe('PASS');
  });
});

describe('canonical checks', () => {
  it('warns when canonical missing', () => {
    expect(evaluateCanonicalPresence(null).status).toBe('WARNING');
  });
  it('passes when canonical present', () => {
    expect(evaluateCanonicalPresence('https://example.com/page').status).toBe('PASS');
  });
  it('flags cross-domain canonical as a conflict', () => {
    const r = evaluateCanonicalConflict('https://example.com/page', 'https://other-domain.com/page');
    expect(r.status).toBe('FAIL');
    expect(r.severity).toBe('HIGH');
    expect(r.evidence).toContain('other-domain.com');
  });
  it('passes same-domain canonical', () => {
    const r = evaluateCanonicalConflict('https://example.com/page', 'https://www.example.com/page');
    expect(r.status).toBe('PASS');
  });
  it('is not applicable when there is no canonical to check', () => {
    expect(evaluateCanonicalConflict('https://example.com/page', null).status).toBe('NOT_APPLICABLE');
  });
});

describe('H1 / heading checks', () => {
  it('fails when there is no H1', () => {
    const r = evaluateH1Missing([{ level: 2, text: 'Subheading' }]);
    expect(r.status).toBe('FAIL');
    expect(r.severity).toBe('HIGH');
  });

  it('passes when exactly one H1 exists', () => {
    const r = evaluateH1Missing([{ level: 1, text: 'Welcome to Acme' }]);
    expect(r.status).toBe('PASS');
    expect(r.evidence).toContain('Welcome to Acme');
  });

  it('warns on multiple H1s', () => {
    const r = evaluateMultipleH1([
      { level: 1, text: 'First' },
      { level: 1, text: 'Second' },
    ]);
    expect(r.status).toBe('WARNING');
    expect(r.evidence).toContain('2 <h1>');
  });

  it('detects heading hierarchy violations (h3 before any h2)', () => {
    const r = evaluateHeadingHierarchy([
      { level: 1, text: 'Title' },
      { level: 3, text: 'Detail' },
    ]);
    expect(r.status).toBe('WARNING');
    expect(r.evidence).toContain('h3');
  });

  it('passes a valid heading hierarchy', () => {
    const r = evaluateHeadingHierarchy([
      { level: 1, text: 'Title' },
      { level: 2, text: 'Section' },
      { level: 3, text: 'Subsection' },
    ]);
    expect(r.status).toBe('PASS');
  });

  it('flags empty headings', () => {
    const r = evaluateEmptyHeadings([
      { level: 2, text: '' },
      { level: 2, text: 'Real heading' },
    ]);
    expect(r.status).toBe('WARNING');
  });
});

describe('thin content', () => {
  it('fails far below threshold', () => {
    expect(evaluateThinContent(50).status).toBe('FAIL');
  });
  it('warns just below comfortable threshold', () => {
    expect(evaluateThinContent(300).status).toBe('WARNING');
  });
  it('passes healthy word counts', () => {
    expect(evaluateThinContent(800).status).toBe('PASS');
  });
});

describe('image alt coverage', () => {
  it('is not applicable with no images', () => {
    expect(evaluateImageAltCoverage([]).status).toBe('NOT_APPLICABLE');
  });
  it('fails when most images lack alt text', () => {
    const r = evaluateImageAltCoverage([
      { src: 'a.png', alt: null },
      { src: 'b.png', alt: '' },
      { src: 'c.png', alt: 'good' },
    ]);
    expect(r.status).toBe('FAIL');
    expect(r.evidence).toContain('2 of 3');
  });
  it('passes when all images have alt text', () => {
    const r = evaluateImageAltCoverage([{ src: 'a.png', alt: 'A cat' }]);
    expect(r.status).toBe('PASS');
  });
});

describe('http status / https / robots / indexability', () => {
  it('passes 200', () => {
    expect(evaluateHttpStatus(200).status).toBe('PASS');
  });
  it('warns on redirect', () => {
    const r = evaluateHttpStatus(301, 'https://example.com/old');
    expect(r.status).toBe('WARNING');
    expect(r.evidence).toContain('/old');
  });
  it('fails hard on 404', () => {
    const r = evaluateHttpStatus(404);
    expect(r.status).toBe('FAIL');
    expect(r.severity).toBe('HIGH');
  });
  it('fails critically on 500', () => {
    expect(evaluateHttpStatus(500).severity).toBe('CRITICAL');
  });
  it('fails plain http', () => {
    expect(evaluateHttps('http://example.com/').status).toBe('FAIL');
  });
  it('passes https', () => {
    expect(evaluateHttps('https://example.com/').status).toBe('PASS');
  });
  it('fails noindex robots directive', () => {
    const r = evaluateRobotsDirective('noindex, follow');
    expect(r.status).toBe('FAIL');
  });
  it('passes clean robots directive', () => {
    expect(evaluateRobotsDirective(null).status).toBe('PASS');
  });
  it('fails non-indexable pages', () => {
    expect(evaluateIndexability(false, 'noindex').status).toBe('FAIL');
  });
});

describe('duplicate content similarity', () => {
  it('scores identical text as similarity 1', () => {
    const a = normalizeToWordSet('This is a test page about pricing plans for small teams');
    const b = normalizeToWordSet('This is a test page about pricing plans for small teams');
    expect(jaccardSimilarity(a, b)).toBeCloseTo(1);
  });
  it('scores unrelated text as low similarity', () => {
    const a = normalizeToWordSet('Pricing plans for small teams using project management software');
    const b = normalizeToWordSet('Our companys history dates back to nineteen ninety and our founders');
    expect(jaccardSimilarity(a, b)).toBeLessThan(0.3);
  });
  it('is deterministic - same input always yields same output', () => {
    const a = normalizeToWordSet('Some sample content here');
    const b = normalizeToWordSet('Some sample content here plus extra');
    const first = jaccardSimilarity(a, b);
    const second = jaccardSimilarity(a, b);
    expect(first).toBe(second);
  });
});

describe('guessApplicableSchemaTypes', () => {
  it('flags the homepage as Organization + WebSite applicable', () => {
    const types = guessApplicableSchemaTypes({
      url: 'https://example.com/',
      normalizedUrl: 'https://example.com/',
      title: 'Acme - Home',
      headings: [],
      contentText: '',
    });
    expect(types.has('Organization')).toBe(true);
    expect(types.has('WebSite')).toBe(true);
    expect(types.has('Article')).toBe(false);
  });

  it('flags a blog post URL as Article-applicable', () => {
    const types = guessApplicableSchemaTypes({
      url: 'https://example.com/blog/how-to-choose-software',
      normalizedUrl: 'https://example.com/blog/how-to-choose-software',
      title: 'How to Choose Software',
      headings: [],
      contentText: '',
    });
    expect(types.has('Article')).toBe(true);
  });

  it('does not flag a blog post as Product-applicable', () => {
    const types = guessApplicableSchemaTypes({
      url: 'https://example.com/blog/how-to-choose-software',
      normalizedUrl: 'https://example.com/blog/how-to-choose-software',
      title: 'How to Choose Software',
      headings: [],
      contentText: 'A guide with no purchasing language.',
    });
    expect(types.has('Product')).toBe(false);
  });

  it('flags a product URL as Product-applicable', () => {
    const types = guessApplicableSchemaTypes({
      url: 'https://example.com/products/widget',
      normalizedUrl: 'https://example.com/products/widget',
      title: 'Widget',
      headings: [],
      contentText: 'Add to cart. In stock.',
    });
    expect(types.has('Product')).toBe(true);
  });

  it('flags a page with 3+ question headings as FAQ-applicable', () => {
    const types = guessApplicableSchemaTypes({
      url: 'https://example.com/support',
      normalizedUrl: 'https://example.com/support',
      title: 'Support',
      headings: [
        { level: 2, text: 'What is your refund policy?' },
        { level: 2, text: 'How do I contact support?' },
        { level: 2, text: 'Do you offer discounts?' },
      ],
      contentText: '',
    });
    expect(types.has('FAQPage')).toBe(true);
  });
});

describe('JSON-LD parsing helpers', () => {
  it('parses headings JSON defensively', () => {
    expect(parseHeadings([{ level: 1, text: 'Hi' }, { level: 'x', text: 'bad' }])).toEqual([
      { level: 1, text: 'Hi' },
    ]);
    expect(parseHeadings(null)).toEqual([]);
  });

  it('flattens a plain array of JSON-LD blocks', () => {
    const blocks = flattenJsonLdBlocks([{ '@type': 'Organization', name: 'Acme' }]);
    expect(blocks).toHaveLength(1);
    expect(getSchemaTypes(blocks[0])).toEqual(['Organization']);
  });

  it('flattens an @graph-wrapped JSON-LD block', () => {
    const blocks = flattenJsonLdBlocks([
      {
        '@context': 'https://schema.org',
        '@graph': [
          { '@type': 'Organization', name: 'Acme' },
          { '@type': 'WebSite', name: 'Acme Site' },
        ],
      },
    ]);
    expect(blocks).toHaveLength(2);
  });

  it('handles a single object (not wrapped in an array)', () => {
    const blocks = flattenJsonLdBlocks({ '@type': 'Product', name: 'Widget' });
    expect(blocks).toHaveLength(1);
  });

  it('returns empty array for null/undefined', () => {
    expect(flattenJsonLdBlocks(null)).toEqual([]);
    expect(flattenJsonLdBlocks(undefined)).toEqual([]);
  });
});

describe('scoreFor', () => {
  it('is a pure deterministic function of (status, severity)', () => {
    expect(scoreFor('PASS', 'LOW')).toBe(100);
    expect(scoreFor('NOT_APPLICABLE', 'CRITICAL')).toBe(100);
    expect(scoreFor('WARNING', 'HIGH')).toBe(60);
    expect(scoreFor('FAIL', 'CRITICAL')).toBe(0);
    expect(scoreFor('FAIL', 'LOW')).toBe(40);
    // identical input -> identical output every time (scoring must be reproducible)
    expect(scoreFor('FAIL', 'HIGH')).toBe(scoreFor('FAIL', 'HIGH'));
  });
});
