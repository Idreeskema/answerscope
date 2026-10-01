import { Box, Paper, Typography } from '@mui/material';
import type { SvgIconComponent } from '@mui/icons-material';

/** A compact at-a-glance metric tile (icon + big number + label). */
export default function StatTile({
  icon: Icon,
  label,
  value,
  accentColor,
}: {
  icon: SvgIconComponent;
  label: string;
  value: string | number;
  accentColor?: string;
}) {
  return (
    <Paper
      variant="outlined"
      sx={{ p: 2, borderRadius: 2, display: 'flex', alignItems: 'center', gap: 1.5, height: '100%' }}
    >
      <Box
        sx={{
          width: 40,
          height: 40,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: accentColor ? `${accentColor}1f` : 'action.hover',
          color: accentColor ?? 'text.secondary',
          flexShrink: 0,
        }}
      >
        <Icon fontSize="small" />
      </Box>
      <Box minWidth={0}>
        <Typography variant="h6" fontWeight={800} lineHeight={1.2} noWrap>
          {value}
        </Typography>
        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
          {label}
        </Typography>
      </Box>
    </Paper>
  );
}
