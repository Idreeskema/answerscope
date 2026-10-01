import { useState } from 'react';
import { Box, IconButton, Paper, Skeleton, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material';
import LockRoundedIcon from '@mui/icons-material/LockRounded';
import PublicOffRoundedIcon from '@mui/icons-material/PublicOffRounded';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import { useAuthenticatedImage } from '../../hooks/useAuthenticatedImage';

const TRAFFIC_LIGHT_COLORS = ['#ff5f57', '#febc2e', '#28c840'];
const FRAME_HEIGHT = 480;

/**
 * A desktop-browser-chrome mockup wrapping two ways to see the actual site,
 * not just numbers:
 *  - "Screenshot": the homepage image captured during this audit's crawl
 *    (CrawlerService.captureHomepageScreenshot / GET /audits/:auditId/screenshot)
 *    - always available, reliable, works for every site.
 *  - "Live": the real site embedded in a sandboxed iframe so it can actually
 *    be scrolled/clicked - genuinely interactive, but many sites send
 *    X-Frame-Options/CSP headers that refuse to be framed at all, which we
 *    cannot detect from the parent page (cross-origin), so we show a plain-
 *    language note rather than pretending we can catch that failure.
 * Either way, "Open live site" always works since it's a real navigation,
 * not an embed.
 */
export default function WebsitePreview({
  auditId,
  url,
  domain,
}: {
  auditId: string;
  url: string;
  domain: string;
}) {
  const { src, status } = useAuthenticatedImage(`/audits/${auditId}/screenshot`);
  const [mode, setMode] = useState<'screenshot' | 'live'>('screenshot');

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

        <ToggleButtonGroup
          size="small"
          exclusive
          value={mode}
          onChange={(_e, next) => next && setMode(next)}
          sx={{ bgcolor: 'background.paper', flexShrink: 0 }}
        >
          <ToggleButton value="screenshot" sx={{ px: 1.25, py: 0.25, fontSize: 11 }}>
            Screenshot
          </ToggleButton>
          <ToggleButton value="live" sx={{ px: 1.25, py: 0.25, fontSize: 11 }}>
            Live
          </ToggleButton>
        </ToggleButtonGroup>

        <Tooltip title="Open the real site in a new tab">
          <IconButton
            size="small"
            component="a"
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            sx={{ flexShrink: 0 }}
          >
            <OpenInNewRoundedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      {mode === 'screenshot' && (
        <Box sx={{ bgcolor: 'grey.50', position: 'relative', minHeight: 180 }}>
          {status === 'loading' && <Skeleton variant="rectangular" width="100%" height={320} animation="wave" />}

          {status === 'ready' && src && (
            <Box
              component="img"
              src={src}
              alt={`Homepage screenshot of ${domain}`}
              sx={{ width: '100%', display: 'block', maxHeight: FRAME_HEIGHT, objectFit: 'cover', objectPosition: 'top' }}
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
      )}

      {mode === 'live' && (
        <Box>
          <Box
            component="iframe"
            src={url}
            title={`Live preview of ${domain}`}
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
            sx={{ width: '100%', height: FRAME_HEIGHT, border: 0, display: 'block', bgcolor: '#fff' }}
          />
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', px: 1.5, py: 1 }}>
            Scroll and click around - this is the real, live site. If this area looks blank, the site has
            disabled embedding; use the open-in-new-tab icon above instead.
          </Typography>
        </Box>
      )}
    </Paper>
  );
}
