import {
  SeoCheckLike,
  buildAggregatedRecommendationFromSeoChecks,
  buildOrganizationSchemaGapRecommendation,
  buildRecommendationFromSeoCheck,
  buildRecommendationsFromAeoAnalyses,
  buildRecommendationsFromSchemaAnalyses,
  buildRecommendationsFromSeoChecks,
  computePriority,
  inferImplementationType,
  parseAeoQuestions,
  parseGeoGaps,
  severityToImpact,
} from './recommendation-engine.helpers';

describe('severityToImpact', () => {
  it('maps every severity to a distinct impact score', () => {
    expect(severityToImpact('CRITICAL')).toBe(9);
    expect(severityToImpact('HIGH')).toBe(7);
    expect(severityToImpact('MEDIUM')).toBe(5);
    expect(severityToImpact('LOW')).toBe(3);
  });
});

describe('computePriority', () => {
  it('computes exactly impact * confidence / effort', () => {
    expect(computePriority(8, 0.9, 4)).toBeCloseTo((8 * 0.9) / 4, 6);
    expect(computePriority(7, 0.75, 3)).toBeCloseTo((7 * 0.75) / 3, 6);
    expect(computePriority(9, 1, 2)).toBe(4.5);
  });
});

describe('inferImplementationType', () => {
  it('detects meta title', () => {
    expect(inferImplementationType('missing-title Add a descriptive title tag')).toBe('META_TITLE');
  });
  it('detects meta description', () => {
    expect(inferImplementationType('meta-description-missing Add a meta description')).toBe('META_DESCRIPTION');
  });
  it('detects schema/json-ld', () => {
    expect(inferImplementationType('Add Organization structured data (JSON-LD)')).toBe('JSON_LD');
  });
  it('detects FAQ', () => {
    expect(inferImplementationType('Add an FAQ section answering common questions')).toBe('FAQ');
  });
  it('detects internal links', () => {
    expect(inferImplementationType('Low internal link count on this page')).toBe('INTERNAL_LINK');
  });
  it('falls back to OTHER for unrecognized text', () => {
    expect(inferImplementationType('Some completely unrelated finding about robots.txt')).toBe('OTHER');
  });
});

function seoCheck(overrides: Partial<SeoCheckLike> & { pageId: string | null; checkId: string }): SeoCheckLike {
  return {
    id: `check-${Math.random()}`,
    category: 'METADATA',
    status: 'FAIL',
    severity: 'HIGH',
    evidence: 'This page has no <title> element.',
    recommendation: 'Add a unique, descriptive title tag.',
    pageUrl: 'https://example.com/page',
    ...overrides,
  };
}

describe('buildRecommendationFromSeoCheck', () => {
  it('reuses the check evidence/recommendation verbatim and computes priority', () => {
    const check = seoCheck({ pageId: 'p1', checkId: 'missing-title' });
    const rec = buildRecommendationFromSeoCheck(check);
    expect(rec.evidence).toBe(check.evidence);
    expect(rec.action).toBe(check.recommendation);
    expect(rec.affectedUrl).toBe('https://example.com/page');
    expect(rec.implementationType).toBe('META_TITLE');
    expect(rec.severity).toBe('HIGH');
    expect(rec.impact).toBe(7);
    expect(rec.priority).toBeCloseTo((rec.impact * rec.confidence) / rec.effort, 6);
  });
});

describe('buildRecommendationsFromSeoChecks dedup/aggregation', () => {
  it('emits one recommendation per page when a checkId affects <= 2 pages', () => {
    const checks = [
      seoCheck({ pageId: 'p1', checkId: 'missing-h1', evidence: 'Page 1 has no H1' }),
      seoCheck({ pageId: 'p2', checkId: 'missing-h1', evidence: 'Page 2 has no H1' }),
    ];
    const recs = buildRecommendationsFromSeoChecks(checks);
    expect(recs).toHaveLength(2);
    expect(recs.map((r) => r.affectedUrl)).toEqual(['https://example.com/page', 'https://example.com/page']);
  });

  it('rolls up a checkId affecting >= 3 pages into a single aggregated recommendation', () => {
    const checks = [
      seoCheck({ pageId: 'p1', checkId: 'missing-alt-text', evidence: 'img1 missing alt' }),
      seoCheck({ pageId: 'p2', checkId: 'missing-alt-text', evidence: 'img2 missing alt' }),
      seoCheck({ pageId: 'p3', checkId: 'missing-alt-text', evidence: 'img3 missing alt' }),
      seoCheck({ pageId: 'p4', checkId: 'missing-alt-text', evidence: 'img4 missing alt' }),
    ];
    const recs = buildRecommendationsFromSeoChecks(checks);
    expect(recs).toHaveLength(1);
    expect(recs[0].affectedUrl).toBeNull();
    expect(recs[0].evidence).toContain('4 distinct pages');
    expect(recs[0].title).toContain('4 pages affected');
  });

  it('keeps unrelated checkIds fully separate', () => {
    const checks = [
      seoCheck({ pageId: 'p1', checkId: 'missing-title' }),
      seoCheck({ pageId: 'p1', checkId: 'missing-h1' }),
    ];
    const recs = buildRecommendationsFromSeoChecks(checks);
    expect(recs).toHaveLength(2);
  });
});

