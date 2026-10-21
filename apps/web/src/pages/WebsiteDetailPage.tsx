import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  MenuItem,
  Select,
  Stack,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
import AppHeader from '../components/AppHeader';
import AddIcon from '@mui/icons-material/Add';
import { apiClient } from '../api/client';
import { ACTIVE_AUDIT_STATUSES, formatDateTime } from '../utils/auditFormatting';
import { useAuditStatus } from '../hooks/useAuditStatus';
import AuditProgress from '../components/audit/AuditProgress';
import NewAuditDialog, { type NewAuditOptions } from '../components/audit/NewAuditDialog';
import OverviewTab from '../components/audit/OverviewTab';
import IssuesTab from '../components/audit/IssuesTab';
import RecommendationsTab from '../components/audit/RecommendationsTab';
import QueriesTab from '../components/audit/QueriesTab';
import HistoryTab from '../components/audit/HistoryTab';
import IssueDetailDialog, { type IssueSource } from '../components/audit/IssueDetailDialog';
import type { AuditDetail, AuditListItem, Website, Workspace } from '../types/audit';

/**
 * Core product screen (spec sections 15 "Dashboard", 16 "Historical
 * Tracking", 27 "Final Product Goal"). See docs/AGENT_BRIEF.md for the
 * project's "no meaningless score" principle - every number here is one
 * click away from the real evidence that produced it.
 */
