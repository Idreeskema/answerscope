import { useState } from 'react';
import {
  Avatar,
  Box,
  Button,
  ButtonBase,
  CircularProgress,
  Fab,
  Stack,
  Typography,
} from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import LanguageRoundedIcon from '@mui/icons-material/LanguageRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import PublicRoundedIcon from '@mui/icons-material/PublicRounded';
import PersonRoundedIcon from '@mui/icons-material/PersonRounded';
import MobileTabBar, { MOBILE_TAB_BAR_HEIGHT } from './MobileTabBar';

interface SiteLike {
  id: string;
  url: string;
  name: string | null;
  domain: string;
}

/**
 * Mobile home: large iOS-style title, tappable website cards, floating
 * add button, and a bottom tab bar (Websites / Account).
 */
export default function MobileHome({
  email,
  websites,
  isLoading,
  onOpenSite,
  onAdd,
  onLogout,
}: {
  email?: string;
  websites?: SiteLike[];
  isLoading: boolean;
  onOpenSite: (id: string) => void;
  onAdd: () => void;
  onLogout: () => void;
}) {
  const [tab, setTab] = useState(0);
  const initial = (email ?? '?').charAt(0).toUpperCase();

  return (
    <Box
      bgcolor="background.default"
      minHeight="100dvh"
      sx={{
        pt: 'calc(env(safe-area-inset-top) + 12px)',
        px: 2,
        pb: `calc(env(safe-area-inset-bottom) + ${MOBILE_TAB_BAR_HEIGHT + 88}px)`,
      }}
    >
      {tab === 0 ? (
        <>
          <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ letterSpacing: 0.6 }}>
            ANSWERSCOPE
          </Typography>
          <Typography sx={{ fontSize: 32, fontWeight: 800, lineHeight: 1.15, mb: 2.5 }}>Websites</Typography>

          {isLoading && (
            <Box display="flex" justifyContent="center" py={6}>
              <CircularProgress size={28} />
            </Box>
          )}

          <Stack spacing={1.25}>
            {websites?.map((site) => (
              <ButtonBase
                key={site.id}
                onClick={() => onOpenSite(site.id)}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  width: '100%',
                  textAlign: 'left',
                  p: 1.75,
                  borderRadius: 3.5,
                  bgcolor: 'background.paper',
                  border: '1px solid rgba(15,23,42,0.07)',
                  boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
                  transition: 'transform 120ms ease-out',
                  '&:active': { transform: 'scale(0.985)' },
                }}
              >
                <Box
                  sx={{
                    width: 46,
                    height: 46,
                    borderRadius: 2.5,
                    display: 'grid',
                    placeItems: 'center',
                    color: '#fff',
                    background: 'linear-gradient(135deg,#2148C0,#0EA5A5)',
                    flexShrink: 0,
                  }}
                >
                  <LanguageRoundedIcon />
                </Box>
                <Box minWidth={0} flexGrow={1}>
                  <Typography fontWeight={700} noWrap>
                    {site.name ?? site.domain}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" noWrap>
                    {site.url}
                  </Typography>
                </Box>
                <ChevronRightRoundedIcon color="disabled" />
              </ButtonBase>
            ))}
          </Stack>

          {!isLoading && websites?.length === 0 && (
            <Box textAlign="center" py={9} px={2}>
              <Box
                sx={{
                  width: 72,
                  height: 72,
                  mx: 'auto',
                  mb: 2,
                  borderRadius: 5,
                  display: 'grid',
                  placeItems: 'center',
                  bgcolor: 'rgba(33,72,192,0.08)',
                  color: 'primary.main',
                }}
              >
                <PublicRoundedIcon sx={{ fontSize: 38 }} />
              </Box>
              <Typography variant="h6" fontWeight={800} gutterBottom>
                Add your first website
              </Typography>
              <Typography color="text.secondary" mb={3}>
                We'll audit how well AI search engines can understand and cite it.
              </Typography>
              <Button variant="contained" size="large" startIcon={<AddRoundedIcon />} onClick={onAdd} sx={{ minHeight: 48 }}>
                Add website
              </Button>
            </Box>
          )}

          {websites && websites.length > 0 && (
            <Fab
              color="primary"
              aria-label="Add website"
              onClick={onAdd}
              sx={{
                position: 'fixed',
                right: 16,
                bottom: `calc(env(safe-area-inset-bottom) + ${MOBILE_TAB_BAR_HEIGHT + 16}px)`,
                boxShadow: '0 8px 20px rgba(33,72,192,0.35)',
              }}
            >
              <AddRoundedIcon />
            </Fab>
          )}
        </>
      ) : (
        <>
          <Typography sx={{ fontSize: 32, fontWeight: 800, lineHeight: 1.15, mb: 2.5 }}>Account</Typography>
          <Stack
            direction="row"
            alignItems="center"
            spacing={1.75}
            sx={{ p: 2, borderRadius: 3.5, bgcolor: 'background.paper', border: '1px solid rgba(15,23,42,0.07)' }}
          >
            <Avatar sx={{ width: 52, height: 52, bgcolor: 'primary.main', fontWeight: 700 }}>{initial}</Avatar>
            <Box minWidth={0}>
              <Typography variant="caption" color="text.secondary">
                Signed in as
              </Typography>
              <Typography fontWeight={700} noWrap>
                {email}
              </Typography>
            </Box>
          </Stack>

          <Button
            fullWidth
            variant="outlined"
            color="error"
            startIcon={<LogoutRoundedIcon />}
            onClick={onLogout}
            sx={{ mt: 2, minHeight: 48, borderRadius: 3 }}
          >
            Sign out
          </Button>

          <Typography variant="caption" color="text.secondary" display="block" textAlign="center" mt={4}>
            AnswerScope · Powered by Expentor
          </Typography>
        </>
      )}

      <MobileTabBar
        value={tab}
        onChange={setTab}
        tabs={[
          { label: 'Websites', icon: <PublicRoundedIcon /> },
          { label: 'Account', icon: <PersonRoundedIcon /> },
        ]}
      />
    </Box>
  );
}
