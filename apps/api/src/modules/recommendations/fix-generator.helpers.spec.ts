import {
  buildAnswerSectionFix,
  buildContentUpdateFix,
  buildFaqFix,
  buildInternalLinkFix,
  buildJsonLdFix,
  buildMetaDescription,
  buildMetaTitle,
  buildPageOutlineFix,
  deriveAnswerFromContent,
  extractQuotedQuestion,
  extractSchemaTypeFromText,
  generateFixContent,
  mineFallbackQuestions,
  stripBrandFromTitle,
} from './fix-generator.helpers';

describe('buildMetaTitle', () => {
  it('composes "topic | entity" within the healthy 50-60 char range for a normal topic', () => {
    const title = buildMetaTitle('Project Management Software for Small Teams', 'Acme');
    expect(title.endsWith('| Acme')).toBe(true);
    expect(title.length).toBeLessThanOrEqual(60);
  });

  it('trims an overly long topic so the full title stays <= 60 chars', () => {
    const longTopic = 'A Very Long And Overly Descriptive Page Topic That Goes On And On About Everything';
    const title = buildMetaTitle(longTopic, 'Acme');
    expect(title.length).toBeLessThanOrEqual(60);
    expect(title.endsWith('| Acme')).toBe(true);
  });

  it('never emits a placeholder like "Your Page Title"', () => {
    const title = buildMetaTitle('Pricing', 'Acme');
    expect(title.toLowerCase()).not.toContain('your page title');
    expect(title.toLowerCase()).not.toContain('your company');
  });
});

describe('buildMetaDescription', () => {
  it('grounds the description in the real contentText and includes the entity name', () => {
    const desc = buildMetaDescription(
      'Acme helps small teams plan, track, and ship work together without spreadsheets or sticky notes.',
      'Acme Homepage',
      'Acme',
    );
    expect(desc.toLowerCase()).toContain('acme');
    expect(desc.length).toBeLessThanOrEqual(160);
  });

  it('falls back to the page title when there is no contentText, never a generic placeholder', () => {
    const desc = buildMetaDescription(null, 'Acme Pricing Plans', 'Acme');
    expect(desc).toContain('Acme Pricing Plans');
  });
});

describe('stripBrandFromTitle', () => {
  it('strips a leading brand + em dash', () => {
    expect(stripBrandFromTitle('Acme — Project Management Software', 'Acme')).toBe('Project Management Software');
  });

  it('strips a trailing brand + pipe', () => {
    expect(stripBrandFromTitle('Products | Acme', 'Acme')).toBe('Products');
  });
});

describe('extractSchemaTypeFromText', () => {
  it('finds a known schema.org type mentioned in the text', () => {
    expect(extractSchemaTypeFromText('Fix invalid Product structured data')).toBe('Product');
    expect(extractSchemaTypeFromText('Add Organization structured data')).toBe('Organization');
  });

  it('defaults to Organization when no known type is named', () => {
    expect(extractSchemaTypeFromText('Some unrelated finding')).toBe('Organization');
  });
});

describe('buildJsonLdFix', () => {
  it('emits a syntactically valid JSON-LD block populated with real entity/website data, never placeholders', () => {
    const json = buildJsonLdFix({
      schemaType: 'Organization',
      entityName: 'Acme',
      entityDescription: 'Acme is project management software for small teams.',
      websiteUrl: 'https://acme.example.com',
      pageUrl: 'https://acme.example.com/',
      pageTitle: 'Acme',
    });
    const parsed = JSON.parse(json);
    expect(parsed['@context']).toBe('https://schema.org');
    expect(parsed['@type']).toBe('Organization');
    expect(parsed.name).toBe('Acme');
    expect(parsed.url).toBe('https://acme.example.com');
    expect(JSON.stringify(parsed)).not.toContain('Your Company Name');
  });

  it('builds a Product schema with a Brand referencing the real entity', () => {
    const json = buildJsonLdFix({
      schemaType: 'Product',
      entityName: 'Acme',
      entityDescription: null,
      websiteUrl: 'https://acme.example.com',
      pageUrl: 'https://acme.example.com/product/boards',
      pageTitle: 'Acme Boards',
    });
    const parsed = JSON.parse(json);
    expect(parsed['@type']).toBe('Product');
    expect(parsed.name).toBe('Acme Boards');
    expect(parsed.brand.name).toBe('Acme');
  });
});

