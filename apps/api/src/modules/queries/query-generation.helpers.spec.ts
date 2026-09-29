import {
  CATEGORY_LABELS,
  EntityLike,
  PageLike,
  classifyPageShape,
  classifyQuestionCategory,
  dedupeCandidates,
  extractAudiencePhrase,
  extractTopicPhrase,
  findProblemPhrase,
  generateQueryCandidates,
  isQuestionLike,
  pickPrimaryEntity,
  selectUpTo,
} from './query-generation.helpers';

function page(overrides: Partial<PageLike> & { id: string }): PageLike {
  return {
    url: `https://example.com${overrides.id === 'home' ? '/' : `/${overrides.id}`}`,
    normalizedUrl: `https://example.com${overrides.id === 'home' ? '/' : `/${overrides.id}`}`,
    title: null,
    metaDescription: null,
    headings: [],
    contentText: null,
    wordCount: 0,
    ...overrides,
  };
}

describe('classifyPageShape', () => {
  it('detects the homepage', () => {
    expect(classifyPageShape(page({ id: 'home', url: 'https://example.com/', normalizedUrl: 'https://example.com/' })).isHome).toBe(true);
  });

  it('detects a pricing page by path', () => {
    expect(classifyPageShape(page({ id: 'p', url: 'https://example.com/pricing', normalizedUrl: 'https://example.com/pricing' })).isPricing).toBe(true);
  });

  it('detects a features page by title when path is ambiguous', () => {
    expect(
      classifyPageShape(page({ id: 'p', url: 'https://example.com/solutions', normalizedUrl: 'https://example.com/solutions', title: 'Features | Acme' })).isFeatures,
    ).toBe(true);
  });
});

describe('isQuestionLike / classifyQuestionCategory', () => {
  it('recognizes question-starter words and trailing question marks', () => {
    expect(isQuestionLike('How much does it cost?')).toBe(true);
    expect(isQuestionLike('Does Acme integrate with Slack')).toBe(true);
    expect(isQuestionLike('Real-time Collaboration')).toBe(false);
  });

  it('classifies pricing questions', () => {
    expect(classifyQuestionCategory('How much does Acme cost?')).toBe('pricing');
  });

  it('classifies how-to questions', () => {
    expect(classifyQuestionCategory('How to set up your first project')).toBe('how_to');
  });

  it('classifies trust/credibility questions', () => {
    expect(classifyQuestionCategory('Is Acme safe and secure?')).toBe('trust_credibility');
  });

  it('falls back to informational', () => {
    expect(classifyQuestionCategory('Where do ideas come from?')).toBe('informational');
  });
});

describe('extractTopicPhrase', () => {
  it('strips a leading brand + separator (including em dash)', () => {
    expect(extractTopicPhrase('Acme — Project Management Software for Small Teams', 'Acme')).toBe(
      'Project Management Software for Small Teams',
    );
  });

  it('strips a trailing brand + separator', () => {
    expect(extractTopicPhrase('Products | Acme', 'Acme')).toBe('Products');
  });

  it('returns null when the title is only the brand name', () => {
    expect(extractTopicPhrase('Acme', 'Acme')).toBeNull();
  });
});

describe('extractAudiencePhrase', () => {
  it('extracts a "for X" audience phrase', () => {
    expect(extractAudiencePhrase('Project Management Software for Small Teams')).toBe('Small Teams');
  });

  it('returns null with no audience phrase', () => {
    expect(extractAudiencePhrase('Just a plain title')).toBeNull();
  });
});

describe('findProblemPhrase', () => {
  it('finds a grounded manual-process phrase', () => {
    expect(findProblemPhrase('Teams switch from spreadsheets to Acme every week.')?.phrase).toContain('spreadsheets');
  });

  it('returns null when no known manual process is mentioned', () => {
    expect(findProblemPhrase('Acme is a great tool.')).toBeNull();
  });
});

