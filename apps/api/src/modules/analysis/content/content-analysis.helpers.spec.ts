import {
  computeAvgSentenceLength,
  countParagraphs,
  extractTopics,
  fleschReadingEase,
  isThinContent,
  jaccardSimilarity,
  normalizeToWordSet,
  splitSentences,
  splitWords,
} from './content-analysis.helpers';

describe('countParagraphs', () => {
  it('counts newline-separated paragraphs', () => {
    expect(countParagraphs('First paragraph.\nSecond paragraph.\nThird one here.')).toBe(3);
  });
  it('ignores blank lines', () => {
    expect(countParagraphs('First.\n\n\nSecond.')).toBe(2);
  });
  it('treats a single blob with no newlines as one paragraph', () => {
    expect(countParagraphs('Just one long paragraph with no breaks at all.')).toBe(1);
  });
  it('returns 0 for empty content', () => {
    expect(countParagraphs('')).toBe(0);
    expect(countParagraphs(null)).toBe(0);
  });
});

describe('sentence/word splitting', () => {
  it('splits sentences on terminal punctuation', () => {
    expect(splitSentences('Hello there. How are you? I am fine!')).toEqual([
      'Hello there',
      'How are you',
      'I am fine',
    ]);
  });
  it('splits words, strips punctuation, and preserves internal apostrophes', () => {
    expect(splitWords("Don't stop, it's great!")).toEqual(["don't", 'stop', "it's", 'great']);
  });
});

describe('computeAvgSentenceLength', () => {
  it('computes average words per sentence', () => {
    // "One two three." (3 words) + "Four five." (2 words) => avg 2.5
    const avg = computeAvgSentenceLength('One two three. Four five.');
    expect(avg).toBeCloseTo(2.5);
  });
  it('returns 0 for empty text', () => {
    expect(computeAvgSentenceLength('')).toBe(0);
  });
});

describe('fleschReadingEase', () => {
  it('returns null for empty text', () => {
    expect(fleschReadingEase('')).toBeNull();
    expect(fleschReadingEase(null)).toBeNull();
  });

  it('scores simple short sentences as easier to read than dense long ones', () => {
    const simple = 'The cat sat on the mat. It was happy. The sun was warm.';
    const complex =
      'The multifaceted implementation of interdisciplinary methodologies necessitates comprehensive consideration of numerous heterogeneous variables affecting organizational transformation initiatives.';
    const simpleScore = fleschReadingEase(simple)!;
    const complexScore = fleschReadingEase(complex)!;
    expect(simpleScore).toBeGreaterThan(complexScore);
  });

  it('is deterministic for identical input', () => {
    const text = 'This is a test sentence for readability scoring purposes.';
    expect(fleschReadingEase(text)).toBe(fleschReadingEase(text));
  });

  it('stays within the conventional 0-100 range', () => {
    const text = 'Go. Run. Jump. Eat. Sleep. Play. Read. Write. Sing. Dance.';
    const score = fleschReadingEase(text)!;
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});

describe('isThinContent', () => {
  it('flags low word counts', () => {
    expect(isThinContent(100)).toBe(true);
  });
  it('does not flag healthy word counts', () => {
    expect(isThinContent(600)).toBe(false);
  });
});

describe('jaccard similarity for duplicate detection', () => {
  it('is 1 for identical word sets', () => {
    const a = normalizeToWordSet('pricing plans for small teams project management');
    const b = normalizeToWordSet('pricing plans for small teams project management');
    expect(jaccardSimilarity(a, b)).toBeCloseTo(1);
  });
  it('is low for unrelated text', () => {
    const a = normalizeToWordSet('pricing plans for small teams project management software');
    const b = normalizeToWordSet('our history dates back to nineteen ninety and founders vision');
    expect(jaccardSimilarity(a, b)).toBeLessThan(0.3);
  });
});

describe('extractTopics', () => {
  it('extracts repeated keywords from headings and content, weighting headings more', () => {
    const headings = [
      { level: 1, text: 'Project Management Software' },
      { level: 2, text: 'Project Management for Small Teams' },
    ];
    const content =
      'Our project management software helps small teams collaborate. Project management has never been easier for small teams.';
    const topics = extractTopics(headings, content, 5);
    expect(topics.length).toBeGreaterThan(0);
    expect(topics.some((t) => t.includes('project') || t.includes('management'))).toBe(true);
  });

  it('returns an empty array for empty input', () => {
    expect(extractTopics([], '', 5)).toEqual([]);
  });

  it('is deterministic for identical input', () => {
    const headings = [{ level: 1, text: 'Widgets and Gadgets' }];
    const content = 'Widgets and gadgets are great. Widgets are our specialty.';
    expect(extractTopics(headings, content)).toEqual(extractTopics(headings, content));
  });
});
