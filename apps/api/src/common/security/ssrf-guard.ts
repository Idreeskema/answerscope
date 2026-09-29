import { promises as dns } from 'dns';
import { isIP } from 'net';

/**
 * SSRF protection: blocks the crawler / URL validators from ever causing the
 * server to issue a request to loopback, private, link-local, multicast, or
 * cloud-metadata addresses. Every hostname is resolved and every resolved IP
 * is checked - this also covers DNS-rebinding at fetch time when callers
 * re-validate the IP actually connected to (see CrawlerHttpClient).
 */

const BLOCKED_HOSTNAMES = new Set(['localhost', 'metadata.google.internal']);

// Cloud metadata endpoints (AWS/GCP/Azure/Alibaba all use this address).
const METADATA_IP = '169.254.169.254';

export class SsrfViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SsrfViolationError';
  }
}

function ipToLong(ip: string): number {
  return ip
    .split('.')
    .reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
}

function isIpInCidr(ip: string, cidr: string): boolean {
  const [range, bitsStr] = cidr.split('/');
  const bits = parseInt(bitsStr, 10);
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipToLong(ip) & mask) === (ipToLong(range) & mask);
}

const BLOCKED_IPV4_CIDRS = [
  '0.0.0.0/8',
  '10.0.0.0/8',
  '100.64.0.0/10', // carrier-grade NAT
  '127.0.0.0/8',
  '169.254.0.0/16', // link-local + cloud metadata
  '172.16.0.0/12',
  '192.0.0.0/24',
  '192.0.2.0/24',
  '192.88.99.0/24',
  '192.168.0.0/16',
  '198.18.0.0/15',
  '198.51.100.0/24',
  '203.0.113.0/24',
  '224.0.0.0/4', // multicast
  '240.0.0.0/4', // reserved
];

function isPrivateOrReservedIPv4(ip: string): boolean {
  return BLOCKED_IPV4_CIDRS.some((cidr) => isIpInCidr(ip, cidr));
}

function isPrivateOrReservedIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::') return true;
  if (lower.startsWith('fe80:')) return true; // link-local
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique local
  if (lower.startsWith('::ffff:')) {
    // IPv4-mapped IPv6 - unwrap and check as IPv4
    const mapped = lower.split(':').pop() ?? '';
    if (isIP(mapped) === 4) return isPrivateOrReservedIPv4(mapped);
  }
  return false;
}

export function isBlockedIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isPrivateOrReservedIPv4(ip) || ip === METADATA_IP;
  if (version === 6) return isPrivateOrReservedIPv6(ip);
  return true; // unparseable -> reject
}

export interface SsrfCheckResult {
  hostname: string;
  resolvedIps: string[];
}

/**
 * Validates a URL is safe to fetch: correct protocol, not a blocked hostname,
 * and every DNS-resolved IP is public. Throws SsrfViolationError otherwise.
 */
export async function assertUrlIsSafeToFetch(rawUrl: string): Promise<SsrfCheckResult> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SsrfViolationError(`Invalid URL: ${rawUrl}`);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new SsrfViolationError(`Unsupported protocol: ${url.protocol}`);
  }

  const hostname = url.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new SsrfViolationError(`Blocked hostname: ${hostname}`);
  }

  // Literal IP in the URL itself.
  if (isIP(hostname)) {
    if (isBlockedIp(hostname)) {
      throw new SsrfViolationError(`Blocked IP literal: ${hostname}`);
    }
    return { hostname, resolvedIps: [hostname] };
  }

  let records: string[];
  try {
    const [v4, v6] = await Promise.allSettled([
      dns.resolve4(hostname),
      dns.resolve6(hostname),
    ]);
    records = [
      ...(v4.status === 'fulfilled' ? v4.value : []),
      ...(v6.status === 'fulfilled' ? v6.value : []),
    ];
  } catch {
    throw new SsrfViolationError(`DNS resolution failed for host: ${hostname}`);
  }

  if (records.length === 0) {
    throw new SsrfViolationError(`No DNS records found for host: ${hostname}`);
  }

  const blocked = records.filter((ip) => isBlockedIp(ip));
  if (blocked.length > 0) {
    throw new SsrfViolationError(
      `Host ${hostname} resolves to a blocked address: ${blocked.join(', ')}`,
    );
  }

  return { hostname, resolvedIps: records };
}
