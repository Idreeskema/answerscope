import { Box, Typography } from '@mui/material';

/**
 * Generic, defensive renderer for analyzer-produced JSON blobs (Score.breakdown,
 * AEOAnalysis/GEOAnalysis.details, CompetitorAnalysis.gaps, etc.) whose exact
 * shape is still evolving as sibling analyzer modules land. Never assumes a
 * fixed structure - just renders whatever real data is present so the
 * "clicking a score must show exactly how it was calculated" requirement is
 * met even against partially-implemented analyzers (spec section 15).
 */
export default function JsonBreakdown({ value, depth = 0 }: { value: unknown; depth?: number }) {
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
          Empty.
        </Typography>
      );
    }
    return (
      <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
        {value.map((item, idx) => (
          <Box component="li" key={idx} sx={{ mb: 0.5 }}>
            <JsonBreakdown value={item} depth={depth + 1} />
          </Box>
        ))}
      </Box>
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
      <Box sx={{ pl: depth > 0 ? 1.5 : 0 }}>
        {entries.map(([key, val]) => {
          const isPrimitive = val === null || typeof val !== 'object';
          return (
            <Box key={key} sx={{ mb: 0.5, display: 'flex', gap: 1, alignItems: 'flex-start' }}>
              <Typography variant="body2" fontWeight={600} sx={{ minWidth: 160 }}>
                {key}:
              </Typography>
              {isPrimitive ? (
                <Typography variant="body2" color="text.secondary" sx={{ wordBreak: 'break-word' }}>
                  {String(val)}
                </Typography>
              ) : (
                <Box flex={1}>
                  <JsonBreakdown value={val} depth={depth + 1} />
                </Box>
              )}
            </Box>
          );
        })}
      </Box>
    );
  }

  return (
    <Typography variant="body2" color="text.secondary" sx={{ wordBreak: 'break-word' }}>
      {String(value)}
    </Typography>
  );
}
