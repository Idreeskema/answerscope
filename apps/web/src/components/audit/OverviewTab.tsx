import { useState } from 'react';
import { Box, Card, CardContent, Chip, Grid, List, ListItemButton, ListItemText, Stack, Typography } from '@mui/material';
import type { AuditDetail } from '../../types/audit';
import { categoryLabel, severityColor } from '../../utils/auditFormatting';
import CategoryScoresChart from './CategoryScoresChart';
import ScoreBreakdownDialog from './ScoreBreakdownDialog';
import type { IssueSource } from './IssueDetailDialog';

/**
 * Spec section 27's four questions, section 15's dashboard example, in one
 * tab: How ready (header, rendered by the parent page) / Why (derived from
 * category scores) / What am I missing (gap counts from real rows) / What
 * should I do (top recommendations by priority).
 */
export default function OverviewTab({
  audit,
  onOpenIssue,
}: {
  audit: AuditDetail;
  onOpenIssue: (source: IssueSource) => void;
}) {
  const [drillCategory, setDrillCategory] = useState<string | null>(null);

  const categoryScores = audit.scores.filter((s) => s.category !== 'OVERALL');
  const strong = categoryScores.filter((s) => s.rawScore >= 70).sort((a, b) => b.rawScore - a.rawScore);
  const weak = categoryScores.filter((s) => s.rawScore < 50).sort((a, b) => a.rawScore - b.rawScore);

  const notAnsweredQuestions = audit.aeoAnalyses.reduce(
    (sum, a) => sum + (a.details?.questions?.filter((q) => q.status !== 'DIRECTLY_ANSWERED').length ?? 0),
    0,
  );
  const invalidSchema = audit.schemaAnalyses.filter((s) => !s.isValid).length;
  const internalLinkGaps = audit.seoChecks.filter(
    (c) => c.category.toUpperCase().includes('LINK') && c.status === 'FAIL',
  ).length;
  const competitorGapCount = audit.competitorAnalyses.reduce(
    (sum, c) => sum + (Array.isArray(c.gaps) ? c.gaps.length : 0),
    0,
  );
  const thinContentPages = audit.contentAnalyses.filter((c) => c.thinContent).length;

  const missingItems = [
    { label: 'customer questions not directly answered', count: notAnsweredQuestions },
    { label: 'internal linking issues on important pages', count: internalLinkGaps },
    { label: 'structured-data opportunities (missing/invalid schema)', count: invalidSchema },
    { label: 'thin-content pages', count: thinContentPages },
    { label: 'competitor gaps identified', count: competitorGapCount },
  ];

  const topRecommendations = audit.recommendations.slice(0, 6);

  return (
    <Box>
      <Grid container spacing={2}>
        <Grid item xs={12} md={7}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Category scores
              </Typography>
              <Typography variant="body2" color="text.secondary" mb={2}>
                Click a category to see exactly how it was calculated.
              </Typography>
              <CategoryScoresChart scores={audit.scores} onSelectCategory={setDrillCategory} />
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={5}>
          <Stack spacing={2}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Why?
                </Typography>
                {categoryScores.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    Scores have not been computed yet.
                  </Typography>
                ) : (
                  <Stack spacing={0.5}>
                    {strong.map((s) => (
                      <Typography variant="body2" key={s.category}>
                        {categoryLabel(s.category)} is strong ({Math.round(s.rawScore)}/100).
                      </Typography>
                    ))}
                    {weak.map((s) => (
                      <Typography variant="body2" key={s.category}>
                        {categoryLabel(s.category)} is weak ({Math.round(s.rawScore)}/100).
                      </Typography>
                    ))}
                    {strong.length === 0 && weak.length === 0 && (
                      <Typography variant="body2" color="text.secondary">
                        No category is clearly strong or weak yet - scores are in the middle range.
                      </Typography>
                    )}
                  </Stack>
                )}
              </CardContent>
            </Card>

            <Card variant="outlined">
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  What am I missing?
                </Typography>
                <Stack spacing={0.75}>
                  {missingItems.map((item) => (
                    <Stack key={item.label} direction="row" spacing={1} alignItems="baseline">
                      <Typography variant="body2" fontWeight={700}>
                        {item.count}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {item.label}
                      </Typography>
                    </Stack>
                  ))}
                </Stack>
              </CardContent>
            </Card>
          </Stack>
        </Grid>

        <Grid item xs={12}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="h6" gutterBottom>
                What should I fix first?
              </Typography>
              {topRecommendations.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No recommendations have been generated for this audit yet.
                </Typography>
              ) : (
                <List disablePadding>
                  {topRecommendations.map((rec, idx) => (
                    <ListItemButton
                      key={rec.id}
                      onClick={() => onOpenIssue({ kind: 'recommendation', recommendation: rec })}
                      sx={{ borderRadius: 1, mb: 0.5 }}
                    >
                      <Typography variant="body1" fontWeight={700} sx={{ minWidth: 28 }}>
                        {idx + 1}.
                      </Typography>
                      <ListItemText
                        primary={rec.title}
                        secondary={rec.affectedUrl ?? categoryLabel(rec.category)}
                      />
                      <Chip size="small" label={rec.severity} color={severityColor(rec.severity)} />
                    </ListItemButton>
                  ))}
                </List>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <ScoreBreakdownDialog category={drillCategory} audit={audit} onClose={() => setDrillCategory(null)} />
    </Box>
  );
}
