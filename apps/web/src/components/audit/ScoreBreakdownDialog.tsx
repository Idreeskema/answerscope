import { useEffect, useState, type SyntheticEvent } from 'react';
import {
  Box,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Stack,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import type { AuditDetail, SEOCheckRow } from '../../types/audit';
import { categoryLabel, checkStatusColor, normalizeKey } from '../../utils/auditFormatting';
import JsonBreakdown from './JsonBreakdown';

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

/**
 * "How was this calculated" drill-down (spec section 15). Split into a
 * Summary tab (the raw/weight/contribution numbers plus the scoring
 * engine's own breakdown JSON) and an Evidence tab (every category-specific
 * cross-reference: AEO analyses, entities, GEO details, structured data,
 * contributing checks) - these used to all stack in one long scroll, which
 * got unreadable for categories with several sections at once.
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

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 0 }}>
        {category ? categoryLabel(category) : ''}
        <IconButton onClick={onClose} size="small">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      {score && hasEvidenceContent && (
        <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 3 }}>
          <Tabs value={tab} onChange={handleTabChange} variant="fullWidth">
            <Tab label="Summary" id="score-tab-summary" />
            <Tab label="Evidence" id="score-tab-evidence" />
          </Tabs>
        </Box>
      )}

      <DialogContent dividers sx={{ minHeight: score && hasEvidenceContent ? 320 : undefined }}>
        {!score ? (
          <Typography color="text.secondary">No score has been computed for this category yet.</Typography>
        ) : (
          <>
            {(tab === 0 || !hasEvidenceContent) && (
              <>
                <Stack direction="row" spacing={3} mb={2}>
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Raw score
                    </Typography>
                    <Typography variant="h5" fontWeight={700}>
                      {Math.round(score.rawScore)}/100
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Weight in overall score
                    </Typography>
                    <Typography variant="h5" fontWeight={700}>
                      {(score.weight * 100).toFixed(0)}%
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Contribution to overall
                    </Typography>
                    <Typography variant="h5" fontWeight={700}>
                      +{score.normalizedScore.toFixed(1)}
                    </Typography>
                  </Box>
                </Stack>

                <Typography variant="subtitle2" gutterBottom>
                  How this was calculated
                </Typography>
                <Box>
                  <JsonBreakdown value={score.breakdown} />
                </Box>
              </>
            )}

            {tab === 1 && hasEvidenceContent && (
              <Stack spacing={2}>
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
                      audit.aeoAnalyses.map((a) => (
                        <Box key={a.id} mb={1.5}>
                          <Typography variant="body2" fontWeight={600}>
                            {a.page?.url ?? a.pageId} — overall {Math.round(a.overallScore)}/100
                          </Typography>
                          <Typography variant="caption" color="text.secondary" display="block">
                            Question coverage {Math.round(a.questionCoverageScore)} · Answer directness{' '}
                            {Math.round(a.answerDirectnessScore)} · FAQ coverage {Math.round(a.faqCoverageScore)}
                          </Typography>
                        </Box>
                      ))
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
                      <Stack direction="row" flexWrap="wrap" gap={0.5}>
                        {audit.entities.map((e) => (
                          <Chip key={e.id} size="small" label={`${e.name} (${e.type})`} variant="outlined" />
                        ))}
                      </Stack>
                    )}
                    {audit.geoAnalysis && (
                      <Typography variant="body2" color="text.secondary" mt={1}>
                        GEO entity clarity score: {Math.round(audit.geoAnalysis.entityClarityScore)}/100
                      </Typography>
                    )}
                  </Box>
                )}

                {category === 'CITATION_EVIDENCE_READINESS' && audit.geoAnalysis && (
                  <Box>
                    <Typography variant="subtitle2" gutterBottom>
                      GEO citation readiness details
                    </Typography>
                    <JsonBreakdown value={audit.geoAnalysis.details} />
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
                      audit.schemaAnalyses.map((s) => (
                        <Stack key={s.id} direction="row" spacing={1} alignItems="center" mb={0.5}>
                          <Chip
                            size="small"
                            label={s.isValid ? 'Valid' : 'Invalid'}
                            color={s.isValid ? 'success' : 'error'}
                          />
                          <Typography variant="body2">{s.schemaType}</Typography>
                        </Stack>
                      ))
                    )}
                  </Box>
                )}

                {matchedChecks.length > 0 && (
                  <Box>
                    {category === 'STRUCTURED_DATA' && <Divider sx={{ mb: 2 }} />}
                    <Typography variant="subtitle2" gutterBottom>
                      Contributing checks ({matchedChecks.length})
                    </Typography>
                    {matchedChecks.map((c) => (
                      <Box key={c.id} mb={1}>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Chip size="small" label={c.status} color={checkStatusColor(c.status)} />
                          <Typography variant="body2" fontWeight={600}>
                            {c.checkId}
                          </Typography>
                        </Stack>
                        <Typography variant="caption" color="text.secondary">
                          {c.evidence}
                        </Typography>
                      </Box>
                    ))}
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
