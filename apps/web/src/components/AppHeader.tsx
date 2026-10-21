import { useState } from 'react';
import {
  AppBar,
  Avatar,
  Box,
  Button,
  Divider,
  IconButton,
  ListItemIcon,
  Menu,
  MenuItem,
  Stack,
  Toolbar,
  Typography,
} from '@mui/material';
import ArrowBackIosNewRoundedIcon from '@mui/icons-material/ArrowBackIosNewRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import TravelExploreRoundedIcon from '@mui/icons-material/TravelExploreRounded';
import { useAuth } from '../auth/AuthContext';

/**
 * Shared top bar. Sits below the iOS status bar / notch (safe-area inset),
 * stays pinned while scrolling, and collapses the email + sign-out into an
 * avatar menu on phones so nothing overlaps or wraps.
 */
export default function AppHeader({ onBack, backLabel }: { onBack?: () => void; backLabel?: string }) {
  const { user, logout } = useAuth();
  const [anchor, setAnchor] = useState<null | HTMLElement>(null);
  const initial = (user?.email ?? '?').charAt(0).toUpperCase();

  return (
    <AppBar
      position="sticky"
      elevation={0}
      sx={{
        bgcolor: 'rgba(255,255,255,0.86)',
        backdropFilter: 'saturate(180%) blur(14px)',
        color: 'text.primary',
        borderBottom: 1,
        borderColor: 'divider',
        pt: 'env(safe-area-inset-top)',
      }}
    >
      <Toolbar sx={{ gap: 1, minHeight: { xs: 56, sm: 64 }, px: { xs: 1.5, sm: 3 } }}>
        {onBack && (
          <IconButton edge="start" onClick={onBack} aria-label={backLabel ?? 'Back'} size="small" sx={{ mr: 0.5 }}>
            <ArrowBackIosNewRoundedIcon fontSize="small" />
          </IconButton>
        )}
        <Box
          sx={{
            width: 32,
            height: 32,
            borderRadius: 1.5,
            display: 'grid',
            placeItems: 'center',
            color: '#fff',
            background: 'linear-gradient(135deg,#2148C0,#0EA5A5)',
            flexShrink: 0,
          }}
        >
          <TravelExploreRoundedIcon sx={{ fontSize: 20 }} />
        </Box>
        <Stack sx={{ flexGrow: 1, minWidth: 0 }}>
          <Typography variant="subtitle1" fontWeight={800} noWrap sx={{ lineHeight: 1.2 }}>
            AnswerScope
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap sx={{ fontSize: 10.5, lineHeight: 1.1 }}>
            Powered by Expentor
          </Typography>
        </Stack>

        <Typography
          variant="body2"
          color="text.secondary"
          noWrap
          sx={{ display: { xs: 'none', sm: 'block' }, maxWidth: 240 }}
        >
          {user?.email}
        </Typography>
        <Button onClick={logout} size="small" sx={{ display: { xs: 'none', sm: 'inline-flex' } }}>
          Sign out
        </Button>

        <IconButton
          onClick={(e) => setAnchor(e.currentTarget)}
          sx={{ display: { xs: 'inline-flex', sm: 'none' }, p: 0.5 }}
          aria-label="Account"
        >
          <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main', fontSize: 15, fontWeight: 700 }}>{initial}</Avatar>
        </IconButton>
        <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
          <Box px={2} py={1}>
            <Typography variant="caption" color="text.secondary">
              Signed in as
            </Typography>
            <Typography variant="body2" fontWeight={600}>
              {user?.email}
            </Typography>
          </Box>
          <Divider />
          <MenuItem
            onClick={() => {
              setAnchor(null);
              logout();
            }}
          >
            <ListItemIcon>
              <LogoutRoundedIcon fontSize="small" />
            </ListItemIcon>
            Sign out
          </MenuItem>
        </Menu>
      </Toolbar>
    </AppBar>
  );
}
