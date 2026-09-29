import { useMemo } from 'react';
import { Bar } from 'react-chartjs-2';
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  LinearScale,
  Tooltip,
  type ChartEvent,
  type ActiveElement,
} from 'chart.js';
import { Box, List, ListItemButton, ListItemText, Typography, useTheme } from '@mui/material';
import type { ScoreRow } from '../../types/audit';
import { categoryLabel } from '../../utils/auditFormatting';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

/**
 * Category score bars (spec section 15). Deliberately a single series (the
 * "score" measure per category) so every bar uses one color - see
 * dataviz skill anti-patterns ("a value-ramp on nominal categories" /
 * "rainbow bars for one series" are both listed as mistakes to avoid).
 * The list beneath doubles as the accessible/table-view twin: every value is
 * reachable and clickable without relying on canvas hover.
 */
export default function CategoryScoresChart({
  scores,
  onSelectCategory,
}: {
  scores: ScoreRow[];
  onSelectCategory: (category: string) => void;
}) {
  const theme = useTheme();
  const displayScores = useMemo(
    () => scores.filter((s) => s.category !== 'OVERALL').sort((a, b) => b.rawScore - a.rawScore),
    [scores],
  );

  const primary = theme.palette.primary.main;

  const data = useMemo(
    () => ({
      labels: displayScores.map((s) => categoryLabel(s.category)),
      datasets: [
        {
          label: 'Score',
          data: displayScores.map((s) => Math.round(s.rawScore)),
          backgroundColor: primary,
          borderRadius: 4,
          barThickness: 22,
        },
      ],
    }),
    [displayScores, primary],
  );

  if (displayScores.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        Category scores are not available for this audit yet.
      </Typography>
    );
  }

  const handleClick = (_event: ChartEvent, elements: ActiveElement[]) => {
    if (elements.length === 0) return;
    const idx = elements[0].index;
    const category = displayScores[idx]?.category;
    if (category) onSelectCategory(category);
  };

  return (
    <Box display="flex" flexDirection="column" gap={2}>
      <Box sx={{ height: Math.max(180, displayScores.length * 42) }}>
        <Bar
          data={data}
          options={{
            indexAxis: 'y' as const,
            maintainAspectRatio: false,
            onClick: handleClick,
            onHover: (event, elements) => {
              const target = event.native?.target as HTMLElement | undefined;
              if (target) target.style.cursor = elements.length ? 'pointer' : 'default';
            },
            scales: {
              x: {
                min: 0,
                max: 100,
                grid: { color: theme.palette.divider },
                border: { display: false },
                ticks: { stepSize: 25 },
              },
              y: {
                grid: { display: false },
                border: { display: false },
              },
            },
            plugins: {
              tooltip: {
                callbacks: {
                  label: (ctx) => `${ctx.raw}/100`,
                },
              },
            },
          }}
        />
      </Box>
      <List dense disablePadding sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 0.5 }}>
        {displayScores.map((s) => (
          <ListItemButton
            key={s.category}
            onClick={() => onSelectCategory(s.category)}
            sx={{ borderRadius: 1, border: 1, borderColor: 'divider' }}
          >
            <ListItemText
              primary={categoryLabel(s.category)}
              secondary={`Weight ${(s.weight * 100).toFixed(0)}% of overall`}
            />
            <Typography variant="h6" fontWeight={700}>
              {Math.round(s.rawScore)}
            </Typography>
          </ListItemButton>
        ))}
      </List>
    </Box>
  );
}
