import { Box, Stack, Typography } from '@mui/material';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import WarningRoundedIcon from '@mui/icons-material/WarningRounded';
import ErrorRoundedIcon from '@mui/icons-material/ErrorRounded';
import type { ScoreRow } from '../../types/audit';
import { categoryLabel, scoreStatus, scoreStatusColor, type ScoreStatus } from '../../utils/auditFormatting';

const STATUS_ICON: Record<ScoreStatus, typeof CheckCircleRoundedIcon> = {
  good: CheckCircleRoundedIcon,
  warning: WarningRoundedIcon,
  critical: ErrorRoundedIcon,
};

/**
 * Category score rows (spec section 15). A single series (one "score"
 * measure per category), colored by status band rather than one flat hue -
 * a valid status encoding per the dataviz skill (never color alone: every
 * row also carries an icon and the category name/number as text). Plain DOM
 * rows rather than a canvas chart, so this doubles as its own accessible/
 * table-view twin - every value is reachable and clickable without relying
 * on canvas hover.
 */
export default function CategoryScoresChart({
  scores,
  onSelectCategory,
}: {
  scores: ScoreRow[];
  onSelectCategory: (category: string) => void;
}) {
  const displayScores = scores.filter((s) => s.category !== 'OVERALL').sort((a, b) => b.rawScore - a.rawScore);

  if (displayScores.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        Category scores are not available for this audit yet.
      </Typography>
    );
  }

  return (
    <Stack spacing={1.25}>
      {displayScores.map((s) => {
        const status = scoreStatus(s.rawScore);
        const color = scoreStatusColor(s.rawScore);
        const Icon = STATUS_ICON[status];
        const pct = Math.max(0, Math.min(100, s.rawScore));

        return (
          <Box
            key={s.category}
            onClick={() => onSelectCategory(s.category)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') onSelectCategory(s.category);
            }}
            sx={{
              p: 1.5,
              borderRadius: 2,
              border: 1,
              borderColor: 'divider',
              cursor: 'pointer',
              transition: 'background-color 0.15s, border-color 0.15s',
              '&:hover': { bgcolor: 'action.hover', borderColor: color },
            }}
          >
            <Stack direction="row" alignItems="center" justifyContent="space-between" mb={0.75} gap={1}>
              <Stack direction="row" alignItems="center" gap={0.75} minWidth={0}>
                <Icon sx={{ fontSize: 18, color, flexShrink: 0 }} />
                <Typography variant="body2" fontWeight={600} noWrap>
                  {categoryLabel(s.category)}
                </Typography>
                <Typography variant="caption" color="text.secondary" noWrap sx={{ flexShrink: 0 }}>
                  · {(s.weight * 100).toFixed(0)}% weight
                </Typography>
              </Stack>
              <Typography variant="body1" fontWeight={800} sx={{ flexShrink: 0 }}>
                {Math.round(s.rawScore)}
              </Typography>
            </Stack>
            <Box sx={{ height: 6, borderRadius: 3, bgcolor: 'action.hover', overflow: 'hidden' }}>
              <Box
                sx={{
                  height: '100%',
                  width: `${pct}%`,
                  bgcolor: color,
                  borderRadius: 3,
                  transition: 'width 0.6s ease',
                }}
              />
            </Box>
          </Box>
        );
      })}
    </Stack>
  );
}
