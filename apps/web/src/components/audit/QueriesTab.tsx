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
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import WarningRoundedIcon from '@mui/icons-material/WarningRounded';
import CancelRoundedIcon from '@mui/icons-material/CancelRounded';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { apiClient } from '../../api/client';
import type { QueryRow, QueryStatus, QueryTestingProviderName, QueryTestingResult } from '../../types/audit';
import { formatDateTime, humanize, queryStatusColor } from '../../utils/auditFormatting';

const PROVIDER_LABELS: Record<QueryTestingProviderName, string> = {
  OPENAI: 'ChatGPT',
  ANTHROPIC: 'Claude',
  PERPLEXITY: 'Perplexity',
  GOOGLE_AI_OVERVIEWS: 'Google AI Overviews',
};
const PROVIDERS = Object.keys(PROVIDER_LABELS) as QueryTestingProviderName[];

const STATUS_HINT: Record<QueryStatus, string> = {
  PENDING: "You haven't reviewed this question yet",
  APPROVED: 'You approved this question',
  EDITED: 'You edited this question',
  REJECTED: "You rejected this - it won't be prioritized",
};

function priorityLabel(importance: number): string {
  if (importance >= 8) return 'High priority';
  if (importance >= 4) return 'Medium priority';
  return 'Low priority';
}

function isTestingResult(value: unknown): value is QueryTestingResult {
  return !!value && typeof value === 'object' && 'status' in (value as Record<string, unknown>);
}

/** Plain-language verdict banner for a test result - replaces raw
 * "mentioned yes/no, cited yes/no" with a sentence a non-technical user can
 * read at a glance, colored to actually match good/bad (the old version
 * always showed green, even for a "no" result). */
function ResultBanner({ result, providerLabel }: { result: QueryTestingResult; providerLabel: string }) {
  if (result.status === 'NOT_CONFIGURED') {
    return (
      <Alert severity="info" icon={<InfoOutlinedIcon fontSize="small" />} sx={{ py: 0.5 }}>
        {providerLabel} isn't connected yet - an API key needs to be added before this can be tested.
      </Alert>
    );
  }
  if (result.status === 'ERROR') {
    return (
      <Alert severity="warning" sx={{ py: 0.5 }}>
        Couldn't complete this test ({result.errorMessage ?? 'unknown error'}) - try again in a moment.
      </Alert>
    );
  }

  const mentioned = !!result.targetMentioned;
  const cited = !!result.targetCited;
  const severity = mentioned && cited ? 'success' : mentioned ? 'warning' : 'error';
  const Icon = mentioned && cited ? CheckCircleRoundedIcon : mentioned ? WarningRoundedIcon : CancelRoundedIcon;
  const headline =
    mentioned && cited
      ? `${providerLabel} found you - it mentioned your business and linked to your site.`
      : mentioned
        ? `${providerLabel} mentioned your business by name, but didn't link to your website.`
        : `${providerLabel} didn't mention your business at all when asked this.`;

  return (
    <Box>
      <Alert severity={severity} icon={<Icon fontSize="small" />} sx={{ py: 0.5 }}>
        {headline}
      </Alert>
      {result.answerSummary && (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ mt: 1, pl: 1.5, borderLeft: 3, borderColor: 'divider', fontStyle: 'italic' }}
        >
          "{result.answerSummary.length > 320 ? `${result.answerSummary.slice(0, 320)}...` : result.answerSummary}"
        </Typography>
      )}
      {result.competingBrands.length > 0 && (
        <Typography variant="caption" color="text.secondary" display="block" mt={0.75}>
          Mentioned instead: {result.competingBrands.join(', ')}
        </Typography>
      )}
      {result.citedUrls.length > 0 && (
        <Typography variant="caption" color="text.secondary" display="block" mt={0.25}>
          Linked to: {result.citedUrls.join(', ')}
        </Typography>
      )}
    </Box>
  );
}

/**
 * Spec section 9/10: the realistic questions generated for this site, and an
 * optional real-AI spot check per question. Every label here is written for
 * a non-technical reader - no raw enum values or "mentioned/cited" jargon
 * left unexplained (see the explainer banner and ResultBanner above).
 */
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
  // Which single query+provider is currently being tested - a plain
  // useMutation's isPending is shared across every row, so without this,
  // clicking Test on one question would show "Testing..." on every row.
  const [testingKey, setTestingKey] = useState<string | null>(null);

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
    onMutate: (variables) => {
      setTestingKey(`${variables.queryId}:${variables.provider}`);
    },
    onSettled: () => setTestingKey(null),
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
      <Alert severity="info" icon={<InfoOutlinedIcon fontSize="small" />} sx={{ mb: 2 }}>
        These are realistic questions a real customer might type into Google or ask an AI assistant about
        this business - generated from the actual content on the site. Click <strong>Test</strong> on any
        question to see whether a real AI currently mentions this business when asked. Results are a
        helpful spot-check, not a guarantee - the same question can get a different answer another day.
      </Alert>

      {groups.map(([category, rows]) => (
        <Accordion key={category} defaultExpanded variant="outlined" disableGutters sx={{ mb: 1 }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography fontWeight={600}>{humanize(category)}</Typography>
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
                  <Paper key={q.id} variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
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
                        <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" mt={0.5}>
                          <Chip size="small" variant="outlined" label={humanize(q.intent)} />
                          <Chip size="small" variant="outlined" label={priorityLabel(q.importance)} />
                          {q.topic && (
                            <Typography variant="caption" color="text.secondary">
                              From: {q.topic}
                            </Typography>
                          )}
                        </Stack>
                      </Box>

                      <Tooltip title={STATUS_HINT[q.status]}>
                        <Chip size="small" label={humanize(q.status)} color={queryStatusColor(q.status)} />
                      </Tooltip>

                      <Stack direction="row" spacing={0.5}>
                        <Tooltip title="Edit this question">
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
                        <Tooltip title="Approve - keep this question">
                          <IconButton
                            size="small"
                            color="success"
                            onClick={() => updateQuery.mutate({ queryId: q.id, body: { status: 'APPROVED' } })}
                          >
                            <CheckIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Reject - not relevant">
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

                    <Stack direction="row" spacing={1} alignItems="center" mt={1.25} flexWrap="wrap">
                      <Typography variant="caption" color="text.secondary">
                        Test with:
                      </Typography>
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
                            {PROVIDER_LABELS[p]}
                          </MenuItem>
                        ))}
                      </Select>
                      <Button
                        size="small"
                        variant="outlined"
                        disabled={testingKey === testKey}
                        onClick={() => testQuery.mutate({ queryId: q.id, provider })}
                      >
                        {testingKey === testKey ? 'Testing...' : 'Test'}
                      </Button>
                      {q.results.length > 0 && (
                        <Typography variant="caption" color="text.secondary">
                          Last tested {formatDateTime(q.results[q.results.length - 1].timestamp)}
                        </Typography>
                      )}
                    </Stack>

                    {ephemeralResult && (
                      <Box mt={1}>
                        <ResultBanner result={ephemeralResult} providerLabel={PROVIDER_LABELS[provider]} />
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