describe('parseAeoQuestions', () => {
  it('parses the questions array from AEOAnalysis.details', () => {
    const details = {
      questions: [
        { question: 'How much does Acme cost?', status: 'NOT_ANSWERED', evidence: 'No pricing section found.' },
        { question: 'Is Acme secure?', status: 'DIRECTLY_ANSWERED' },
      ],
    };
    expect(parseAeoQuestions(details)).toHaveLength(2);
  });

  it('returns an empty array for malformed details', () => {
    expect(parseAeoQuestions(null)).toEqual([]);
    expect(parseAeoQuestions({})).toEqual([]);
    expect(parseAeoQuestions({ questions: 'not-an-array' })).toEqual([]);
  });
});

describe('buildRecommendationsFromAeoAnalyses', () => {
  it('creates one ANSWER_SECTION recommendation per NOT_ANSWERED/PARTIALLY_ANSWERED question', () => {
    const analyses = [
      {
        id: 'aeo1',
        pageId: 'p1',
        pageUrl: 'https://example.com/pricing',
        details: {
          questions: [
            { question: 'How much does Acme cost?', status: 'NOT_ANSWERED', evidence: 'No direct answer found.' },
            { question: 'Is Acme fast?', status: 'DIRECTLY_ANSWERED' },
          ],
        },
      },
    ];
    const recs = buildRecommendationsFromAeoAnalyses(analyses);
    expect(recs).toHaveLength(1);
    expect(recs[0].implementationType).toBe('ANSWER_SECTION');
    expect(recs[0].severity).toBe('HIGH');
    expect(recs[0].affectedUrl).toBe('https://example.com/pricing');
    expect(recs[0].evidence).toContain('No direct answer found.');
  });

  it('aggregates the same unanswered question across >= 3 pages', () => {
    const analyses = ['p1', 'p2', 'p3'].map((pageId, i) => ({
      id: `aeo${i}`,
      pageId,
      pageUrl: `https://example.com/${pageId}`,
      details: { questions: [{ question: 'What is Acme?', status: 'NOT_ANSWERED' }] },
    }));
    const recs = buildRecommendationsFromAeoAnalyses(analyses);
    expect(recs).toHaveLength(1);
    expect(recs[0].evidence).toContain('3 pages');
  });
});

describe('parseGeoGaps (defensive parsing)', () => {
  it('parses a `gaps` array', () => {
    expect(parseGeoGaps({ gaps: [{ category: 'Topical Coverage', description: 'No pricing topic coverage.' }] })).toHaveLength(1);
  });

  it('falls back to `findings` or `issues`', () => {
    expect(parseGeoGaps({ findings: [{ description: 'x' }] })).toHaveLength(1);
    expect(parseGeoGaps({ issues: [{ description: 'y' }] })).toHaveLength(1);
  });

  it('returns an empty array for an unrecognized shape rather than throwing', () => {
    expect(parseGeoGaps({ somethingElse: 123 })).toEqual([]);
    expect(() => parseGeoGaps(undefined)).not.toThrow();
  });
});

describe('buildRecommendationsFromSchemaAnalyses', () => {
  it('emits one recommendation per invalid schema when <= 2 pages affected', () => {
    const analyses = [
      { id: 's1', pageId: 'p1', pageUrl: 'https://example.com/a', schemaType: 'Product', isValid: false, errors: ['missing "offers"'] },
    ];
    const recs = buildRecommendationsFromSchemaAnalyses(analyses);
    expect(recs).toHaveLength(1);
    expect(recs[0].implementationType).toBe('JSON_LD');
    expect(recs[0].evidence).toContain('missing "offers"');
  });

  it('ignores valid schema rows', () => {
    const analyses = [
      { id: 's1', pageId: 'p1', pageUrl: 'https://example.com/a', schemaType: 'Product', isValid: true, errors: null },
    ];
    expect(buildRecommendationsFromSchemaAnalyses(analyses)).toEqual([]);
  });

  it('aggregates the same invalid schemaType across >= 3 pages', () => {
    const analyses = ['p1', 'p2', 'p3'].map((pageId) => ({
      id: `s-${pageId}`,
      pageId,
      pageUrl: `https://example.com/${pageId}`,
      schemaType: 'Product',
      isValid: false,
      errors: ['missing "price"'],
    }));
    const recs = buildRecommendationsFromSchemaAnalyses(analyses);
    expect(recs).toHaveLength(1);
    expect(recs[0].title).toContain('3 pages affected');
  });
});

describe('buildOrganizationSchemaGapRecommendation', () => {
  it('matches spec section 12 worked example when other schema types exist', () => {
    const rec = buildOrganizationSchemaGapRecommendation('https://example.com/', ['WebSite']);
    expect(rec.title).toBe('Add Organization structured data');
    expect(rec.severity).toBe('HIGH');
    expect(rec.affectedUrl).toBe('https://example.com/');
    expect(rec.evidence).toContain('No Organization schema was detected');
    expect(rec.implementationType).toBe('JSON_LD');
  });

  it('reports no structured data at all when nothing was found', () => {
    const rec = buildOrganizationSchemaGapRecommendation('https://example.com/', []);
    expect(rec.evidence).toContain('No structured data (JSON-LD) of any type was detected');
  });
});
