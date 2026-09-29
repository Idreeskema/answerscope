import { Alert, Box, Chip, LinearProgress, Stack, Typography } from '@mui/material';
import type { AuditStatusResponse } from '../../types/audit';

const STEP_LABELS: Array<{ threshold: number; label: string }> = [
  { threshold: 0, label: 'Queued' },
  { threshold: 1, label: 'Crawling website' },
  { threshold: 50, label: 'Crawling website' },
  { threshold: 75, label: 'Running analyzers and scoring' },
  { threshold: 100, label: 'Completed' },
];

function stepFor(progress: number): string {
  let label = STEP_LABELS[0].label;
  for (const step of STEP_LABELS) {
    if (progress >= step.threshold) label = step.label;
  }
  return label;
}

export default function AuditProgress({ status }: { status: AuditStatusResponse }) {
  const isFailed = status.status === 'FAILED';

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1}>
        <Typography variant="body2" fontWeight={600}>
          {status.statusMessage || stepFor(status.progress)}
        </Typography>
        <Chip
          size="small"
          label={status.status}
          color={isFailed ? 'error' : status.status === 'COMPLETED' ? 'success' : 'primary'}
        />
      </Stack>
      <LinearProgress
        variant="determinate"
        value={status.progress}
        color={isFailed ? 'error' : 'primary'}
        sx={{ height: 8, borderRadius: 4 }}
      />
      <Typography variant="caption" color="text.secondary" mt={0.5} display="block">
        {status.progress}%
      </Typography>
      {isFailed && status.error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {status.error}
        </Alert>
      )}
    </Box>
  );
}
