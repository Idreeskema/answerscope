import { useMediaQuery, useTheme } from '@mui/material';
import { Capacitor } from '@capacitor/core';

/**
 * True inside the iOS/Android app shell, or on any phone-sized browser
 * window. Screens use it to swap the desktop dashboard for the
 * mobile-first one (bottom tab bar, hero card, large touch targets).
 */
export function useMobileLayout(): boolean {
  const theme = useTheme();
  const narrow = useMediaQuery(theme.breakpoints.down('sm'));
  return Capacitor.isNativePlatform() || narrow;
}
