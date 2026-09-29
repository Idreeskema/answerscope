import {
  coreTitle,
  computeContentStructureScore,
  computeEntityClarityScore,
  computeFaqCoverageScore,
  computeStructuredDataScore,
  evaluateAnswer,
  generateQuestions,
  isHomepagePath,
} from './aeo-heuristics';

describe('aeo-heuristics (pure, in-memory fixtures)', () => {
  describe('coreTitle / isHomepagePath', () => {
    it('strips a trailing "| Site Name" suffix', () => {
      expect(coreTitle('Pricing | Acme')).toBe('Pricing');
      expect(coreTitle('How to Choose Software - Acme Blog')).toBe('How to Choose Software');
    });

    it('treats "/" and "" as the homepage path', () => {
      expect(isHomepagePath('https://example.com/')).toBe(true);
      expect(isHomepagePath('https://example.com')).toBe(true);
      expect(isHomepagePath('https://example.com/pricing')).toBe(false);
    });
  });

  describe('generateQuestions', () => {
    it('generates brand/homepage questions for the homepage', () => {
      const qs = generateQuestions({
        siteName: 'Acme',
        title: 'Acme | Project Management',
        url: 'https://acme.example.com/',
        headings: [],
        hasFaqJsonLd: false,
        isHomepage: true,
      });
      expect(qs.length).toBeGreaterThanOrEqual(3);
      expect(qs.length).toBeLessThanOrEqual(8);
      expect(qs).toContain('What is Acme?');
      expect(qs).toContain('What does Acme do?');
    });

    it('generates pricing questions for a pricing-shaped page', () => {
      const qs = generateQuestions({
        siteName: 'Acme',
        title: 'Pricing | Acme',
        url: 'https://acme.example.com/pricing',
        headings: [],
        hasFaqJsonLd: false,
        isHomepage: false,
      });
      expect(qs).toContain('How much does Acme cost?');
      expect(qs).toContain('What plans does Acme offer?');
    });

    it('generates how-to questions for a how-to-shaped page', () => {
      const qs = generateQuestions({
        siteName: 'Acme',
        title: 'How to Import Contacts',
        url: 'https://acme.example.com/guide/import-contacts',
        headings: [],
        hasFaqJsonLd: false,
        isHomepage: false,
      });
      expect(qs.some((q) => /^How do I/i.test(q))).toBe(true);
    });

    it('uses actual FAQ heading text as questions when present', () => {
      const qs = generateQuestions({
        siteName: 'Acme',
        title: 'FAQ',
        url: 'https://acme.example.com/faq',
        headings: [
          { level: 1, text: 'Frequently Asked Questions' },
          { level: 2, text: 'What is your refund policy?' },
          { level: 2, text: 'How do I contact support?' },
        ],
        hasFaqJsonLd: false,
        isHomepage: false,
      });
      expect(qs).toContain('What is your refund policy?');
      expect(qs).toContain('How do I contact support?');
    });

    it('always returns between 3 and 8 deduplicated questions for a generic page', () => {
      const qs = generateQuestions({
        siteName: 'Acme',
        title: 'Team Culture',
        url: 'https://acme.example.com/culture',
        headings: [],
        hasFaqJsonLd: false,
        isHomepage: false,
      });
      expect(qs.length).toBeGreaterThanOrEqual(3);
      expect(qs.length).toBeLessThanOrEqual(8);
      expect(new Set(qs.map((q) => q.toLowerCase())).size).toBe(qs.length);
    });
  });

  describe('evaluateAnswer', () => {
    it('marks a concise, early, number-bearing sentence as DIRECTLY_ANSWERED', () => {
      const result = evaluateAnswer(
        'How much does Acme cost?',
        'Acme costs $29 per month for up to 10 users. Additional details about billing follow below in this long paragraph.',
        50,
      );
      expect(result.status).toBe('DIRECTLY_ANSWERED');
      expect(result.evidence).toContain('$29');
    });

    it('marks late/vague related content as PARTIALLY_ANSWERED', () => {
      const filler = 'This is unrelated filler content about our team culture and values. '.repeat(6);
      const result = evaluateAnswer(
        'How much does Acme cost?',
        `${filler}Acme cost depends on how many users you have on your team.`,
        80,
      );
      expect(result.status).toBe('PARTIALLY_ANSWERED');
    });

    it('marks completely unrelated content as NOT_ANSWERED', () => {
      const result = evaluateAnswer(
        'How much does Acme cost?',
        'Our team loves hiking on weekends and sharing recipes with each other.',
        20,
      );
      expect(result.status).toBe('NOT_ANSWERED');
      expect(result.evidence).toMatch(/none of the/i);
    });

    it('marks an empty page as NOT_ANSWERED without throwing', () => {
      const result = evaluateAnswer('What is Acme?', null, 0);
      expect(result.status).toBe('NOT_ANSWERED');
      expect(result.evidence).toMatch(/no extracted body text/i);
    });
  });

  describe('computeContentStructureScore', () => {
    it('scores a page with a single H1, depth, hierarchy, and a list highly', () => {
      const score = computeContentStructureScore(
        [
          { level: 1, text: 'Title' },
          { level: 2, text: 'Section A' },
          { level: 2, text: 'Section B' },
          { level: 3, text: 'Detail' },
        ],
        'Intro text.\n- First item\n- Second item\n',
      );
      expect(score).toBeGreaterThan(70);
    });

    it('scores a page with no headings as 0', () => {
      expect(computeContentStructureScore([], 'Some text with no structure at all.')).toBe(0);
    });
  });

  describe('computeFaqCoverageScore', () => {
    it('scores 100 when both FAQ JSON-LD and an FAQ heading are present', () => {
      expect(
        computeFaqCoverageScore([{ level: 1, text: 'Frequently Asked Questions' }], true),
      ).toBe(100);
    });

    it('scores 0 when there is no FAQ signal at all', () => {
      expect(computeFaqCoverageScore([{ level: 1, text: 'About Us' }], false)).toBe(0);
    });
  });

  describe('computeEntityClarityScore', () => {
    it('scores 0 with no entities', () => {
      expect(computeEntityClarityScore([])).toBe(0);
    });

    it('scores higher with more, higher-confidence entities', () => {
      const low = computeEntityClarityScore([{ confidence: 0.3 }]);
      const high = computeEntityClarityScore([{ confidence: 0.9 }, { confidence: 0.95 }]);
      expect(high).toBeGreaterThan(low);
    });
  });

  describe('computeStructuredDataScore', () => {
    it('scores by valid ratio when SchemaAnalysis rows exist', () => {
      expect(computeStructuredDataScore([{ isValid: true }, { isValid: false }], 1)).toBe(50);
    });

    it('gives partial credit for raw JSON-LD presence with no SchemaAnalysis rows', () => {
      expect(computeStructuredDataScore([], 2)).toBe(40);
    });

    it('scores 0 with nothing at all', () => {
      expect(computeStructuredDataScore([], 0)).toBe(0);
    });
  });
});
