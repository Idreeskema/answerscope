import type { CheckStatus, FixStatus, QueryStatus, RecommendationStatus, Severity } from '../types/audit';

/**
 * Human-friendly labels for the SCORE_CATEGORIES enum values used by
 * apps/api ScoringService (see scoring.service.ts). Score rows also include
 * a synthetic "OVERALL" category which is rendered separately (the header
 * score badge), not as a chart bar.
 */
export const CATEGORY_LABELS: Record<string, string> = {
  TECHNICAL_SEO: 'Technical SEO',
  CONTENT_QUALITY: 'Content',
  AEO: 'AEO',
  ENTITY_SEMANTIC_CLARITY: 'Entity',
  STRUCTURED_DATA: 'Structured Data',
  CITATION_EVIDENCE_READINESS: 'AI Search Readiness (GEO)',
  INTERNAL_LINKING: 'Internal Linking',
  OVERALL: 'Overall',
};

export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? humanize(category);
}

export function humanize(id: string): string {
  return id
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2') // camelCase -> camel Case
    .toLowerCase()
    .split(/[_\-\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Loosely normalizes a free-form category/check string for cross-matching
 * against the fixed SCORE_CATEGORIES enum, since SEOCheck.category is a
 * plain string written independently by each analyzer module. */
export function normalizeKey(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

export function severityColor(severity: Severity): 'error' | 'warning' | 'info' | 'default' {
  switch (severity) {
    case 'CRITICAL':
      return 'error';
    case 'HIGH':
      return 'warning';
    case 'MEDIUM':
      return 'info';
    case 'LOW':
    default:
      return 'default';
  }
}

export function checkStatusColor(status: CheckStatus): 'success' | 'warning' | 'error' | 'default' {
  switch (status) {
    case 'PASS':
      return 'success';
    case 'WARNING':
      return 'warning';
    case 'FAIL':
      return 'error';
    case 'NOT_APPLICABLE':
    default:
      return 'default';
  }
}

export function recommendationStatusColor(
  status: RecommendationStatus,
): 'default' | 'info' | 'success' | 'warning' {
  switch (status) {
    case 'OPEN':
      return 'warning';
    case 'IN_PROGRESS':
      return 'info';
    case 'DONE':
      return 'success';
    case 'DISMISSED':
    default:
      return 'default';
  }
}

export function fixStatusColor(status: FixStatus): 'default' | 'info' | 'success' | 'error' {
  switch (status) {
    case 'GENERATED':
      return 'info';
    case 'APPROVED':
      return 'success';
    case 'APPLIED':
      return 'success';
    case 'REJECTED':
      return 'error';
    default:
      return 'default';
  }
}

export function queryStatusColor(status: QueryStatus): 'default' | 'success' | 'error' | 'info' {
  switch (status) {
    case 'APPROVED':
      return 'success';
    case 'EDITED':
      return 'info';
    case 'REJECTED':
      return 'error';
    case 'PENDING':
    default:
      return 'default';
  }
}

/**
 * Score-band status colors - the dataviz skill's fixed, never-themed status
 * palette (good/warning/critical), validated for contrast on a light
 * surface. Always paired with an icon + text label where used (never color
 * alone), per that skill's rule for status encodings.
 */
export const SCORE_STATUS_COLORS = {
  good: '#0ca30c',
  warning: '#fab219',
  critical: '#d03b3b',
} as const;

export type ScoreStatus = keyof typeof SCORE_STATUS_COLORS;

export function scoreStatus(value: number): ScoreStatus {
  if (value >= 70) return 'good';
  if (value >= 50) return 'warning';
  return 'critical';
}

export function scoreStatusColor(value: number): string {
  return SCORE_STATUS_COLORS[scoreStatus(value)];
}

export function scoreStatusLabel(status: ScoreStatus): string {
  switch (status) {
    case 'good':
      return 'Strong';
    case 'warning':
      return 'Needs attention';
    case 'critical':
      return 'Weak';
  }
}

export function formatScore(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return 'N/A';
  return value.toFixed(digits);
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

export const ACTIVE_AUDIT_STATUSES = new Set(['QUEUED', 'CRAWLING', 'ANALYZING']);
