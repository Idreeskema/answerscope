import { useState } from 'react';
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
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded';
import TrendingDownRoundedIcon from '@mui/icons-material/TrendingDownRounded';
import DescriptionRoundedIcon from '@mui/icons-material/DescriptionRounded';
import ReportProblemRoundedIcon from '@mui/icons-material/ReportProblemRounded';
import BoltRoundedIcon from '@mui/icons-material/BoltRounded';
import HelpOutlineRoundedIcon from '@mui/icons-material/HelpOutlineRounded';
import type { AuditDetail } from '../../types/audit';
import { categoryLabel, scoreStatusColor, severityColor } from '../../utils/auditFormatting';
import CategoryScoresChart from './CategoryScoresChart';
import ScoreBreakdownDialog from './ScoreBreakdownDialog';
import ScoreGauge from './ScoreGauge';
import StatTile from './StatTile';
import WebsitePreview from './WebsitePreview';
import type { IssueSource } from './IssueDetailDialog';

/**
 * Spec section 27's four questions, section 15's dashboard example, in one
 * tab: How ready (hero gauge) / Why (derived from category scores) / What am
 * I missing (gap counts from real rows) / What should I do (top
 * recommendations by priority) - plus a live view of the actual site.
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

  const criticalIssueCount = audit.seoChecks.filter(
    (c) => c.status === 'FAIL' && c.severity === 'CRITICAL',
  ).length;
  const quickWinCount = audit.recommendations.filter((r) => r.effort <= 2).length;
  const pagesCrawled = audit.crawlJob?.pagesCrawled ?? 0;

  const topRecommendations = audit.recommendations.slice(0, 6);

  return (
    <Box>
      <Grid container spacing={2}>
        {/* Hero: overall score gauge + at-a-glance stats */}
        <Grid item xs={12}>
          <Card variant="outlined" sx={{ borderRadius: 3 }}>
            <CardContent>
              <Grid container spacing={3} alignItems="center">
                <Grid item xs={12} sm="auto">
                  <ScoreGauge value={audit.overallScore} />
                </Grid>
                <Grid item xs={12} sm>
                  <Grid container spacing={1.5}>
                    <Grid item xs={6} md={3}>
                      <StatTile icon={DescriptionRoundedIcon} label="Pages crawled" value={pagesCrawled} />
                    </Grid>
                    <Grid item xs={6} md={3}>
                      <StatTile
                        icon={ReportProblemRoundedIcon}
                        label="Critical issues"
                        value={criticalIssueCount}
                        accentColor={criticalIssueCount > 0 ? '#d03b3b' : undefined}
                      />
                    </Grid>
                    <Grid item xs={6} md={3}>
                      <StatTile
                        icon={BoltRoundedIcon}
                        label="Quick wins available"
                        value={quickWinCount}
                        accentColor={quickWinCount > 0 ? '#0ca30c' : undefined}
                      />
                    </Grid>
                    <Grid item xs={6} md={3}>
                      <StatTile
                        icon={HelpOutlineRoundedIcon}
                        label="Unanswered questions"
                        value={notAnsweredQuestions}
                        accentColor={notAnsweredQuestions > 0 ? '#fab219' : undefined}
                      />
                    </Grid>
                  </Grid>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* The actual live site */}
        <Grid item xs={12}>
          <WebsitePreview url={audit.website.url} domain={audit.website.domain} />
        </Grid>

        <Grid item xs={12} md={7}>
          <Card variant="outlined" sx={{ borderRadius: 3 }}>
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
            <Card variant="outlined" sx={{ borderRadius: 3 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Why?
                </Typography>
                {categoryScores.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    Scores have not been computed yet.
                  </Typography>
                ) : (
                  <Stack spacing={1}>
                    {strong.map((s) => (
                      <Stack key={s.category} direction="row" alignItems="center" gap={1}>
                        <TrendingUpRoundedIcon sx={{ fontSize: 18, color: scoreStatusColor(s.rawScore) }} />
                        <Typography variant="body2">
                          {categoryLabel(s.category)} is strong ({Math.round(s.rawScore)}/100).
                        </Typography>
                      </Stack>
                    ))}
                    {weak.map((s) => (
                      <Stack key={s.category} direction="row" alignItems="center" gap={1}>
                        <TrendingDownRoundedIcon sx={{ fontSize: 18, color: scoreStatusColor(s.rawScore) }} />
                        <Typography variant="body2">
                          {categoryLabel(s.category)} is weak ({Math.round(s.rawScore)}/100).
                        </Typography>
                      </Stack>
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

            <Card variant="outlined" sx={{ borderRadius: 3 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  What am I missing?
                </Typography>
                <Stack spacing={0.75}>
                  {missingItems.map((item) => (
                    <Stack key={item.label} direction="row" spacing={1} alignItems="baseline">
                      <Typography
                        variant="body2"
                        fontWeight={800}
                        sx={{ minWidth: 20, color: item.count > 0 ? 'text.primary' : 'text.disabled' }}
                      >
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
          <Card variant="outlined" sx={{ borderRadius: 3 }}>
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
                    <Box key={rec.id}>
                      {idx > 0 && <Divider component="li" sx={{ listStyle: 'none' }} />}
                      <ListItemButton
                        onClick={() => onOpenIssue({ kind: 'recommendation', recommendation: rec })}
                        sx={{ borderRadius: 1.5, py: 1.25 }}
                      >
                        <Box
                          sx={{
                            width: 28,
                            height: 28,
                            borderRadius: '50%',
                            bgcolor: 'primary.main',
                            color: 'primary.contrastText',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 700,
                            fontSize: 13,
                            flexShrink: 0,
                            mr: 1.5,
                          }}
                        >
                          {idx + 1}
                        </Box>
                        <ListItemText
                          primary={rec.title}
                          secondary={rec.affectedUrl ?? categoryLabel(rec.category)}
                        />
                        <Chip size="small" label={rec.severity} color={severityColor(rec.severity)} />
                      </ListItemButton>
                    </Box>
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
