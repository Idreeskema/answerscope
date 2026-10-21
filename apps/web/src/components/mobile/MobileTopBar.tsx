import { Box, IconButton, Typography } from '@mui/material';
import ArrowBackIosNewRoundedIcon from '@mui/icons-material/ArrowBackIosNewRounded';

/**
 * Compact iOS navigation bar for drill-in screens: back chevron on the
 * left, centered title, sits below the status bar / notch.
 */
export default function MobileTopBar({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <Box
      sx={{
        position: 'sticky',
        top: 0,
        zIndex: (t) => t.zIndex.appBar,
        pt: 'env(safe-area-inset-top)',
        bgcolor: 'rgba(246,247,251,0.9)',
        backdropFilter: 'saturate(180%) blur(16px)',
        borderBottom: 1,
        borderColor: 'divider',
      }}
    >
      <Box sx={{ display: 'grid', gridTemplateColumns: '48px 1fr 48px', alignItems: 'center', height: 48 }}>
        <IconButton onClick={onBack} aria-label="Back to websites" sx={{ ml: 0.5, width: 44, height: 44 }}>
          <ArrowBackIosNewRoundedIcon fontSize="small" color="primary" />
        </IconButton>
        <Typography variant="subtitle1" fontWeight={700} align="center" noWrap>
          {title}
        </Typography>
        <span />
      </Box>
    </Box>
  );
}
