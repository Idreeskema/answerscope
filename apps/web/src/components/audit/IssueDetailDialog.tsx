import { type ReactNode, useEffect, useState, type SyntheticEvent } from 'react';
import {
  Box,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
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
 *
 * Split across two tabs (diagnosis vs. remediation) instead of one long
 * stacked scroll, since a recommendation's fix panel (generate/approve/
 * reject, with before/after blocks) can get long on its own.
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
  const [tab, setTab] = useState(0);

  // Reset to the first tab whenever a new issue is opened, so re-opening the
  // dialog for a different item never starts on a stale "Fix" tab.
  useEffect(() => {
    if (open) setTab(0);
  }, [open, source]);

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

  function handleTabChange(_event: SyntheticEvent, value: number) {
    setTab(value);
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 0 }}>
        <Box display="flex" alignItems="center" gap={1}>
          {severityChip}
          {statusChip}
        </Box>
        <IconButton onClick={onClose} size="small">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      {source && (
        <>
          <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 3 }}>
            <Tabs value={tab} onChange={handleTabChange} variant="fullWidth">
              <Tab label="Details" id="issue-tab-details" />
              <Tab label="Fix" id="issue-tab-fix" />
            </Tabs>
          </Box>

          <DialogContent dividers sx={{ minHeight: 320 }}>
            {tab === 0 && (
              <Stack spacing={2}>
                <Section label="Problem" value={problem} />
                <Section label="Evidence" value={evidence} mono />
                <Section
                  label="Affected URL"
                  value={affectedUrl ?? 'Site-wide (not tied to a single page)'}
                  link={!!affectedUrl}
                />
                <Section
                  label="Why it matters"
                  value={whyItMatters ?? 'Not recorded for this check type - see the Fix tab for the recommendation.'}
                />
              </Stack>
            )}

            {tab === 1 && (
              <Stack spacing={2}>
                <Section label="How to fix" value={howToFix} />

                {source.kind === 'check' && (
                  <Section
                    label="Suggested fix"
                    value="Not available directly on a raw technical check - open the corresponding recommendation (if one was generated for it) for an AI-assisted fix."
                  />
                )}

                {source.kind === 'recommendation' && (
                  <>
                    {/* This is a short deterministic hint set when the recommendation was
                        created (not AI-generated) - only a couple of recommendation types
                        populate it. The real, generated fix (LLM-polished when an OpenAI key
                        is configured) lives in RecommendationFixPanel below via "Generate fix". */}
                    {example && <Section label="Example (from analysis)" value={example} mono />}
                    <RecommendationFixPanel auditId={auditId} recommendation={source.recommendation} />
                  </>
                )}
              </Stack>
            )}
          </DialogContent>
        </>
      )}
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
