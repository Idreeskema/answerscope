import { isKnownSchemaType, validateSchemaBlock } from './schema-analyzer.helpers';

describe('validateSchemaBlock', () => {
  it('validates a complete Organization block', () => {
    const r = validateSchemaBlock('Organization', { name: 'Acme', url: 'https://acme.com' });
    expect(r.isValid).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('flags an Organization block missing url', () => {
    const r = validateSchemaBlock('Organization', { name: 'Acme' });
    expect(r.isValid).toBe(false);
    expect(r.errors).toEqual(['Missing required property "url" for Organization']);
  });

  it('flags an Organization block missing both name and url', () => {
    const r = validateSchemaBlock('Organization', {});
    expect(r.isValid).toBe(false);
    expect(r.errors).toHaveLength(2);
  });

  it('validates a Product with just a name', () => {
    expect(validateSchemaBlock('Product', { name: 'Widget' }).isValid).toBe(true);
  });

  it('flags a Product missing a name', () => {
    const r = validateSchemaBlock('Product', { price: 10 });
    expect(r.isValid).toBe(false);
    expect(r.errors[0]).toMatch(/name/);
  });

  it('validates a well-formed FAQPage with Question/Answer pairs', () => {
    const r = validateSchemaBlock('FAQPage', {
      mainEntity: [
        { '@type': 'Question', name: 'What is Acme?', acceptedAnswer: { '@type': 'Answer', text: 'A company.' } },
      ],
    });
    expect(r.isValid).toBe(true);
  });

  it('flags a FAQPage with missing mainEntity', () => {
    const r = validateSchemaBlock('FAQPage', {});
    expect(r.isValid).toBe(false);
    expect(r.errors).toContain('Missing required property "mainEntity" for FAQPage');
  });

  it('flags a FAQPage whose mainEntity items are missing acceptedAnswer.text', () => {
    const r = validateSchemaBlock('FAQPage', {
      mainEntity: [{ name: 'What is Acme?' }],
    });
    expect(r.isValid).toBe(false);
    expect(r.errors.some((e) => e.includes('acceptedAnswer.text'))).toBe(true);
  });

  it('validates a well-formed BreadcrumbList', () => {
    const r = validateSchemaBlock('BreadcrumbList', {
      itemListElement: [
        { position: 1, name: 'Home' },
        { position: 2, name: 'Products' },
      ],
    });
    expect(r.isValid).toBe(true);
  });

  it('flags a BreadcrumbList with an empty itemListElement', () => {
    const r = validateSchemaBlock('BreadcrumbList', { itemListElement: [] });
    expect(r.isValid).toBe(false);
  });

  it('validates a LocalBusiness with name + address', () => {
    const r = validateSchemaBlock('LocalBusiness', {
      name: 'Acme Cafe',
      address: { streetAddress: '123 Main St' },
    });
    expect(r.isValid).toBe(true);
  });

  it('flags a LocalBusiness missing address', () => {
    const r = validateSchemaBlock('LocalBusiness', { name: 'Acme Cafe' });
    expect(r.isValid).toBe(false);
    expect(r.errors).toContain('Missing required property "address" for LocalBusiness');
  });

  it('does not fabricate a verdict for an unknown/unsupported type', () => {
    const r = validateSchemaBlock('Recipe', { name: 'Pancakes' });
    expect(r.isValid).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('is deterministic for identical input', () => {
    const block = { name: 'Acme' };
    expect(validateSchemaBlock('Organization', block)).toEqual(validateSchemaBlock('Organization', block));
  });
});

describe('isKnownSchemaType', () => {
  it('recognizes the 9 spec-listed types', () => {
    for (const t of [
      'Organization',
      'WebSite',
      'Article',
      'Product',
      'FAQPage',
      'BreadcrumbList',
      'LocalBusiness',
      'Person',
      'Service',
    ]) {
      expect(isKnownSchemaType(t)).toBe(true);
    }
  });
  it('does not recognize arbitrary types', () => {
    expect(isKnownSchemaType('Recipe')).toBe(false);
  });
});
