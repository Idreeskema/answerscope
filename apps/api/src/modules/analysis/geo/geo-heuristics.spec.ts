import {
  computeCitationReadiness,
  computeContentQuality,
  computeEntityClarity,
  computeMachineReadability,
  computeTopicalCoverage,
} from './geo-heuristics';

describe('geo-heuristics (pure, in-memory fixtures)', () => {
  describe('computeEntityClarity', () => {
    it('scores 0 with no entities and explains why', () => {
      const { score, evidence } = computeEntityClarity([]);
      expect(score).toBe(0);
      expect(evidence.join(' ')).toMatch(/no organization entity detected/i);
    });

    it('scores highly with a described Organization and Product entity', () => {
      const { score, evidence } = computeEntityClarity([
        { name: 'Acme', type: 'ORGANIZATION', description: 'Acme builds project management software for teams.', confidence: 0.9 },
        { name: 'Acme Boards', type: 'PRODUCT', description: 'A kanban-style board product for tracking tasks.', confidence: 0.8 },
      ]);
      expect(score).toBeGreaterThan(70);
      expect(evidence.join(' ')).toContain('Acme');
    });
  });

  describe('computeTopicalCoverage', () => {
    it('falls back to distinct H2 headings when no ContentAnalysis.topics exist', () => {
      const { score, evidence } = computeTopicalCoverage(
        [],
        [
          { url: 'https://x.com/a', title: 'A', contentText: '', headings: [{ level: 2, text: 'Pricing' }], jsonLd: [] },
          { url: 'https://x.com/b', title: 'B', contentText: '', headings: [{ level: 2, text: 'Integrations' }], jsonLd: [] },
        ],
      );
      expect(score).toBeGreaterThan(0);
      expect(evidence.join(' ')).toMatch(/H2 heading/i);
    });

    it('uses ContentAnalysis.topics breadth when present', () => {
      const { score } = computeTopicalCoverage(
        [{ topics: ['pricing', 'onboarding', 'integrations', 'security', 'support'] }, { topics: ['pricing'] }],
        [
          { url: 'https://x.com/a', title: 'A', contentText: '', headings: [], jsonLd: [] },
          { url: 'https://x.com/b', title: 'B', contentText: '', headings: [], jsonLd: [] },
        ],
      );
      expect(score).toBeGreaterThan(0);
    });

    it('scores 0 with no pages and no topic data', () => {
      const { score } = computeTopicalCoverage([], []);
      expect(score).toBe(0);
    });
  });

  describe('computeContentQuality', () => {
    it('rewards About/Contact pages, author signals, dates, and external links', () => {
      const { score, evidence } = computeContentQuality(
        [
          { url: 'https://x.com/about', title: 'About Us', contentText: '', headings: [], jsonLd: [] },
          { url: 'https://x.com/contact', title: 'Contact', contentText: '', headings: [], jsonLd: [] },
          {
            url: 'https://x.com/blog/post',
            title: 'Post',
            contentText: '',
            headings: [],
            jsonLd: [{ '@type': 'Article', author: { name: 'Jane Doe' }, datePublished: '2026-01-01' }],
          },
        ],
        5,
      );
      expect(score).toBeGreaterThan(50);
      expect(evidence.some((e) => /About page found/i.test(e))).toBe(true);
    });

    it('scores low with none of the signals present', () => {
      const { score } = computeContentQuality(
        [{ url: 'https://x.com/', title: 'Home', contentText: '', headings: [], jsonLd: [] }],
        0,
      );
      expect(score).toBe(0);
    });
  });

  describe('computeMachineReadability', () => {
    it('scores highly when pages have H1s, heading depth, and JSON-LD', () => {
      const { score } = computeMachineReadability(
        [
          {
            url: 'https://x.com/',
            title: 'Home',
            contentText: '',
            headings: [
              { level: 1, text: 'Home' },
              { level: 2, text: 'Section' },
            ],
            jsonLd: [{ '@type': 'Organization' }],
          },
        ],
        [{ isValid: true }],
        [{ contentStructureScore: 80, structuredDataScore: 80 }],
      );
      expect(score).toBeGreaterThan(80);
    });

    it('scores 0 with no pages at all', () => {
      const { score } = computeMachineReadability([], [], []);
      expect(score).toBe(0);
    });
  });

  describe('computeCitationReadiness', () => {
    it('rewards statistics, external links, and dated Article JSON-LD', () => {
      const { score, evidence } = computeCitationReadiness(
        [
          {
            url: 'https://x.com/report',
            title: 'Report',
            contentText: 'Our study found that 42% of teams improved output by $1200 per month on average.',
            headings: [],
            jsonLd: [{ '@type': 'Article', datePublished: '2026-01-01' }],
          },
        ],
        4,
      );
      expect(score).toBeGreaterThan(0);
      expect(evidence.some((e) => /statistics/i.test(e))).toBe(true);
    });

    it('scores 0 with no signals present', () => {
      const { score } = computeCitationReadiness(
        [{ url: 'https://x.com/', title: 'Home', contentText: 'Nothing notable here.', headings: [], jsonLd: [] }],
        0,
      );
      expect(score).toBe(0);
    });
  });
});
