import { OpenAiFixContentProvider, isLlmEligible } from './llm-fix-content.provider';
import { FixGenerationContext } from '../fix-generator.helpers';

const baseContext: FixGenerationContext = {
  implementationType: 'META_TITLE',
  recommendationTitle: 'Title is too short',
  recommendationCategory: 'METADATA',
  recommendationEvidence: 'Title is 8 characters: "Home".',
  recommendationAction: 'Lengthen the title.',
  entityName: 'Acme',
  entityDescription: 'Acme makes project management software.',
  websiteUrl: 'https://acme.example.com',
  page: {
    title: 'Home',
    metaDescription: null,
    headings: [{ level: 1, text: 'Project management for small teams' }],
    contentText: 'Acme helps small teams manage projects, tasks, and deadlines in one place.',
    wordCount: 40,
    url: 'https://acme.example.com/',
    existingRawJsonLd: null,
  },
  aeoQuestions: [],
  internalLinkTarget: null,
};

describe('isLlmEligible', () => {
  it('is eligible for text-based fix types', () => {
    expect(isLlmEligible('META_TITLE')).toBe(true);
    expect(isLlmEligible('META_DESCRIPTION')).toBe(true);
    expect(isLlmEligible('FAQ')).toBe(true);
    expect(isLlmEligible('ANSWER_SECTION')).toBe(true);
    expect(isLlmEligible('CONTENT_UPDATE')).toBe(true);
    expect(isLlmEligible('PAGE_OUTLINE')).toBe(true);
  });

  it('excludes structural fix types that need strict correctness', () => {
    expect(isLlmEligible('JSON_LD')).toBe(false);
    expect(isLlmEligible('INTERNAL_LINK')).toBe(false);
    expect(isLlmEligible('OTHER')).toBe(false);
  });
});

describe('OpenAiFixContentProvider', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('returns the model content on a successful call', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'Project Management for Small Teams | Acme' } }] }),
    }) as any;

    const provider = new OpenAiFixContentProvider('fake-key');
    const result = await provider.generate(baseContext, 'Home | Acme');

    expect(result).toBe('Project Management for Small Teams | Acme');
  });

  it('returns null for a non-eligible implementation type without calling fetch', async () => {
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as any;

    const provider = new OpenAiFixContentProvider('fake-key');
    const result = await provider.generate({ ...baseContext, implementationType: 'JSON_LD' }, '{}');

    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns null on a non-OK HTTP response, never fabricating content', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Invalid API key',
    }) as any;

    const provider = new OpenAiFixContentProvider('bad-key');
    const result = await provider.generate(baseContext, 'Home | Acme');

    expect(result).toBeNull();
  });

  it('returns null when fetch throws', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down')) as any;

    const provider = new OpenAiFixContentProvider('fake-key');
    const result = await provider.generate(baseContext, 'Home | Acme');

    expect(result).toBeNull();
  });

  it('returns null when the response has no usable content', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: {} }] }),
    }) as any;

    const provider = new OpenAiFixContentProvider('fake-key');
    const result = await provider.generate(baseContext, 'Home | Acme');

    expect(result).toBeNull();
  });
});
