import type { ReactNode } from 'react';
import { BottomNavigation, BottomNavigationAction, Paper } from '@mui/material';

export interface MobileTab {
  label: string;
  icon: ReactNode;
}

/** Height of the bar itself, excluding the home-indicator safe area. */
export const MOBILE_TAB_BAR_HEIGHT = 60;

/**
 * Fixed iOS-style tab bar: frosted background, icon + label on every item
 * (never icon-only), the active item highlighted in the brand color, and
 * padding for the home indicator so nothing sits under the gesture bar.
 */
export default function MobileTabBar({
  tabs,
  value,
  onChange,
}: {
  tabs: MobileTab[];
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <Paper
      elevation={0}
      sx={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: (t) => t.zIndex.appBar,
        borderTop: 1,
        borderColor: 'divider',
        borderRadius: 0,
        bgcolor: 'rgba(255,255,255,0.9)',
        backdropFilter: 'saturate(180%) blur(16px)',
        pb: 'env(safe-area-inset-bottom)',
      }}
    >
      <BottomNavigation
        showLabels
        value={value}
        onChange={(_, v) => onChange(v)}
        sx={{
          height: MOBILE_TAB_BAR_HEIGHT,
          bgcolor: 'transparent',
          '& .MuiBottomNavigationAction-root': {
            minWidth: 0,
            px: 0.5,
            color: 'text.secondary',
            transition: 'color 150ms ease-out',
            '&:active': { opacity: 0.6 },
            '&.Mui-selected': { color: 'primary.main' },
          },
          '& .MuiBottomNavigationAction-label': { fontSize: 11, fontWeight: 600, mt: 0.25 },
          '& .MuiBottomNavigationAction-label.Mui-selected': { fontSize: 11 },
        }}
      >
        {tabs.map((tab) => (
          <BottomNavigationAction key={tab.label} label={tab.label} icon={tab.icon} />
        ))}
      </BottomNavigation>
    </Paper>
  );
}