describe('dedupeCandidates / selectUpTo', () => {
  it('keeps the higher-importance duplicate', () => {
    const result = dedupeCandidates([
      { query: 'What is Acme?', intent: 'Brand', category: 'Brand', topic: null, entity: 'Acme', importance: 4, sourcePageId: 'a' },
      { query: 'what is acme?', intent: 'Brand', category: 'Brand', topic: null, entity: 'Acme', importance: 9, sourcePageId: 'b' },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].importance).toBe(9);
    expect(result[0].sourcePageId).toBe('b');
  });

  it('round-robins across categories when capping', () => {
    const candidates = [
      ...Array.from({ length: 10 }, (_, i) => ({
        query: `Informational ${i}`,
        intent: 'Informational',
        category: 'Informational',
        topic: null,
        entity: null,
        importance: 5,
        sourcePageId: null,
      })),
      ...Array.from({ length: 10 }, (_, i) => ({
        query: `Pricing ${i}`,
        intent: 'Pricing queries',
        category: 'Pricing queries',
        topic: null,
        entity: null,
        importance: 5,
        sourcePageId: null,
      })),
    ];
    const capped = selectUpTo(candidates, 10);
    expect(capped).toHaveLength(10);
    const informationalCount = capped.filter((c) => c.intent === 'Informational').length;
    const pricingCount = capped.filter((c) => c.intent === 'Pricing queries').length;
    expect(informationalCount).toBe(5);
    expect(pricingCount).toBe(5);
  });
});

describe('pickPrimaryEntity', () => {
  const website = { domain: 'acme-example.com', name: null };

  it('prefers the ORGANIZATION entity', () => {
    const entities: EntityLike[] = [
      { id: '1', name: 'Acme Boards', type: 'PRODUCT', description: null, confidence: 0.9, sourcePageId: null },
      { id: '2', name: 'Acme Inc', type: 'ORGANIZATION', description: 'Acme makes tools for teams.', confidence: 0.8, sourcePageId: null },
    ];
    expect(pickPrimaryEntity(entities, website).name).toBe('Acme Inc');
  });

  it('falls back to highest-confidence entity when no ORGANIZATION exists', () => {
    const entities: EntityLike[] = [
      { id: '1', name: 'Low Conf', type: 'PRODUCT', description: null, confidence: 0.3, sourcePageId: null },
      { id: '2', name: 'High Conf', type: 'PRODUCT', description: null, confidence: 0.7, sourcePageId: null },
    ];
    expect(pickPrimaryEntity(entities, website).name).toBe('High Conf');
  });

  it('falls back to the real website domain when there are no entities at all', () => {
    expect(pickPrimaryEntity([], website).name).toBe('Acme-example');
  });
});

