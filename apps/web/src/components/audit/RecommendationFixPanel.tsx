import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Box, Button, Chip, Divider, Paper, Stack, Typography } from '@mui/material';
import { apiClient } from '../../api/client';
import type { FixStatus, RecommendationRow } from '../../types/audit';
import { fixStatusColor } from '../../utils/auditFormatting';

/**
 * Generate/Approve/Reject panel for a single Recommendation's GeneratedFix
 * rows (spec section 13). A fix always starts as GENERATED and a human must
 * explicitly move it to APPROVED/APPLIED/REJECTED - the UI never auto-applies
 * a fix (see docs/AGENT_BRIEF.md).
 */
export default function RecommendationFixPanel({
  auditId,
  recommendation,
}: {
  auditId: string;
  recommendation: RecommendationRow;
}) {
  const queryClient = useQueryClient();

  const generateFix = useMutation({
    mutationFn: async () =>
      (await apiClient.post(`/recommendations/${recommendation.id}/fixes`)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audit-detail', auditId] });
    },
  });

  const updateFixStatus = useMutation({
    mutationFn: async ({ fixId, status }: { fixId: string; status: FixStatus }) =>
      (await apiClient.patch(`/recommendations/fixes/${fixId}`, { status })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audit-detail', auditId] });
    },
  });

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
        <Typography variant="subtitle2">Automatic fix</Typography>
        <Button
          size="small"
          variant="outlined"
          onClick={() => generateFix.mutate()}
          disabled={generateFix.isPending}
        >
          {generateFix.isPending ? 'Generating...' : 'Generate fix'}
        </Button>
      </Stack>

      {generateFix.isError && (
        <Typography variant="body2" color="error" mb={1}>
          {(generateFix.error as any)?.response?.data?.message ?? 'Failed to generate fix'}
        </Typography>
      )}

      {recommendation.fixes.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No fix generated yet. Click "Generate fix" to draft a before/after change for review -
          nothing is applied automatically.
        </Typography>
      ) : (
        <Stack spacing={1.5}>
          {recommendation.fixes.map((fix) => (
            <Paper key={fix.id} variant="outlined" sx={{ p: 1.5 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
                <Chip size="small" label={fix.status} color={fixStatusColor(fix.status)} />
                <Typography variant="caption" color="text.secondary">
                  {fix.type}
                </Typography>
              </Stack>
              {fix.before && (
                <Box mb={1}>
                  <Typography variant="caption" color="text.secondary">
                    Before
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{ whiteSpace: 'pre-wrap', bgcolor: 'action.hover', p: 1, borderRadius: 1 }}
                  >
                    {fix.before}
                  </Typography>
                </Box>
              )}
              <Box mb={1}>
                <Typography variant="caption" color="text.secondary">
                  Suggested fix{fix.status !== 'GENERATED' ? '' : ' (review before approving)'}
                </Typography>
                <Typography
                  variant="body2"
                  sx={{ whiteSpace: 'pre-wrap', bgcolor: 'action.hover', p: 1, borderRadius: 1 }}
                >
                  {fix.after}
                </Typography>
              </Box>
              {fix.status === 'GENERATED' && (
                <Stack direction="row" spacing={1}>
                  <Button
                    size="small"
                    color="success"
                    variant="contained"
                    disabled={updateFixStatus.isPending}
                    onClick={() => updateFixStatus.mutate({ fixId: fix.id, status: 'APPROVED' })}
                  >
                    Approve
                  </Button>
                  <Button
                    size="small"
                    color="error"
                    variant="outlined"
                    disabled={updateFixStatus.isPending}
                    onClick={() => updateFixStatus.mutate({ fixId: fix.id, status: 'REJECTED' })}
                  >
                    Reject
                  </Button>
                </Stack>
              )}
              {fix.status === 'APPROVED' && (
                <Button
                  size="small"
                  variant="contained"
                  disabled={updateFixStatus.isPending}
                  onClick={() => updateFixStatus.mutate({ fixId: fix.id, status: 'APPLIED' })}
                >
                  Mark as applied
                </Button>
              )}
            </Paper>
          ))}
          <Divider />
        </Stack>
      )}
    </Box>
  );
}
