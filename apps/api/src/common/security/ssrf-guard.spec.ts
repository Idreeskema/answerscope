import { assertUrlIsSafeToFetch, isBlockedIp, SsrfViolationError } from './ssrf-guard';

describe('isBlockedIp', () => {
  it('blocks loopback', () => {
    expect(isBlockedIp('127.0.0.1')).toBe(true);
    expect(isBlockedIp('::1')).toBe(true);
  });

  it('blocks private ranges', () => {
    expect(isBlockedIp('10.1.2.3')).toBe(true);
    expect(isBlockedIp('172.16.5.5')).toBe(true);
    expect(isBlockedIp('192.168.1.1')).toBe(true);
  });

  it('blocks link-local and cloud metadata', () => {
    expect(isBlockedIp('169.254.169.254')).toBe(true);
    expect(isBlockedIp('169.254.1.1')).toBe(true);
  });

  it('allows public addresses', () => {
    expect(isBlockedIp('8.8.8.8')).toBe(false);
    expect(isBlockedIp('93.184.216.34')).toBe(false);
  });
});

describe('assertUrlIsSafeToFetch', () => {
  it('rejects non-http protocols', async () => {
    await expect(assertUrlIsSafeToFetch('file:///etc/passwd')).rejects.toThrow(
      SsrfViolationError,
    );
  });

  it('rejects localhost by hostname', async () => {
    await expect(assertUrlIsSafeToFetch('http://localhost:8080/')).rejects.toThrow(
      SsrfViolationError,
    );
  });

  it('rejects literal loopback IP', async () => {
    await expect(assertUrlIsSafeToFetch('http://127.0.0.1/')).rejects.toThrow(
      SsrfViolationError,
    );
  });

  it('rejects literal private IP', async () => {
    await expect(assertUrlIsSafeToFetch('http://10.0.0.5/')).rejects.toThrow(
      SsrfViolationError,
    );
  });

  it('rejects cloud metadata IP literal', async () => {
    await expect(assertUrlIsSafeToFetch('http://169.254.169.254/latest/meta-data')).rejects.toThrow(
      SsrfViolationError,
    );
  });

  it('allows a normal public https URL (DNS resolution, no network fetch)', async () => {
    const result = await assertUrlIsSafeToFetch('https://example.com/');
    expect(result.hostname).toBe('example.com');
    expect(result.resolvedIps.length).toBeGreaterThan(0);
  });
});