describe('generateQueryCandidates (end-to-end, in-memory fixture)', () => {
  const website = { domain: 'acme-example.com', name: null };
  const entities: EntityLike[] = [
    { id: 'ent-org', name: 'Acme', type: 'ORGANIZATION', description: 'Acme is project management software for small teams.', confidence: 0.95, sourcePageId: 'home' },
    { id: 'ent-prod', name: 'Acme Boards', type: 'PRODUCT', description: null, confidence: 0.8, sourcePageId: 'product' },
    { id: 'ent-loc', name: 'New York', type: 'LOCATION', description: null, confidence: 0.6, sourcePageId: 'contact' },
  ];
  const pages: PageLike[] = [
    page({
      id: 'home',
      url: 'https://acme-example.com/',
      normalizedUrl: 'https://acme-example.com/',
      title: 'Acme — Project Management Software for Small Teams',
      headings: [
        { level: 1, text: 'Acme — Project Management Software for Small Teams' },
        { level: 2, text: 'What exactly is Acme?' },
        { level: 2, text: 'Who is Acme built for?' },
        { level: 2, text: 'Is Acme a legitimate company?' },
      ],
      contentText: 'Many teams switch from manually managing spreadsheets to Acme. Start your free trial today.',
      wordCount: 900,
    }),
    page({
      id: 'pricing',
      url: 'https://acme-example.com/pricing',
      normalizedUrl: 'https://acme-example.com/pricing',
      title: 'Pricing | Acme',
      headings: [
        { level: 1, text: 'Acme Pricing' },
        { level: 2, text: 'How much does Acme cost per month?' },
        { level: 2, text: 'Is Acme worth the monthly price?' },
      ],
      contentText: 'Start your free trial today, no credit card required.',
      wordCount: 500,
    }),
    page({
      id: 'features',
      url: 'https://acme-example.com/features',
      normalizedUrl: 'https://acme-example.com/features',
      title: 'Features | Acme',
      headings: [
        { level: 2, text: 'Real-time Collaboration' },
        { level: 2, text: 'Task Automation' },
        { level: 2, text: 'Does Acme integrate with Slack?' },
      ],
      contentText: 'Explore what Acme can do for your team.',
      wordCount: 700,
    }),
    page({
      id: 'product',
      url: 'https://acme-example.com/product/acme-boards',
      normalizedUrl: 'https://acme-example.com/product/acme-boards',
      title: 'Acme Boards | Acme',
      headings: [{ level: 1, text: 'Acme Boards' }],
      contentText: 'Acme Boards helps teams visualize their work.',
      wordCount: 300,
    }),
    page({
      id: 'contact',
      url: 'https://acme-example.com/contact',
      normalizedUrl: 'https://acme-example.com/contact',
      title: 'Contact Acme',
      headings: [{ level: 1, text: 'Contact Us' }],
      contentText: 'Visit our New York office.',
      wordCount: 150,
    }),
  ];

  it('generates candidates that are all traceable to a real page or entity', () => {
    const candidates = generateQueryCandidates({ website, entities, pages });
    expect(candidates.length).toBeGreaterThan(0);
    const pageIds = new Set(pages.map((p) => p.id));
    for (const c of candidates) {
      if (c.sourcePageId !== null) {
        expect(pageIds.has(c.sourcePageId)).toBe(true);
      }
      expect(c.entity).toBeTruthy();
    }
  });

  it('never fabricates a competitor name for comparison queries', () => {
    const candidates = generateQueryCandidates({ website, entities, pages });
    const comparisonQueries = candidates.filter((c) => c.intent === CATEGORY_LABELS.comparison);
    expect(comparisonQueries.length).toBeGreaterThan(0);
    for (const c of comparisonQueries) {
      // Grounded in the real "spreadsheets" phrase mined from page content,
      // never an invented brand like "Acme vs CompetitorX".
      expect(c.query.toLowerCase()).toContain('spreadsheet');
    }
  });

  it('skips the "local" category entirely when no LOCATION entity exists', () => {
    const candidates = generateQueryCandidates({ website, entities: entities.filter((e) => e.type !== 'LOCATION'), pages });
    expect(candidates.some((c) => c.intent === CATEGORY_LABELS.local)).toBe(false);
  });

  it('spans a good number of the 15 categories', () => {
    const candidates = generateQueryCandidates({ website, entities, pages });
    const distinctIntents = new Set(candidates.map((c) => c.intent));
    expect(distinctIntents.size).toBeGreaterThanOrEqual(6);
  });

  it('caps out at MAX_QUERIES (100) even with excessive input', () => {
    const manyPages: PageLike[] = Array.from({ length: 40 }, (_, i) =>
      page({
        id: `blog-${i}`,
        url: `https://acme-example.com/blog/post-${i}`,
        normalizedUrl: `https://acme-example.com/blog/post-${i}`,
        title: `How to do task ${i} with Acme | Acme Blog`,
        headings: [
          { level: 1, text: `How to do task ${i} with Acme` },
          { level: 2, text: `How to configure setting ${i}` },
          { level: 2, text: `What is the best way to finish task ${i}?` },
        ],
        contentText: `This is a guide about task ${i}.`,
        wordCount: 600,
      }),
    );
    const candidates = generateQueryCandidates({ website, entities, pages: [...pages, ...manyPages] });
    expect(candidates.length).toBeLessThanOrEqual(100);
  });
});
