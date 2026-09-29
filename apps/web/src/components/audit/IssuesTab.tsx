import {
  Box,
  Card,
  CardContent,
  Chip,
  Divider,
  Grid,
  List,
  ListItemButton,
  ListItemText,
  Stack,
  Typography,
} from '@mui/material';
import type { AeoQuestionDetail, AuditDetail, SEOCheckRow } from '../../types/audit';
import { categoryLabel, humanize, severityColor } from '../../utils/auditFormatting';
import type { IssueSource } from './IssueDetailDialog';
import JsonBreakdown from './JsonBreakdown';

function CheckListCard({
  title,
  checks,
  emptyLabel,
  onOpenIssue,
}: {
  title: string;
  checks: SEOCheckRow[];
  emptyLabel: string;
  onOpenIssue: (source: IssueSource) => void;
}) {
  return (
    <Card variant="outlined">
      <CardContent>
        <Stack direction="row" spacing={1} alignItems="center" mb={1}>
          <Typography variant="h6">{title}</Typography>
          <Chip size="small" label={checks.length} />
        </Stack>
        {checks.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            {emptyLabel}
          </Typography>
        ) : (
          <List disablePadding>
            {checks.map((c) => (
              <ListItemButton
                key={c.id}
                onClick={() => onOpenIssue({ kind: 'check', check: c })}
                sx={{ borderRadius: 1, mb: 0.5 }}
              >
                <ListItemText
                  primary={humanize(c.checkId)}
                  secondary={c.page?.url ?? categoryLabel(c.category)}
                  secondaryTypographyProps={{ noWrap: true }}
                />
                <Chip size="small" label={c.severity} color={severityColor(c.severity)} />
              </ListItemButton>
            ))}
          </List>
        )}
      </CardContent>
    </Card>
  );
}

export default function IssuesTab({
  audit,
  onOpenIssue,
}: {
  audit: AuditDetail;
  onOpenIssue: (source: IssueSource) => void;
}) {
  const criticalIssues = audit.seoChecks.filter((c) => c.status === 'FAIL' && c.severity === 'CRITICAL');
  const highIssues = audit.seoChecks.filter((c) => c.status === 'FAIL' && c.severity === 'HIGH');
  const quickWins = audit.recommendations
    .filter((r) => r.effort <= 2)
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 10);

  const thinContentPages = audit.contentAnalyses.filter((c) => c.thinContent || c.duplicateOfPageId);

  const questionGaps: Array<{ pageUrl: string; question: AeoQuestionDetail }> = [];
  for (const a of audit.aeoAnalyses) {
    for (const q of a.details?.questions ?? []) {
      if (q.status !== 'DIRECTLY_ANSWERED') {
        questionGaps.push({ pageUrl: a.page?.url ?? a.pageId, question: q });
      }
    }
  }

  const totalQueries = audit.queries.length;
  const testedQueries = audit.queries.filter((q) => q.results.length > 0);
  const mentioned = testedQueries.filter((q) => q.results.some((r) => r.targetMentioned)).length;
  const cited = testedQueries.filter((q) => q.results.some((r) => r.targetCited)).length;

  return (
    <Grid container spacing={2}>
      <Grid item xs={12} md={6}>
        <CheckListCard
          title="Critical Issues"
          checks={criticalIssues}
          emptyLabel="No critical failing checks - nice work."
          onOpenIssue={onOpenIssue}
        />
      </Grid>
      <Grid item xs={12} md={6}>
        <CheckListCard
          title="High Priority Issues"
          checks={highIssues}
          emptyLabel="No high-severity failing checks."
          onOpenIssue={onOpenIssue}
        />
      </Grid>

      <Grid item xs={12} md={6}>
        <Card variant="outlined">
          <CardContent>
            <Stack direction="row" spacing={1} alignItems="center" mb={1}>
              <Typography variant="h6">Quick Wins</Typography>
              <Chip size="small" label={quickWins.length} />
            </Stack>
            <Typography variant="body2" color="text.secondary" mb={1}>
              Low-effort recommendations, ranked by priority.
            </Typography>
            {quickWins.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No low-effort recommendations available yet.
              </Typography>
            ) : (
              <List disablePadding>
                {quickWins.map((rec) => (
                  <ListItemButton
                    key={rec.id}
                    onClick={() => onOpenIssue({ kind: 'recommendation', recommendation: rec })}
                    sx={{ borderRadius: 1, mb: 0.5 }}
                  >
                    <ListItemText primary={rec.title} secondary={categoryLabel(rec.category)} />
                    <Chip size="small" label={rec.severity} color={severityColor(rec.severity)} />
                  </ListItemButton>
                ))}
              </List>
            )}
          </CardContent>
        </Card>
      </Grid>

      <Grid item xs={12} md={6}>
        <Card variant="outlined">
          <CardContent>
            <Stack direction="row" spacing={1} alignItems="center" mb={1}>
              <Typography variant="h6">AI Query Results</Typography>
            </Stack>
            <Stack direction="row" spacing={3}>
              <Stat label="Queries generated" value={totalQueries} />
              <Stat label="Tested" value={testedQueries.length} />
              <Stat label="Mentioned" value={mentioned} />
              <Stat label="Cited" value={cited} />
            </Stack>
            <Typography variant="caption" color="text.secondary" display="block" mt={1}>
              See the Queries tab to run/re-run tests per provider.
            </Typography>
          </CardContent>
        </Card>
      </Grid>

      <Grid item xs={12} md={6}>
        <Card variant="outlined">
          <CardContent>
            <Stack direction="row" spacing={1} alignItems="center" mb={1}>
              <Typography variant="h6">Content Gaps</Typography>
              <Chip size="small" label={thinContentPages.length} />
            </Stack>
            {thinContentPages.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No thin or duplicate content detected.
              </Typography>
            ) : (
              <Stack spacing={1}>
                {thinContentPages.map((c) => (
                  <Box key={c.id}>
                    <Typography variant="body2">
                      {c.thinContent ? 'Thin content' : 'Duplicate content'} · {c.paragraphCount} paragraphs
                    </Typography>
                  </Box>
                ))}
              </Stack>
            )}
          </CardContent>
        </Card>
      </Grid>

      <Grid item xs={12} md={6}>
        <Card variant="outlined">
          <CardContent>
            <Stack direction="row" spacing={1} alignItems="center" mb={1}>
              <Typography variant="h6">Question Gaps</Typography>
              <Chip size="small" label={questionGaps.length} />
            </Stack>
            {questionGaps.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No unanswered customer questions detected yet.
              </Typography>
            ) : (
              <Stack spacing={1} sx={{ maxHeight: 260, overflowY: 'auto' }}>
                {questionGaps.slice(0, 25).map((g, idx) => (
                  <Box key={idx}>
                    <Typography variant="body2" fontWeight={600}>
                      {g.question.question}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {g.question.status} · {g.pageUrl}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            )}
          </CardContent>
        </Card>
      </Grid>

      <Grid item xs={12}>
        <Card variant="outlined">
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Competitor Gaps
            </Typography>
            {audit.competitorAnalyses.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No competitors have been analyzed for this audit yet.
              </Typography>
            ) : (
              <Stack divider={<Divider />} spacing={1.5}>
                {audit.competitorAnalyses.map((c) => (
                  <Box key={c.id}>
                    <Typography variant="subtitle2">
                      {c.competitor?.name ?? c.competitor?.url ?? c.competitorId}
                    </Typography>
                    <JsonBreakdown value={c.gaps} />
                  </Box>
                ))}
              </Stack>
            )}
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Box>
      <Typography variant="h5" fontWeight={700}>
        {value}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
    </Box>
  );
}
