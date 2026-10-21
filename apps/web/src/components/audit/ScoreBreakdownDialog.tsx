import { useEffect, useMemo, useState, type SyntheticEvent } from 'react';
import {
  Box,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Paper,
  Stack,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import WarningRoundedIcon from '@mui/icons-material/WarningRounded';
import ErrorRoundedIcon from '@mui/icons-material/ErrorRounded';
import ScaleRoundedIcon from '@mui/icons-material/ScaleRounded';
import AddchartRoundedIcon from '@mui/icons-material/AddchartRounded';
import type { AuditDetail, SEOCheckRow } from '../../types/audit';
import {
  categoryLabel,
  checkStatusColor,
  humanize,
  normalizeKey,
  scoreStatus,
  scoreStatusColor,
  scoreStatusLabel,
  type ScoreStatus,
} from '../../utils/auditFormatting';
import JsonBreakdown from './JsonBreakdown';

const STATUS_ICON: Record<ScoreStatus, typeof CheckCircleRoundedIcon> = {
  good: CheckCircleRoundedIcon,
  warning: WarningRoundedIcon,
  critical: ErrorRoundedIcon,
};

// Mirrors ScoringService.computeScores' actual formula (see each Score row's
// own `breakdown.formula` string, which is rendered verbatim below too) -
// SEOCheck.category is a free-form string set by the technical-seo analyzer
// independently of the SCORE_CATEGORIES enum, e.g. "TECHNICAL_SEO" is fed by
// checks categorized "TECHNICAL" and "METADATA", not by a check literally
// categorized "TECHNICAL_SEO".
const SEO_CHECK_PATTERNS: Record<string, string[]> = {
  TECHNICAL_SEO: ['TECHNICAL', 'METADATA'],
  STRUCTURED_DATA: ['STRUCTURED_DATA'],
  INTERNAL_LINKING: ['INTERNAL_LINKING'],
  CONTENT_QUALITY: ['CONTENT_STRUCTURE'],
};

function matchingSeoChecks(checks: SEOCheckRow[], category: string): SEOCheckRow[] {
  const patterns = SEO_CHECK_PATTERNS[category];
  if (!patterns) return [];
  const wanted = new Set(patterns.map(normalizeKey));
  return checks.filter((c) => wanted.has(normalizeKey(c.category)));
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: typeof CheckCircleRoundedIcon;
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <Paper variant="outlined" sx={{ p: { xs: 1.25, sm: 1.5 }, borderRadius: 2, flex: 1, minWidth: 0 }}>
      <Stack direction="row" alignItems="center" gap={0.75} mb={0.5}>
        <Icon sx={{ fontSize: 16, color: color ?? 'text.secondary', display: { xs: 'none', sm: 'block' } }} />
        <Typography variant="caption" color="text.secondary" noWrap>
          {label}
        </Typography>
      </Stack>
      <Typography fontWeight={800} noWrap sx={{ fontSize: { xs: '1.15rem', sm: '1.5rem' } }}>
        {value}
      </Typography>
    </Paper>
  );
}

/**
 * "How was this calculated" drill-down (spec section 15). Split into a
 * Summary tab (the raw/weight/contribution numbers plus the scoring
 * engine's own breakdown JSON) and an Evidence tab (every category-specific
 * cross-reference: AEO analyses, entities, GEO details, structured data,
 * contributing checks).
 */
