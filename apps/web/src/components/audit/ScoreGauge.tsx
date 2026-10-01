import { Box, Stack, Typography } from '@mui/material';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import WarningRoundedIcon from '@mui/icons-material/WarningRounded';
import ErrorRoundedIcon from '@mui/icons-material/ErrorRounded';
import { scoreStatus, scoreStatusColor, scoreStatusLabel, type ScoreStatus } from '../../utils/auditFormatting';

const STATUS_ICON: Record<ScoreStatus, typeof CheckCircleRoundedIcon> = {
  good: CheckCircleRoundedIcon,
  warning: WarningRoundedIcon,
  critical: ErrorRoundedIcon,
};

/**
 * Circular "hero number" gauge for the overall score - a single standalone
 * figure (dataviz skill: large standalone numbers stay in the system sans,
 * proportional figures), colored by status band. The color is never the
 * only signal: an icon + text label ("Strong"/"Needs attention"/"Weak")
 * always accompanies it, since warning/critical fall below the skill's 3:1
 * contrast floor on a light surface by design.
 */
export default function ScoreGauge({
  value,
  size = 136,
  label = 'AI Search Readiness',
}: {
  value: number | null;
  size?: number;
  label?: string;
}) {
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = value != null ? Math.max(0, Math.min(100, value)) : 0;
  const offset = circumference * (1 - pct / 100);
  const status = value != null ? scoreStatus(value) : null;
  const color = status ? scoreStatusColor(value as number) : '#c3c2b7';
  const Icon = status ? STATUS_ICON[status] : null;

  return (
    <Stack alignItems="center" spacing={1}>
      <Box position="relative" width={size} height={size}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#e1e0d9" strokeWidth={stroke} />
          {value != null && (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={color}
              strokeWidth={stroke}
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              strokeLinecap="round"
              style={{ transition: 'stroke-dashoffset 0.6s ease' }}
            />
          )}
        </svg>
        <Box
          position="absolute"
          top={0}
          left={0}
          right={0}
          bottom={0}
          display="flex"
          flexDirection="column"
          alignItems="center"
          justifyContent="center"
        >
          <Typography variant="h3" fontWeight={800} lineHeight={1}>
            {value != null ? Math.round(value) : '—'}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            / 100
          </Typography>
        </Box>
      </Box>

      <Typography variant="body2" fontWeight={600} textAlign="center">
        {label}
      </Typography>

      {status && Icon && (
        <Stack direction="row" alignItems="center" gap={0.5} sx={{ color }}>
          <Icon fontSize="small" />
          <Typography variant="caption" fontWeight={700} sx={{ color }}>
            {scoreStatusLabel(status)}
          </Typography>
        </Stack>
      )}
    </Stack>
  );
}
