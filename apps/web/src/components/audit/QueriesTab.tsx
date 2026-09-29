import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import { apiClient } from '../../api/client';
import type { QueryRow, QueryStatus, QueryTestingProviderName, QueryTestingResult } from '../../types/audit';
import { formatDateTime, queryStatusColor } from '../../utils/auditFormatting';

const PROVIDERS: QueryTestingProviderName[] = ['OPENAI', 'ANTHROPIC', 'PERPLEXITY', 'GOOGLE_AI_OVERVIEWS'];

function isTestingResult(value: unknown): value is QueryTestingResult {
  return !!value && typeof value === 'object' && 'status' in (value as Record<string, unknown>);
}

export default function QueriesTab({ auditId }: { auditId: string }) {
  const queryClient = useQueryClient();
  const queryKey = ['queries', auditId];

  const { data: queries, isLoading } = useQuery<QueryRow[]>({
    queryKey,
    queryFn: async () => (await apiClient.get(`/audits/${auditId}/queries`)).data,
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [providerByQuery, setProviderByQuery] = useState<Record<string, QueryTestingProviderName>>({});
  const [testResults, setTestResults] = useState<Record<string, QueryTestingResult>>({});

  const updateQuery = useMutation({
    mutationFn: async ({ queryId, body }: { queryId: string; body: Partial<{ query: string; status: QueryStatus; importance: number }> }) =>
      (await apiClient.patch(`/audits/${auditId}/queries/${queryId}`, body)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      setEditingId(null);
    },
  });

  const deleteQuery = useMutation({
    mutationFn: async (queryId: string) => (await apiClient.delete(`/audits/${auditId}/queries/${queryId}`)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const testQuery = useMutation({
    mutationFn: async ({ queryId, provider }: { queryId: string; provider: QueryTestingProviderName }) =>
      (await apiClient.post(`/audits/${auditId}/queries/${queryId}/test/${provider}`)).data,
    onSuccess: (data, variables) => {
      const key = `${variables.queryId}:${variables.provider}`;
      if (isTestingResult(data)) {
        setTestResults((prev) => ({ ...prev, [key]: data }));
      } else {
        setTestResults((prev) => ({
          ...prev,
          [key]: {
            status: 'OK',
            provider: variables.provider,
            targetMentioned: data.targetMentioned,
            targetCited: data.targetCited,
            citedUrls: data.citedUrls ?? [],
            competingBrands: data.competingBrands ?? [],
            competingUrls: data.competingUrls ?? [],
            answerSummary: data.answerSummary,
            citationPosition: data.citationPosition,
          },
        }));
      }
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const groups = useMemo(() => {
    const map = new Map<string, QueryRow[]>();
    for (const q of queries ?? []) {
      const key = q.category || 'Uncategorized';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(q);
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [queries]);

  if (isLoading) {
    return <CircularProgress size={24} />;
  }

  if (!queries || queries.length === 0) {
    return (
      <Typography color="text.secondary">
        No queries have been generated for this audit yet.
      </Typography>
    );
  }

  return (
    <Box>
      {groups.map(([category, rows]) => (
        <Accordion key={category} defaultExpanded variant="outlined" disableGutters sx={{ mb: 1 }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography fontWeight={600}>{category}</Typography>
              <Chip size="small" label={rows.length} />
            </Stack>
          </AccordionSummary>
          <AccordionDetails>
            <Stack spacing={1.5}>
              {rows.map((q) => {
                const provider = providerByQuery[q.id] ?? 'OPENAI';
                const testKey = `${q.id}:${provider}`;
                const ephemeralResult = testResults[testKey];
                const isEditing = editingId === q.id;
                return (
                  <Paper key={q.id} variant="outlined" sx={{ p: 1.5 }}>
                    <Stack direction="row" spacing={1} alignItems="flex-start" flexWrap="wrap">
                      <Box flex={1} minWidth={220}>
                        {isEditing ? (
                          <Stack direction="row" spacing={1} alignItems="center">
                            <TextField
                              size="small"
                              fullWidth
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                            />
                            <IconButton
                              size="small"
                              color="success"
                              onClick={() => updateQuery.mutate({ queryId: q.id, body: { query: editValue } })}
                            >
                              <CheckIcon fontSize="small" />
                            </IconButton>
                            <IconButton size="small" onClick={() => setEditingId(null)}>
                              <CloseIcon fontSize="small" />
                            </IconButton>
                          </Stack>
                        ) : (
                          <Typography variant="body2" fontWeight={600}>
                            {q.query}
                          </Typography>
                        )}
                        <Typography variant="caption" color="text.secondary">
                          Intent: {q.intent} {q.topic ? `· Topic: ${q.topic}` : ''} · Importance {q.importance}/10
                        </Typography>
                      </Box>

                      <Chip size="small" label={q.status} color={queryStatusColor(q.status)} />

                      <Stack direction="row" spacing={0.5}>
                        <Tooltip title="Edit">
                          <IconButton
                            size="small"
                            onClick={() => {
                              setEditingId(q.id);
                              setEditValue(q.query);
                            }}
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Approve">
                          <IconButton
                            size="small"
                            color="success"
                            onClick={() => updateQuery.mutate({ queryId: q.id, body: { status: 'APPROVED' } })}
                          >
                            <CheckIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Reject">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => updateQuery.mutate({ queryId: q.id, body: { status: 'REJECTED' } })}
                          >
                            <CloseIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete">
                          <IconButton size="small" onClick={() => deleteQuery.mutate(q.id)}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </Stack>

                    <Stack direction="row" spacing={1} alignItems="center" mt={1}>
                      <Select
                        size="small"
                        value={provider}
                        onChange={(e) =>
                          setProviderByQuery((prev) => ({
                            ...prev,
                            [q.id]: e.target.value as QueryTestingProviderName,
                          }))
                        }
                      >
                        {PROVIDERS.map((p) => (
                          <MenuItem key={p} value={p}>
                            {p}
                          </MenuItem>
                        ))}
                      </Select>
                      <Button
                        size="small"
                        variant="outlined"
                        disabled={testQuery.isPending}
                        onClick={() => testQuery.mutate({ queryId: q.id, provider })}
                      >
                        Test
                      </Button>
                      {q.results.length > 0 && (
                        <Typography variant="caption" color="text.secondary">
                          Last stored result: {formatDateTime(q.results[q.results.length - 1].timestamp)}
                        </Typography>
                      )}
                    </Stack>

                    {ephemeralResult && (
                      <Box mt={1}>
                        {ephemeralResult.status === 'NOT_CONFIGURED' ? (
                          <Alert severity="info" sx={{ py: 0 }}>
                            Not tested - provider not configured
                          </Alert>
                        ) : ephemeralResult.status === 'ERROR' ? (
                          <Alert severity="warning" sx={{ py: 0 }}>
                            Test failed: {ephemeralResult.errorMessage ?? 'Unknown error'}
                          </Alert>
                        ) : (
                          <Alert severity="success" sx={{ py: 0 }}>
                            {ephemeralResult.provider}: mentioned {ephemeralResult.targetMentioned ? 'yes' : 'no'},
                            cited {ephemeralResult.targetCited ? 'yes' : 'no'}
                          </Alert>
                        )}
                      </Box>
                    )}
                  </Paper>
                );
              })}
            </Stack>
          </AccordionDetails>
        </Accordion>
      ))}
    </Box>
  );
}
