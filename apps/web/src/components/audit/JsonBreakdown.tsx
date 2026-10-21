import { Box, Chip, Divider, Stack, Typography } from '@mui/material';
import { humanize } from '../../utils/auditFormatting';

const STATUS_LIKE = new Set([
  'PASS',
  'FAIL',
  'WARNING',
  'NOT_APPLICABLE',
  'DIRECTLY_ANSWERED',
  'PARTIALLY_ANSWERED',
  'NOT_ANSWERED',
  'VALID',
  'INVALID',
]);

function statusChipColor(value: string): 'success' | 'error' | 'warning' | 'default' {
  switch (value) {
    case 'PASS':
    case 'DIRECTLY_ANSWERED':
    case 'VALID':
      return 'success';
    case 'FAIL':
    case 'NOT_ANSWERED':
    case 'INVALID':
      return 'error';
    case 'WARNING':
    case 'PARTIALLY_ANSWERED':
      return 'warning';
    default:
      return 'default';
  }
}

interface CheckLike {
  checkId?: unknown;
  status?: unknown;
  score?: unknown;
  pageId?: unknown;
}

/** Detects the ScoringService breakdown's common {checkId, status, score,
 * pageId} shape so it can render as a proper list instead of a raw dump. */
function looksLikeCheck(value: unknown): value is CheckLike {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  return ('checkId' in obj || 'status' in obj) && 'score' in obj;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

/**
 * Generic, defensive renderer for analyzer-produced JSON blobs (Score.breakdown,
 * AEOAnalysis/GEOAnalysis.details, CompetitorAnalysis.gaps, etc.) whose exact
 * shape is still evolving as sibling analyzer modules land. Never assumes a
 * fixed structure - just renders whatever real data is present so the
 * "clicking a score must show exactly how it was calculated" requirement is
 * met even against partially-implemented analyzers (spec section 15).
 *
 * Two presentation upgrades over a plain recursive key dump: an array of
 * check-like objects ({checkId, status, score, pageId}) renders as a clean
 * status-chip row list with the page resolved to its real URL/title (via
 * `pageLabels`) instead of a raw UUID; and status-shaped string values
 * (PASS/FAIL/WARNING/...) render as a colored chip instead of bare text.
 */
export default function JsonBreakdown({
  value,
  depth = 0,
  pageLabels,
}: {
  value: unknown;
  depth?: number;
  /** Optional pageId -> human label (title or URL) lookup for check rows. */
  pageLabels?: Record<string, string>;
}) {
  if (value === null || value === undefined) {
    return (
      <Typography variant="body2" color="text.secondary">
        No data recorded.
      </Typography>
    );
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return (
        <Typography variant="body2" color="text.secondary">
          None.
        </Typography>
      );
    }

    if (looksLikeCheck(value[0])) {
      return (
        <Stack spacing={0.75}>
          {(value as CheckLike[]).map((check, idx) => {
            const status = typeof check.status === 'string' ? check.status : null;
            const checkId = typeof check.checkId === 'string' ? check.checkId : null;
            const pageId = typeof check.pageId === 'string' ? check.pageId : null;
            const score = typeof check.score === 'number' ? check.score : null;
            return (
              <Stack
                key={idx}
                direction="row"
                alignItems="center"
                spacing={1.25}
                sx={{ py: 0.75, px: 1.25, borderRadius: 1.5, bgcolor: 'action.hover' }}
              >
                {status && (
                  <Chip
                    size="small"
                    label={status.replace(/_/g, ' ')}
                    color={statusChipColor(status)}
                    sx={{ flexShrink: 0, fontWeight: 600 }}
                  />
                )}
                <Box flex={1} minWidth={0}>
                  <Typography variant="body2" fontWeight={600} sx={{ wordBreak: 'break-word' }}>
                    {checkId ? humanize(checkId) : 'Check'}
                  </Typography>
                  {pageId && (
                    <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                      {pageLabels?.[pageId] ?? pageId}
                    </Typography>
                  )}
                </Box>
                {score !== null && (
                  <Typography
                    variant="body2"
                    fontWeight={700}
                    sx={{ flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}
                  >
                    {Math.round(score)}
                  </Typography>
                )}
              </Stack>
            );
          })}
        </Stack>
      );
    }

    return (
      <Stack spacing={0.75}>
        {value.map((item, idx) => (
          <Box key={idx}>
            <JsonBreakdown value={item} depth={depth + 1} pageLabels={pageLabels} />
          </Box>
        ))}
      </Stack>
    );
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) {
      return (
        <Typography variant="body2" color="text.secondary">
          Empty.
        </Typography>
      );
    }
    return (
      <Stack spacing={1} divider={depth === 0 ? <Divider /> : undefined}>
        {entries.map(([key, val]) => {
          const isPrimitive = val === null || typeof val !== 'object';
          const isStatusLike = typeof val === 'string' && STATUS_LIKE.has(val);
          const isPageIdField = /pageId$/i.test(key) && typeof val === 'string';
          const pageLabel = isPageIdField ? pageLabels?.[val as string] : undefined;
          return (
            <Box
              key={key}
              sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: { xs: 0.25, sm: 1.5 }, alignItems: 'flex-start' }}
            >
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ minWidth: { sm: 150 }, flexShrink: 0, pt: { sm: 0.3 }, fontWeight: 600 }}
              >
                {isPageIdField ? 'Page' : humanize(key)}
              </Typography>
              <Box flex={1} minWidth={0} width="100%">
                {isStatusLike ? (
                  <Chip size="small" label={(val as string).replace(/_/g, ' ')} color={statusChipColor(val as string)} />
                ) : isPrimitive ? (
                  <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
                    {isPageIdField
                      ? (pageLabel ?? String(val))
                      : typeof val === 'number'
                        ? formatNumber(val)
                        : String(val)}
                  </Typography>
                ) : (
                  <JsonBreakdown value={val} depth={depth + 1} pageLabels={pageLabels} />
                )}
              </Box>
            </Box>
          );
        })}
      </Stack>
    );
  }

  return (
    <Typography variant="body2" color="text.secondary" sx={{ wordBreak: 'break-word' }}>
      {String(value)}
    </Typography>
  );
}
