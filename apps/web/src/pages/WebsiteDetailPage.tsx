import { useParams } from 'react-router-dom';
import { Box, Container, Typography } from '@mui/material';

/**
 * STUB - this is the core product screen (spec sections 15 "Dashboard" and
 * 27 "Final Product Goal"). Build here:
 *  - fetch the website's audits (GET /api/workspaces/:workspaceId/websites/:websiteId/audits)
 *  - "Run new audit" button -> POST .../audits, then poll
 *    GET /api/audits/:auditId/status until status === 'COMPLETED' | 'FAILED'
 *  - once completed, fetch GET /api/audits/:auditId for the full drill-down
 *    payload (scores, seoChecks, aeoAnalyses, geoAnalysis, entities,
 *    recommendations, queries, competitorAnalyses - see
 *    AuditsService.getAudit in apps/api for the exact shape) and render the
 *    dashboard: overall score, category score bars/donut (Chart.js),
 *    Critical/High Issues, Quick Wins, drill-down modal per check showing
 *    Problem/Evidence/Affected URL/Why it matters/How to fix (spec section
 *    15), recommendations list with "Generate fix" + approve/reject.
 * See docs/AGENT_BRIEF.md for conventions.
 */
export default function WebsiteDetailPage() {
  const { websiteId } = useParams();

  return (
    <Container sx={{ py: 4 }}>
      <Box>
        <Typography variant="h5" fontWeight={700}>
          Website {websiteId}
        </Typography>
        <Typography color="text.secondary">
          Audit dashboard not yet implemented.
        </Typography>
      </Box>
    </Container>
  );
}
