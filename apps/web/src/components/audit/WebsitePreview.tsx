import { Box, Paper, Skeleton, Typography } from '@mui/material';
import LockRoundedIcon from '@mui/icons-material/LockRounded';
import PublicOffRoundedIcon from '@mui/icons-material/PublicOffRounded';
import { useAuthenticatedImage } from '../../hooks/useAuthenticatedImage';

const TRAFFIC_LIGHT_COLORS = ['#ff5f57', '#febc2e', '#28c840'];

/**
 * A desktop-browser-chrome mockup around the homepage screenshot captured
 * during this audit's crawl (CrawlerService.captureHomepageScreenshot /
 * GET /audits/:auditId/screenshot) - gives the dashboard a concrete "this is
 * the site we analyzed" visual instead of only charts and numbers. Degrades
 * to a clear placeholder when no screenshot exists yet (older audits, or a
 * crawl where Chromium wasn't available/the capture failed) rather than a
 * broken image icon.
 */
export default function WebsitePreview({ auditId, domain }: { auditId: string; domain: string }) {
  const { src, status } = useAuthenticatedImage(`/audits/${auditId}/screenshot`);

  return (
    <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 1.5,
          py: 1,
          bgcolor: 'grey.100',
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <Box sx={{ display: 'flex', gap: 0.7, flexShrink: 0 }}>
          {TRAFFIC_LIGHT_COLORS.map((color) => (
            <Box key={color} sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: color }} />
          ))}
        </Box>
        <Box
          sx={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            bgcolor: 'background.paper',
            borderRadius: 5,
            px: 1.5,
            py: 0.5,
            minWidth: 0,
          }}
        >
          <LockRoundedIcon sx={{ fontSize: 13 }} color="action" />
          <Typography variant="caption" color="text.secondary" noWrap>
            {domain}
          </Typography>
        </Box>
      </Box>

      <Box sx={{ bgcolor: 'grey.50', position: 'relative', minHeight: 180 }}>
        {status === 'loading' && <Skeleton variant="rectangular" width="100%" height={320} animation="wave" />}

        {status === 'ready' && src && (
          <Box
            component="img"
            src={src}
            alt={`Homepage screenshot of ${domain}`}
            sx={{ width: '100%', display: 'block', maxHeight: 480, objectFit: 'cover', objectPosition: 'top' }}
          />
        )}

        {status === 'unavailable' && (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 1,
              py: 6,
              color: 'text.secondary',
            }}
          >
            <PublicOffRoundedIcon fontSize="large" />
            <Typography variant="body2">No preview captured for this audit.</Typography>
          </Box>
        )}
      </Box>
    </Paper>
  );
}