export default function ScoreBreakdownDialog({
  category,
  audit,
  onClose,
}: {
  category: string | null;
  audit: AuditDetail;
  onClose: () => void;
}) {
  const open = !!category;
  const [tab, setTab] = useState(0);
  const score = audit.scores.find((s) => s.category === category);
  const matchedChecks = category ? matchingSeoChecks(audit.seoChecks, category) : [];

  const pageLabels = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of audit.seoChecks) {
      if (c.pageId && c.page) map[c.pageId] = c.page.title || c.page.url;
    }
    return map;
  }, [audit.seoChecks]);

  useEffect(() => {
    if (open) setTab(0);
  }, [open, category]);

  const hasEvidenceContent =
    category === 'AEO' ||
    category === 'ENTITY_SEMANTIC_CLARITY' ||
    (category === 'CITATION_EVIDENCE_READINESS' && !!audit.geoAnalysis) ||
    category === 'STRUCTURED_DATA' ||
    matchedChecks.length > 0;

  function handleTabChange(_event: SyntheticEvent, value: number) {
    setTab(value);
  }

  const status: ScoreStatus | null = score ? scoreStatus(score.rawScore) : null;
  const StatusIcon = status ? STATUS_ICON[status] : null;
  const statusColor = status && score ? scoreStatusColor(score.rawScore) : undefined;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 0, px: { xs: 2, sm: 3 } }}>
        <Stack direction="row" alignItems="center" gap={1}>
          <Typography variant="h6" component="span" fontWeight={700}>
            {category ? categoryLabel(category) : ''}
          </Typography>
          {status && StatusIcon && (
            <Chip
              size="small"
              icon={<StatusIcon sx={{ fontSize: 16, color: `${statusColor} !important` }} />}
              label={scoreStatusLabel(status)}
              sx={{ bgcolor: `${statusColor}1f`, color: statusColor, fontWeight: 700 }}
            />
          )}
        </Stack>
        <IconButton onClick={onClose} size="small">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      {score && hasEvidenceContent && (
        <Box sx={{ borderBottom: 1, borderColor: 'divider', px: { xs: 1, sm: 3 }, mt: 1 }}>
          <Tabs value={tab} onChange={handleTabChange} variant="fullWidth">
            <Tab label="Summary" id="score-tab-summary" />
            <Tab label="Evidence" id="score-tab-evidence" />
          </Tabs>
        </Box>
      )}

      <DialogContent dividers sx={{ px: { xs: 2, sm: 3 }, minHeight: score && hasEvidenceContent ? 320 : undefined }}>
        {!score ? (
          <Typography color="text.secondary">No score has been computed for this category yet.</Typography>
        ) : (
          <>
            {(tab === 0 || !hasEvidenceContent) && (
              <>
                <Stack direction="row" spacing={{ xs: 1, sm: 1.5 }} mb={2.5}>
                  <StatCard
                    icon={StatusIcon ?? CheckCircleRoundedIcon}
                    label="Raw score"
                    value={`${Math.round(score.rawScore)}/100`}
                    color={statusColor}
                  />
                  <StatCard icon={ScaleRoundedIcon} label="Weight" value={`${(score.weight * 100).toFixed(0)}%`} />
                  <StatCard
                    icon={AddchartRoundedIcon}
                    label="Contribution"
                    value={`+${score.normalizedScore.toFixed(1)}`}
                  />
                </Stack>

                <Typography variant="subtitle2" gutterBottom>
                  How this was calculated
                </Typography>
                <Box>
                  <JsonBreakdown value={score.breakdown} pageLabels={pageLabels} />
                </Box>
              </>
            )}

            {tab === 1 && hasEvidenceContent && (
              <Stack spacing={2.5} divider={<Divider />}>
                {category === 'AEO' && (
                  <Box>
                    <Typography variant="subtitle2" gutterBottom>
                      AEO analyses ({audit.aeoAnalyses.length} page{audit.aeoAnalyses.length === 1 ? '' : 's'})
                    </Typography>
                    {audit.aeoAnalyses.length === 0 ? (
                      <Typography variant="body2" color="text.secondary">
                        No pages have been analyzed for answer engine optimization yet.
                      </Typography>
                    ) : (
                      <Stack spacing={1}>
                        {audit.aeoAnalyses.map((a) => (
                          <Paper key={a.id} variant="outlined" sx={{ p: 1.25, borderRadius: 1.5 }}>
                            <Stack direction="row" justifyContent="space-between" alignItems="center">
                              <Typography variant="body2" fontWeight={600} noWrap sx={{ mr: 1 }}>
                                {a.page?.title || a.page?.url || a.pageId}
                              </Typography>
                              <Chip
                                size="small"
                                label={`${Math.round(a.overallScore)}/100`}
                                color={a.overallScore >= 70 ? 'success' : a.overallScore >= 50 ? 'warning' : 'error'}
                              />
                            </Stack>
                            <Typography variant="caption" color="text.secondary" display="block" mt={0.5}>
                              Question coverage {Math.round(a.questionCoverageScore)} · Answer directness{' '}
                              {Math.round(a.answerDirectnessScore)} · FAQ coverage {Math.round(a.faqCoverageScore)}
                            </Typography>
                          </Paper>
                        ))}
                      </Stack>
                    )}
                  </Box>
                )}

                {category === 'ENTITY_SEMANTIC_CLARITY' && (
                  <Box>
                    <Typography variant="subtitle2" gutterBottom>
                      Entities found ({audit.entities.length})
                    </Typography>
                    {audit.entities.length === 0 ? (
                      <Typography variant="body2" color="text.secondary">
                        No entities identified yet.
                      </Typography>
                    ) : (
                      <Stack direction="row" flexWrap="wrap" gap={0.75}>
                        {audit.entities.map((e) => (
                          <Chip key={e.id} size="small" label={`${e.name} · ${e.type}`} variant="outlined" />
                        ))}
                      </Stack>
                    )}
                    {audit.geoAnalysis && (
                      <Typography variant="body2" color="text.secondary" mt={1.5}>
                        GEO entity clarity score: <strong>{Math.round(audit.geoAnalysis.entityClarityScore)}/100</strong>
                      </Typography>
                    )}
                  </Box>
                )}

                {category === 'CITATION_EVIDENCE_READINESS' && audit.geoAnalysis && (
                  <Box>
                    <Typography variant="subtitle2" gutterBottom>
                      GEO citation readiness details
                    </Typography>
                    <JsonBreakdown value={audit.geoAnalysis.details} pageLabels={pageLabels} />
                  </Box>
                )}

                {category === 'STRUCTURED_DATA' && (
                  <Box>
                    <Typography variant="subtitle2" gutterBottom>
                      Structured data found ({audit.schemaAnalyses.length})
                    </Typography>
                    {audit.schemaAnalyses.length === 0 ? (
                      <Typography variant="body2" color="text.secondary">
                        No JSON-LD / structured data detected yet.
                      </Typography>
                    ) : (
                      <Stack spacing={0.75}>
                        {audit.schemaAnalyses.map((s) => (
                          <Stack
                            key={s.id}
                            direction="row"
                            spacing={1.25}
                            alignItems="center"
                            sx={{ py: 0.5, px: 1, borderRadius: 1, bgcolor: 'action.hover' }}
                          >
                            <Chip
                              size="small"
                              label={s.isValid ? 'Valid' : 'Invalid'}
                              color={s.isValid ? 'success' : 'error'}
                              sx={{ fontWeight: 600 }}
                            />
                            <Typography variant="body2">{s.schemaType}</Typography>
                          </Stack>
                        ))}
                      </Stack>
                    )}
                  </Box>
                )}

                {matchedChecks.length > 0 && (
                  <Box>
                    <Typography variant="subtitle2" gutterBottom>
                      Contributing checks ({matchedChecks.length})
                    </Typography>
                    <Stack spacing={0.75}>
                      {matchedChecks.map((c) => (
                        <Box key={c.id} sx={{ py: 0.75, px: 1, borderRadius: 1, bgcolor: 'action.hover' }}>
                          <Stack direction="row" spacing={1} alignItems="center" mb={0.25}>
                            <Chip
                              size="small"
                              label={c.status.replace(/_/g, ' ')}
                              color={checkStatusColor(c.status)}
                              sx={{ fontWeight: 600 }}
                            />
                            <Typography variant="body2" fontWeight={600} noWrap>
                              {humanize(c.checkId)}
                            </Typography>
                          </Stack>
                          <Typography variant="caption" color="text.secondary">
                            {c.evidence}
                          </Typography>
                        </Box>
                      ))}
                    </Stack>
                  </Box>
                )}
              </Stack>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
