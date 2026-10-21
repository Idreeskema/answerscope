import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Grid,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { apiClient } from '../../api/client';
import type { AuditChange, AuditListItem } from '../../types/audit';
import { categoryLabel, formatDateTime } from '../../utils/auditFormatting';

/**
 * Spec section 16 (Historical Tracking): list past audits and let the user
 * compare two of them - overall score delta, category deltas, new/resolved
 * issues, new/removed pages, and a plain-English summary of what changed.
 */
export default function HistoryTab({
  workspaceId,
  websiteId,
  audits,
  onSelectAudit,
}: {
  workspaceId: string;
  websiteId: string;
  audits: AuditListItem[];
  onSelectAudit: (auditId: string) => void;
}) {
  const completedAudits = audits.filter((a) => a.status === 'COMPLETED');
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');

  const compare = useMutation({
    mutationFn: async () =>
      (
        await apiClient.post<AuditChange>(
          `/workspaces/${workspaceId}/websites/${websiteId}/audit-changes`,
          { fromAuditId: fromId, toAuditId: toId },
        )
      ).data,
  });

  return (
    <Box>
      <Card variant="outlined" sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            All audits
          </Typography>
          <Box sx={{ overflowX: "auto" }}><Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Overall score</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {audits.map((a) => (
                <TableRow key={a.id} hover>
                  <TableCell>{formatDateTime(a.createdAt)}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={a.status}
                      color={a.status === 'COMPLETED' ? 'success' : a.status === 'FAILED' ? 'error' : 'default'}
                    />
                  </TableCell>
                  <TableCell align="right">{a.overallScore != null ? Math.round(a.overallScore) : '-'}</TableCell>
                  <TableCell align="right">
                    <Button size="small" onClick={() => onSelectAudit(a.id)}>
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table></Box>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Compare two audits
          </Typography>
          {completedAudits.length < 2 ? (
            <Typography variant="body2" color="text.secondary">
              You need at least two completed audits to compare progress over time.
            </Typography>
          ) : (
            <>
              <Stack direction="row" spacing={2} alignItems="center" mb={2}>
                <Select size="small" displayEmpty value={fromId} onChange={(e) => setFromId(e.target.value)}>
                  <MenuItem value="" disabled>
                    From (earlier)
                  </MenuItem>
                  {completedAudits.map((a) => (
                    <MenuItem key={a.id} value={a.id}>
                      {formatDateTime(a.createdAt)} ({a.overallScore != null ? Math.round(a.overallScore) : 'N/A'})
                    </MenuItem>
                  ))}
                </Select>
                <Typography>→</Typography>
                <Select size="small" displayEmpty value={toId} onChange={(e) => setToId(e.target.value)}>
                  <MenuItem value="" disabled>
                    To (later)
                  </MenuItem>
                  {completedAudits.map((a) => (
                    <MenuItem key={a.id} value={a.id}>
                      {formatDateTime(a.createdAt)} ({a.overallScore != null ? Math.round(a.overallScore) : 'N/A'})
                    </MenuItem>
                  ))}
                </Select>
                <Button
                  variant="contained"
                  disabled={!fromId || !toId || fromId === toId || compare.isPending}
                  onClick={() => compare.mutate()}
                >
                  Compare
                </Button>
              </Stack>

              {compare.isError && (
                <Typography color="error" variant="body2">
                  Failed to compare audits.
                </Typography>
              )}

              {compare.data && (
                <Box>
                  <Stack direction="row" spacing={4} mb={2}>
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        Score
                      </Typography>
                      <Typography variant="h5" fontWeight={700}>
                        {(() => {
                          const overall = compare.data.scoreDelta['OVERALL'];
                          if (overall) return `${Math.round(overall.from)} → ${Math.round(overall.to)}`;
                          return '-';
                        })()}
                      </Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        Improvement
                      </Typography>
                      <Typography
                        variant="h5"
                        fontWeight={700}
                        color={
                          (compare.data.scoreDelta['OVERALL']?.delta ?? 0) >= 0 ? 'success.main' : 'error.main'
                        }
                      >
                        {(() => {
                          const d = compare.data.scoreDelta['OVERALL']?.delta ?? 0;
                          return `${d >= 0 ? '+' : ''}${d.toFixed(1)}`;
                        })()}
                      </Typography>
                    </Box>
                  </Stack>

                  <Typography variant="body2" mb={2}>
                    {compare.data.summary}
                  </Typography>

                  <Grid container spacing={2}>
                    <Grid item xs={12} md={6}>
                      <Typography variant="subtitle2" gutterBottom>
                        Category score changes
                      </Typography>
                      <Box sx={{ overflowX: "auto" }}><Table size="small">
                        <TableBody>
                          {Object.entries(compare.data.scoreDelta)
                            .filter(([cat]) => cat !== 'OVERALL')
                            .map(([cat, delta]) => (
                              <TableRow key={cat}>
                                <TableCell>{categoryLabel(cat)}</TableCell>
                                <TableCell align="right">
                                  {delta.from.toFixed(1)} → {delta.to.toFixed(1)}
                                </TableCell>
                                <TableCell
                                  align="right"
                                  sx={{ color: delta.delta >= 0 ? 'success.main' : 'error.main' }}
                                >
                                  {delta.delta >= 0 ? '+' : ''}
                                  {delta.delta.toFixed(1)}
                                </TableCell>
                              </TableRow>
                            ))}
                        </TableBody>
                      </Table></Box>
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <Typography variant="subtitle2" gutterBottom>
                        Pages &amp; issues
                      </Typography>
                      <Stack spacing={0.5}>
                        <Typography variant="body2">New issues: {compare.data.newIssues.length}</Typography>
                        <Typography variant="body2">Resolved issues: {compare.data.resolvedIssues.length}</Typography>
                        <Typography variant="body2">New pages: {compare.data.newPages.length}</Typography>
                        <Typography variant="body2">Removed pages: {compare.data.removedPages.length}</Typography>
                      </Stack>
                    </Grid>
                  </Grid>
                </Box>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
