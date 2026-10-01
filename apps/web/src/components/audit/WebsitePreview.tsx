import { Box, IconButton, Paper, Tooltip, Typography } from '@mui/material';
import LockRoundedIcon from '@mui/icons-material/LockRounded';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';

const TRAFFIC_LIGHT_COLORS = ['#ff5f57', '#febc2e', '#28c840'];
const FRAME_HEIGHT = 480;

/**
 * A desktop-browser-chrome mockup embedding the real site live, in a
 * sandboxed iframe, so it can actually be scrolled/clicked rather than just
 * looked at (sandbox deliberately omits allow-top-navigation, so a framed
 * page can never redirect the whole dashboard away). The open-in-new-tab
 * icon always navigates to the real site regardless of whether the target
 * allows embedding.
 */
export default function WebsitePreview({ url, domain }: { url: string; domain: string }) {
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

      <Box
        component="iframe"
        src={url}
        title={`Live preview of ${domain}`}
        sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
        sx={{ width: '100%', height: FRAME_HEIGHT, border: 0, display: 'block', bgcolor: '#fff' }}
      />
    </Paper>
  );
}