export default function WebsiteDetailPage() {
  const { websiteId } = useParams<{ websiteId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState(0);
  const [selectedAuditId, setSelectedAuditId] = useState<string | null>(null);
  const [newAuditOpen, setNewAuditOpen] = useState(false);
  const [issueSource, setIssueSource] = useState<IssueSource | null>(null);

  const { data: workspaces } = useQuery<Workspace[]>({
    queryKey: ['workspaces'],
    queryFn: async () => (await apiClient.get('/workspaces')).data,
  });
  const workspaceId = workspaces?.[0]?.id;

  const { data: website } = useQuery<Website>({
    queryKey: ['website', workspaceId, websiteId],
    queryFn: async () => (await apiClient.get(`/workspaces/${workspaceId}/websites/${websiteId}`)).data,
    enabled: !!workspaceId && !!websiteId,
  });

  const auditsQueryKey = ['audits', workspaceId, websiteId];
  const { data: audits, isLoading: auditsLoading } = useQuery<AuditListItem[]>({
    queryKey: auditsQueryKey,
    queryFn: async () => (await apiClient.get(`/workspaces/${workspaceId}/websites/${websiteId}/audits`)).data,
    enabled: !!workspaceId && !!websiteId,
  });

  // Default to the most recent audit once the list loads.
  useEffect(() => {
    if (!selectedAuditId && audits && audits.length > 0) {
      setSelectedAuditId(audits[0].id);
    }
  }, [audits, selectedAuditId]);

  const createAudit = useMutation({
    mutationFn: async (options: NewAuditOptions) =>
      (
        await apiClient.post<AuditListItem>(
          `/workspaces/${workspaceId}/websites/${websiteId}/audits`,
          options,
        )
      ).data,
    onSuccess: (audit) => {
      queryClient.invalidateQueries({ queryKey: auditsQueryKey });
      setSelectedAuditId(audit.id);
      setTab(0);
      setNewAuditOpen(false);
    },
  });

  const { data: auditStatus } = useAuditStatus(selectedAuditId);
  const isActive = !!auditStatus && ACTIVE_AUDIT_STATUSES.has(auditStatus.status);
  const isTerminal = auditStatus?.status === 'COMPLETED' || auditStatus?.status === 'FAILED';

  // Once an active audit reaches a terminal state, refresh the audits list so
  // the picker/header show the final overall score without a manual reload.
  const prevStatusRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const prev = prevStatusRef.current;
    if (prev && ACTIVE_AUDIT_STATUSES.has(prev) && auditStatus && !ACTIVE_AUDIT_STATUSES.has(auditStatus.status)) {
      queryClient.invalidateQueries({ queryKey: auditsQueryKey });
    }
    prevStatusRef.current = auditStatus?.status;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auditStatus?.status]);

  const { data: auditDetail, isLoading: detailLoading } = useQuery<AuditDetail>({
    queryKey: ['audit-detail', selectedAuditId],
    queryFn: async () => (await apiClient.get(`/audits/${selectedAuditId}`)).data,
    enabled: !!selectedAuditId && isTerminal,
  });

  const selectedSummary = audits?.find((a) => a.id === selectedAuditId);
  const latestIsActive = audits && audits.length > 0 && ACTIVE_AUDIT_STATUSES.has(audits[0].status);

  const handleSelectAudit = (auditId: string) => {
    setSelectedAuditId(auditId);
    setTab(0);
  };

  return (
    <Box bgcolor="background.default" minHeight="100dvh">
      <AppHeader onBack={() => navigate('/')} backLabel="Websites" />

      <Container sx={{ py: { xs: 2.5, sm: 4 }, px: { xs: 2, sm: 3 }, pb: 'calc(env(safe-area-inset-bottom) + 24px)' }}>
        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2} mb={3}>
          <Box>
            <Typography variant="h5" fontWeight={800} sx={{ wordBreak: 'break-word' }}>
              {website?.name ?? website?.domain ?? 'Website'}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ wordBreak: 'break-all' }}>
              {website?.url}
            </Typography>
          </Box>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ xs: 'stretch', sm: 'center' }}>
            <Box textAlign="center">
              <Typography variant="caption" color="text.secondary" display="block">
                AI Search Readiness
              </Typography>
              <Typography variant="h4" fontWeight={800}>
                {selectedSummary?.status === 'COMPLETED' && selectedSummary.overallScore != null
                  ? `${Math.round(selectedSummary.overallScore)}/100`
                  : selectedSummary?.status === 'FAILED'
                    ? 'Failed'
                    : selectedSummary
                      ? '...'
                      : 'N/A'}
              </Typography>
            </Box>

            {audits && audits.length > 0 && (
              <Select
                size="small"
                value={selectedAuditId ?? ''}
                onChange={(e) => handleSelectAudit(e.target.value)}
                sx={{ minWidth: { sm: 220 } }}
              >
                {audits.map((a) => (
                  <MenuItem key={a.id} value={a.id}>
                    {formatDateTime(a.createdAt)} · {a.status}
                    {a.overallScore != null ? ` · ${Math.round(a.overallScore)}` : ''}
                  </MenuItem>
                ))}
              </Select>
            )}

            <Button
              variant="contained"
              startIcon={<AddIcon />}
              disabled={!workspaceId || !!latestIsActive}
              onClick={() => setNewAuditOpen(true)}
            >
              Run new audit
            </Button>
          </Stack>
        </Stack>

        {auditsLoading && <CircularProgress size={24} />}

        {!auditsLoading && (!audits || audits.length === 0) && (
          <Box textAlign="center" py={8}>
            <Typography variant="h6" gutterBottom>
              No audits yet
            </Typography>
            <Typography color="text.secondary" mb={3}>
              Run your first AI Search Readiness audit to see your score, issues, and recommendations.
            </Typography>
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setNewAuditOpen(true)}>
              Run first audit
            </Button>
          </Box>
        )}

        {selectedAuditId && auditStatus && isActive && (
          <Box mb={3} p={2} border={1} borderColor="divider" borderRadius={2} bgcolor="background.paper">
            <AuditProgress status={auditStatus} />
          </Box>
        )}

        {selectedAuditId && audits && audits.length > 0 && (
          <>
            <Tabs
              value={tab}
              onChange={(_, v) => setTab(v)}
              variant="scrollable"
              scrollButtons={false}
              sx={{ mb: 2, mx: { xs: -2, sm: 0 }, px: { xs: 1, sm: 0 }, borderBottom: 1, borderColor: 'divider' }}
            >
              <Tab label="Overview" />
              <Tab label="Issues" />
              <Tab label="Recommendations" />
              <Tab label="Queries" />
              <Tab label="History" />
            </Tabs>

            {tab === 4 ? (
              workspaceId && websiteId && audits ? (
                <HistoryTab
                  workspaceId={workspaceId}
                  websiteId={websiteId}
                  audits={audits}
                  onSelectAudit={handleSelectAudit}
                />
              ) : null
            ) : detailLoading ? (
              <CircularProgress size={24} />
            ) : !isTerminal ? (
              <Typography color="text.secondary">
                This audit hasn't completed yet - results will appear here automatically once it
                finishes.
              </Typography>
            ) : !auditDetail ? (
              <Typography color="text.secondary">No data available for this audit.</Typography>
            ) : auditDetail.status === 'FAILED' ? (
              <Box>
                <Chip color="error" label="Audit failed" sx={{ mb: 1 }} />
                <Typography color="text.secondary">
                  {auditDetail.error ?? 'The audit failed before completing analysis.'}
                </Typography>
                {auditDetail.crawlJob?.errors && auditDetail.crawlJob.errors.length > 0 && (
                  <Box mt={2}>
                    <Typography variant="subtitle2">Crawl errors</Typography>
                    {auditDetail.crawlJob.errors.map((e) => (
                      <Typography key={e.id} variant="body2" color="text.secondary">
                        {e.url}: {e.message}
                      </Typography>
                    ))}
                  </Box>
                )}
              </Box>
            ) : (
              <>
                {tab === 0 && <OverviewTab audit={auditDetail} onOpenIssue={setIssueSource} />}
                {tab === 1 && <IssuesTab audit={auditDetail} onOpenIssue={setIssueSource} />}
                {tab === 2 && <RecommendationsTab audit={auditDetail} />}
                {tab === 3 && <QueriesTab auditId={auditDetail.id} />}
              </>
            )}
          </>
        )}
      </Container>

      <NewAuditDialog
        open={newAuditOpen}
        onClose={() => setNewAuditOpen(false)}
        onSubmit={(options) => createAudit.mutate(options)}
        isSubmitting={createAudit.isPending}
        errorMessage={
          createAudit.isError
            ? ((createAudit.error as any)?.response?.data?.message ?? 'Failed to start audit')
            : null
        }
      />

      {selectedAuditId && (
        <IssueDetailDialog source={issueSource} auditId={selectedAuditId} onClose={() => setIssueSource(null)} />
      )}
    </Box>
  );
}