describe('deriveAnswerFromContent', () => {
  it('finds the most relevant real sentence for the question', () => {
    const content =
      'Acme is a project management tool. Acme costs $12 per user per month on the Pro plan. We also offer a free tier.';
    const result = deriveAnswerFromContent('How much does Acme cost?', content);
    expect(result.needsInput).toBe(false);
    expect(result.answer.toLowerCase()).toContain('$12');
  });

  it('marks the answer as needing input when nothing on the page overlaps the question', () => {
    const result = deriveAnswerFromContent('Does Acme support Kubernetes deployments?', 'Acme is a nice tool for teams.');
    expect(result.needsInput).toBe(true);
    expect(result.answer).toContain('NEEDS INPUT');
  });

  it('marks the answer as needing input when there is no content at all', () => {
    const result = deriveAnswerFromContent('How much does Acme cost?', null);
    expect(result.needsInput).toBe(true);
  });
});

describe('buildFaqFix', () => {
  it('produces valid JSON with one entry per question, grounded where possible', () => {
    const content = 'Acme costs $12 per user per month. Acme integrates with Slack and Google Calendar.';
    const json = buildFaqFix(['How much does Acme cost?', 'Does Acme integrate with Slack?'], content);
    const parsed = JSON.parse(json);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].needsInput).toBe(false);
    expect(parsed[1].needsInput).toBe(false);
  });
});

describe('buildAnswerSectionFix', () => {
  it('formats a concrete Q/A pair', () => {
    const text = buildAnswerSectionFix('How much does Acme cost?', 'Acme costs $12 per user per month.');
    expect(text).toContain('Q: How much does Acme cost?');
    expect(text).toContain('$12');
  });
});

describe('extractQuotedQuestion', () => {
  it('extracts the quoted question from a recommendation title', () => {
    expect(extractQuotedQuestion('Directly answer "How much does Acme cost?" on this page')).toBe(
      'How much does Acme cost?',
    );
  });

  it('returns null when there is no quoted text', () => {
    expect(extractQuotedQuestion('Add Organization structured data')).toBeNull();
  });
});

describe('mineFallbackQuestions', () => {
  it('mines question-like headings as FAQ candidates', () => {
    const headings = [
      { level: 2, text: 'Does Acme integrate with Slack?' },
      { level: 2, text: 'Real-time Collaboration' },
      { level: 2, text: 'How much does Acme cost?' },
    ];
    expect(mineFallbackQuestions(headings)).toEqual(['Does Acme integrate with Slack?', 'How much does Acme cost?']);
  });
});

describe('buildInternalLinkFix', () => {
  it('emits the exact structured fields spec section 13 requires', () => {
    const json = buildInternalLinkFix({
      sourceUrl: 'https://acme.example.com/blog/how-to-plan',
      targetUrl: 'https://acme.example.com/pricing',
      suggestedAnchorText: 'Acme pricing plans',
      reason: 'Both pages relate to evaluating Acme; the blog post has no link to pricing.',
    });
    const parsed = JSON.parse(json);
    expect(parsed).toEqual({
      sourcePage: 'https://acme.example.com/blog/how-to-plan',
      targetPage: 'https://acme.example.com/pricing',
      suggestedAnchorText: 'Acme pricing plans',
      reason: 'Both pages relate to evaluating Acme; the blog post has no link to pricing.',
    });
  });
});

describe('buildContentUpdateFix', () => {
  it('references the real page title and word count', () => {
    const text = buildContentUpdateFix('Acme Features', 180, 'no mention of mobile app support');
    expect(text).toContain('Acme Features');
    expect(text).toContain('180 words');
    expect(text).toContain('mobile app support');
  });
});

describe('buildPageOutlineFix', () => {
  it('keeps the real existing headings and marks only the new addition', () => {
    const outline = buildPageOutlineFix([{ level: 1, text: 'Acme Features' }, { level: 2, text: 'Task Automation' }], 'pricing information');
    expect(outline).toContain('H1: Acme Features');
    expect(outline).toContain('H2: Task Automation');
    expect(outline).toContain('[NEW]');
    expect(outline).toContain('pricing information');
  });
});

