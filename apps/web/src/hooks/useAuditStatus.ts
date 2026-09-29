import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { ACTIVE_AUDIT_STATUSES } from '../utils/auditFormatting';
import type { AuditStatusResponse } from '../types/audit';

/**
 * Polls GET /api/audits/:auditId/status every 2s (spec section 20) while the
 * audit is QUEUED/CRAWLING/ANALYZING, and stops automatically once it
 * reaches a terminal state (COMPLETED/FAILED).
 */
export function useAuditStatus(auditId: string | null | undefined) {
  return useQuery<AuditStatusResponse>({
    queryKey: ['audit-status', auditId],
    queryFn: async () => (await apiClient.get(`/audits/${auditId}/status`)).data,
    enabled: !!auditId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status && ACTIVE_AUDIT_STATUSES.has(status)) return 2000;
      return false;
    },
  });
}
