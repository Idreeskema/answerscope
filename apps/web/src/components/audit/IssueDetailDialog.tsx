import type { ReactNode } from 'react';
import { Box, Chip, Dialog, DialogContent, DialogTitle, Divider, IconButton, Stack, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import type { RecommendationRow, SEOCheckRow } from '../../types/audit';
import { categoryLabel, humanize, recommendationStatusColor, severityColor } from '../../utils/auditFormatting';
import RecommendationFixPanel from './RecommendationFixPanel';

export type IssueSource =
  | { kind: 'check'; check: SEOCheckRow }
  | { kind: 'recommendation'; recommendation: RecommendationRow };

/**
 * Drill-down dialog covering the exact fields spec section 15 requires when
 * clicking an issue: Problem, Evidence, Affected URL, Why it matters, How to
 * fix, AI-generated example. SEOCheck rows and Recommendation rows carry
 * slightly different fields (a SEOCheck has no standalone "why it matters" /
 * "example" field) - this is called out explicitly rather than invented.
 */
export default function IssueDetailDialog({
  source,
  auditId,
  onClose,
}: {
  source: IssueSource | null;
  auditId: string;
  onClose: () => void;
}) {
  const open = !!source;

  let problem = '';
  let evidence = '';
  let affectedUrl: string | null = null;
  let whyItMatters: string | null = null;
  let howToFix = '';
  let example: string | null = null;
  let severityChip: ReactNode = null;
  let statusChip: ReactNode = null;

  if (source?.kind === 'check') {
    const c = source.check;
    problem = `${humanize(c.checkId)} (${categoryLabel(c.category)})`;
    evidence = c.evidence;
    affectedUrl = c.page?.url ?? null;
    whyItMatters = null;
    howToFix = c.recommendation;
    example = null;
    severityChip = <Chip size="small" label={c.severity} color={severityColor(c.severity)} />;
    statusChip = <Chip size="small" label={c.status} variant="outlined" />;
  } else if (source?.kind === 'recommendation') {
    const r = source.recommendation;
    problem = r.title;
    evidence = r.evidence;
    affectedUrl = r.affectedUrl;
    whyItMatters = r.explanation;
    howToFix = r.action;
    example = r.example;
    severityChip = <Chip size="small" label={r.severity} color={severityColor(r.severity)} />;
    statusChip = <Chip size="small" label={r.status} color={recommendationStatusColor(r.status)} />;
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box display="flex" alignItems="center" gap={1}>
          {severityChip}
          {statusChip}
        </Box>
        <IconButton onClick={onClose} size="small">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {source && (
          <Stack spacing={2}>
            <Section label="Problem" value={problem} />
            <Section label="Evidence" value={evidence} mono />
            <Section label="Affected URL" value={affectedUrl ?? 'Site-wide (not tied to a single page)'} link={!!affectedUrl} />
            <Section
              label="Why it matters"
              value={whyItMatters ?? 'Not recorded for this check type - see "How to fix" for the recommendation.'}
            />
            <Section label="How to fix" value={howToFix} />
            <Section label="AI-generated example" value={example ?? 'No example generated for this item.'} mono={!!example} />

            {source.kind === 'recommendation' && (
              <>
                <Divider />
                <RecommendationFixPanel auditId={auditId} recommendation={source.recommendation} />
              </>
            )}
          </Stack>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Section({
  label,
  value,
  mono,
  link,
}: {
  label: string;
  value: string;
  mono?: boolean;
  link?: boolean;
}) {
  return (
    <Box>
      <Typography variant="overline" color="text.secondary">
        {label}
      </Typography>
      {link ? (
        <Typography
          component="a"
          href={value}
          target="_blank"
          rel="noreferrer"
          variant="body2"
          sx={{ display: 'block', wordBreak: 'break-all' }}
        >
          {value}
        </Typography>
      ) : (
        <Typography
          variant="body2"
          sx={{
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            ...(mono ? { bgcolor: 'action.hover', p: 1, borderRadius: 1, fontFamily: 'monospace' } : {}),
          }}
        >
          {value}
        </Typography>
      )}
    </Box>
  );
}
