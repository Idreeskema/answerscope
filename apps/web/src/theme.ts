import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#2148C0' },
    secondary: { main: '#0EA5A5' },
    background: { default: '#F6F7FB' },
  },
  shape: { borderRadius: 10 },
  typography: {
    fontFamily: '"Inter", "Segoe UI", Roboto, sans-serif',
    button: { textTransform: 'none', fontWeight: 600 },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        html: { WebkitTextSizeAdjust: '100%' },
        body: { WebkitTapHighlightColor: 'transparent', overscrollBehaviorY: 'none' },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: { root: { borderRadius: 10 }, sizeMedium: { minHeight: 40 } },
    },
    MuiCard: {
      styleOverrides: {
        root: { borderRadius: 16, border: '1px solid rgba(15,23,42,0.08)', boxShadow: '0 1px 2px rgba(15,23,42,0.04)' },
      },
    },
    MuiDialog: {
      styleOverrides: { paper: { borderRadius: 16, margin: 16, width: 'calc(100% - 32px)', maxHeight: 'calc(100% - 32px)' } },
    },
  },
});