describe('generateFixContent dispatcher', () => {
  const basePage = {
    title: 'Products | Acme',
    metaDescription: null,
    headings: [{ level: 1, text: 'Acme Products' }],
    contentText: 'Acme products help small teams plan and ship work every week.',
    wordCount: 220,
    url: 'https://acme.example.com/products',
  };

  it('META_TITLE: rewrites the real page title using the real H1', () => {
    const { before, after } = generateFixContent({
      implementationType: 'META_TITLE',
      recommendationTitle: 'Rewrite title',
      recommendationCategory: 'METADATA',
      recommendationEvidence: 'Title is too generic',
      recommendationAction: 'Rewrite the title',
      entityName: 'Acme',
      entityDescription: null,
      websiteUrl: 'https://acme.example.com',
      page: basePage,
      aeoQuestions: [],
      internalLinkTarget: null,
    });
    expect(before).toBe('Products | Acme');
    expect(after).toContain('Acme Products');
    expect(after.endsWith('| Acme')).toBe(true);
  });

  it('JSON_LD: emits real entity data, and never a placeholder company name', () => {
    const { after } = generateFixContent({
      implementationType: 'JSON_LD',
      recommendationTitle: 'Add Organization structured data',
      recommendationCategory: 'Structured Data',
      recommendationEvidence: 'No Organization schema was detected.',
      recommendationAction: 'Provide valid JSON-LD.',
      entityName: 'Acme',
      entityDescription: 'Acme is project management software.',
      websiteUrl: 'https://acme.example.com',
      page: null,
      aeoQuestions: [],
      internalLinkTarget: null,
    });
    const parsed = JSON.parse(after);
    expect(parsed.name).toBe('Acme');
    expect(parsed['@type']).toBe('Organization');
  });

  it('FAQ: derives Q/A pairs from AEO NOT_ANSWERED questions for that page', () => {
    const { after } = generateFixContent({
      implementationType: 'FAQ',
      recommendationTitle: 'Add FAQ section',
      recommendationCategory: 'AEO',
      recommendationEvidence: 'Questions unanswered',
      recommendationAction: 'Add an FAQ section',
      entityName: 'Acme',
      entityDescription: null,
      websiteUrl: 'https://acme.example.com',
      page: basePage,
      aeoQuestions: ['What do Acme products include?'],
      internalLinkTarget: null,
    });
    const parsed = JSON.parse(after);
    expect(parsed[0].question).toBe('What do Acme products include?');
  });

  it('INTERNAL_LINK: emits structured JSON with a real target page', () => {
    const { after } = generateFixContent({
      implementationType: 'INTERNAL_LINK',
      recommendationTitle: 'Low internal links',
      recommendationCategory: 'INTERNAL_LINKING',
      recommendationEvidence: 'Only 1 internal link found',
      recommendationAction: 'Add internal links',
      entityName: 'Acme',
      entityDescription: null,
      websiteUrl: 'https://acme.example.com',
      page: basePage,
      aeoQuestions: [],
      internalLinkTarget: { url: 'https://acme.example.com/pricing', title: 'Pricing' },
    });
    const parsed = JSON.parse(after);
    expect(parsed.sourcePage).toBe(basePage.url);
    expect(parsed.targetPage).toBe('https://acme.example.com/pricing');
    expect(parsed.suggestedAnchorText).toBe('Pricing');
  });

  it('OTHER: falls back to the recommendation action, never a placeholder', () => {
    const { after } = generateFixContent({
      implementationType: 'OTHER',
      recommendationTitle: 'Some other finding',
      recommendationCategory: 'MISC',
      recommendationEvidence: 'evidence',
      recommendationAction: 'Do the specific real thing described in this recommendation.',
      entityName: 'Acme',
      entityDescription: null,
      websiteUrl: 'https://acme.example.com',
      page: null,
      aeoQuestions: [],
      internalLinkTarget: null,
    });
    expect(after).toBe('Do the specific real thing described in this recommendation.');
  });
});
