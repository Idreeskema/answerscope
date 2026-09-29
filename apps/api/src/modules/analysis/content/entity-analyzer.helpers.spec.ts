import {
  CONFIDENCE_JSON_LD,
  extractCopyrightOwner,
  extractOgSiteName,
  firstSentences,
  guessBrandFromTitles,
  looksLikeAboutOrContactPage,
  mapJsonLdBlockToCandidate,
} from './entity-analyzer.helpers';

describe('mapJsonLdBlockToCandidate', () => {
  it('maps an Organization block', () => {
    const candidate = mapJsonLdBlockToCandidate(
      { '@type': 'Organization', name: 'Acme Inc', description: 'We make widgets', sameAs: ['https://twitter.com/acme'] },
      'page-1',
    );
    expect(candidate).not.toBeNull();
    expect(candidate?.type).toBe('ORGANIZATION');
    expect(candidate?.name).toBe('Acme Inc');
    expect(candidate?.confidence).toBe(CONFIDENCE_JSON_LD);
    expect(candidate?.relationships).toContainEqual({ type: 'SAME_AS', targetName: 'https://twitter.com/acme' });
  });

  it('maps a LocalBusiness block as ORGANIZATION', () => {
    const candidate = mapJsonLdBlockToCandidate({ '@type': 'LocalBusiness', name: 'Acme Cafe' }, null);
    expect(candidate?.type).toBe('ORGANIZATION');
  });

  it('maps a Person block and captures worksFor as a relationship', () => {
    const candidate = mapJsonLdBlockToCandidate(
      { '@type': 'Person', name: 'Jane Doe', worksFor: { '@type': 'Organization', name: 'Acme Inc' } },
      'page-2',
    );
    expect(candidate?.type).toBe('PERSON');
    expect(candidate?.relationships).toContainEqual({ type: 'WORKS_FOR', targetName: 'Acme Inc' });
  });

  it('maps a Product block and captures brand as a relationship', () => {
    const candidate = mapJsonLdBlockToCandidate(
      { '@type': 'Product', name: 'Widget Pro', brand: { name: 'Acme Inc' } },
      'page-3',
    );
    expect(candidate?.type).toBe('PRODUCT');
    expect(candidate?.relationships).toContainEqual({ type: 'MANUFACTURED_BY', targetName: 'Acme Inc' });
  });

  it('maps a Service block and captures provider as a relationship', () => {
    const candidate = mapJsonLdBlockToCandidate(
      { '@type': 'Service', name: 'Consulting', provider: 'Acme Inc' },
      'page-4',
    );
    expect(candidate?.type).toBe('SERVICE');
    expect(candidate?.relationships).toContainEqual({ type: 'PROVIDED_BY', targetName: 'Acme Inc' });
  });

  it('returns null for an unrelated schema type (e.g. Article)', () => {
    expect(mapJsonLdBlockToCandidate({ '@type': 'Article', headline: 'Some post' }, null)).toBeNull();
  });

  it('returns null when the block has no name', () => {
    expect(mapJsonLdBlockToCandidate({ '@type': 'Organization' }, null)).toBeNull();
  });
});

describe('extractOgSiteName', () => {
  it('reads og:site_name', () => {
    expect(extractOgSiteName({ site_name: 'Acme' })).toBe('Acme');
  });
  it('returns null when absent', () => {
    expect(extractOgSiteName({})).toBeNull();
    expect(extractOgSiteName(null)).toBeNull();
  });
});

describe('guessBrandFromTitles', () => {
  it('finds a brand suffix repeated across titles', () => {
    const titles = ['Products | Acme', 'About Us | Acme', 'Contact | Acme'];
    expect(guessBrandFromTitles(titles)).toBe('Acme');
  });
  it('finds a brand prefix repeated across titles', () => {
    const titles = ['Acme - Products', 'Acme - About Us', 'Acme - Contact'];
    expect(guessBrandFromTitles(titles)).toBe('Acme');
  });
  it('returns null when titles disagree with no pattern', () => {
    const titles = ['Random Page One', 'Totally Different Page Two'];
    expect(guessBrandFromTitles(titles)).toBeNull();
  });
  it('accepts a single occurrence when only one title is available', () => {
    expect(guessBrandFromTitles(['Acme | Home'])).toBe('Acme');
  });
});

describe('extractCopyrightOwner', () => {
  it('extracts an owner from a © YEAR pattern', () => {
    expect(extractCopyrightOwner('Some footer text. © 2026 Acme Inc. All rights reserved.')).toBe('Acme Inc');
  });
  it('extracts an owner from a "Copyright YEAR-YEAR" pattern', () => {
    expect(extractCopyrightOwner('Copyright 2020-2026, Acme Corporation. All rights reserved.')).toBe(
      'Acme Corporation',
    );
  });
  it('returns null when there is no copyright text', () => {
    expect(extractCopyrightOwner('No footer text here at all.')).toBeNull();
    expect(extractCopyrightOwner(null)).toBeNull();
  });
});

describe('looksLikeAboutOrContactPage', () => {
  it('matches an /about path', () => {
    expect(looksLikeAboutOrContactPage('/about', null)).toBe(true);
  });
  it('matches a "Contact Us" title', () => {
    expect(looksLikeAboutOrContactPage('/reach-out', 'Contact Us | Acme')).toBe(true);
  });
  it('does not match an unrelated page', () => {
    expect(looksLikeAboutOrContactPage('/products/widget', 'Widget Pro')).toBe(false);
  });
});

describe('firstSentences', () => {
  it('returns the first N sentences', () => {
    expect(firstSentences('First sentence. Second sentence. Third sentence.', 2)).toBe(
      'First sentence. Second sentence.',
    );
  });
  it('returns null for empty text', () => {
    expect(firstSentences('')).toBeNull();
    expect(firstSentences(null)).toBeNull();
  });
});
