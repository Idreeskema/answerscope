import type { ReactNode } from 'react';
import { Box, Stack, Typography, useTheme } from '@mui/material';
import TravelExploreRoundedIcon from '@mui/icons-material/TravelExploreRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';

const FEATURES = [
  'Crawl & analyze any website automatically',
  'Explainable AEO & GEO scoring, not a bare number',
  'AI-assisted, human-reviewed fix suggestions',
];

/**
 * Shared split-screen shell for the login/register pages: a branded panel
 * on the left (hidden on small screens) and the actual auth form on the
 * right, so both pages look and feel like one cohesive product entry point
 * instead of a bare form on a blank background.
 */
export default function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  const theme = useTheme();

  return (
    <Box display="flex" minHeight="100vh" bgcolor="background.default">
      <Box
        sx={{
          display: { xs: 'none', md: 'flex' },
          flexDirection: 'column',
          justifyContent: 'center',
          position: 'relative',
          overflow: 'hidden',
          width: { md: '42%', lg: '38%' },
          px: 6,
          py: 8,
          color: '#fff',
          background: `linear-gradient(155deg, ${theme.palette.primary.main} 0%, #16307A 60%, #0B1B4A 100%)`,
        }}
      >
        <Box
          sx={{
            position: 'absolute',
            width: 420,
            height: 420,
            borderRadius: '50%',
            top: -140,
            right: -140,
            background: `radial-gradient(circle, ${theme.palette.secondary.main}55 0%, transparent 70%)`,
          }}
        />
        <Box
          sx={{
            position: 'absolute',
            width: 320,
            height: 320,
            borderRadius: '50%',
            bottom: -120,
            left: -100,
            background: 'radial-gradient(circle, #ffffff22 0%, transparent 70%)',
          }}
        />

        <Box sx={{ position: 'relative', zIndex: 1 }}>
          <Stack direction="row" alignItems="center" gap={1.5} mb={4}>
            <TravelExploreRoundedIcon sx={{ fontSize: 36 }} />
            <Typography variant="h6" fontWeight={700}>
              AI Search Readiness
            </Typography>
          </Stack>

          <Typography variant="h3" fontWeight={800} lineHeight={1.15} mb={2}>
            Be understood by search engines and AI alike.
          </Typography>
          <Typography variant="body1" sx={{ opacity: 0.85, mb: 5 }}>
            Find out how well your website can be understood, retrieved, and
            represented by modern search and generative AI systems - then get
            an actionable plan to improve it.
          </Typography>

          <Stack spacing={2}>
            {FEATURES.map((feature) => (
              <Stack key={feature} direction="row" alignItems="flex-start" gap={1.5}>
                <CheckCircleRoundedIcon sx={{ color: theme.palette.secondary.light ?? theme.palette.secondary.main, mt: 0.2 }} fontSize="small" />
                <Typography variant="body2" sx={{ opacity: 0.9 }}>
                  {feature}
                </Typography>
              </Stack>
            ))}
          </Stack>
        </Box>
      </Box>

      <Box flex={1} display="flex" flexDirection="column" justifyContent="center" alignItems="center" px={3} py={6}>
        <Box width="100%" maxWidth={400}>
          <Stack direction="row" alignItems="center" gap={1} mb={1} sx={{ display: { xs: 'flex', md: 'none' } }}>
            <TravelExploreRoundedIcon color="primary" />
            <Typography variant="subtitle1" fontWeight={700} color="primary">
              AI Search Readiness
            </Typography>
          </Stack>

          <Typography variant="h4" fontWeight={800} gutterBottom>
            {title}
          </Typography>
          <Typography variant="body2" color="text.secondary" mb={4}>
            {subtitle}
          </Typography>

          {children}
        </Box>
      </Box>
    </Box>
  );
}
