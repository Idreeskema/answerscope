import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import LanguageRoundedIcon from '@mui/icons-material/LanguageRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import AppHeader from '../components/AppHeader';
import { apiClient } from '../api/client';

interface Workspace {
  id: string;
  name: string;
  role: string;
}

interface Website {
  id: string;
  url: string;
  name: string | null;
  domain: string;
}

/**
 * Landing page: pick/see your workspace's websites, add a new one to audit.
 * The full audit dashboard (scores, drill-down, recommendations) lives on
 * the /websites/:websiteId route - see AuditDashboardPage.
 */
export default function HomePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newUrl, setNewUrl] = useState('');

  const { data: workspaces } = useQuery<Workspace[]>({
    queryKey: ['workspaces'],
    queryFn: async () => (await apiClient.get('/workspaces')).data,
  });

  const workspaceId = workspaces?.[0]?.id;

  const { data: websites, isLoading } = useQuery<Website[]>({
    queryKey: ['websites', workspaceId],
    queryFn: async () => (await apiClient.get(`/workspaces/${workspaceId}/websites`)).data,
    enabled: !!workspaceId,
  });

  const createWebsite = useMutation({
    mutationFn: async (url: string) =>
      (await apiClient.post(`/workspaces/${workspaceId}/websites`, { url })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['websites', workspaceId] });
      setDialogOpen(false);
      setNewUrl('');
    },
  });

  return (
    <Box bgcolor="background.default" minHeight="100dvh">
      <AppHeader />

      <Container sx={{ py: { xs: 2.5, sm: 4 }, px: { xs: 2, sm: 3 }, pb: 'calc(env(safe-area-inset-bottom) + 24px)' }}>
        <Box display="flex" justifyContent="space-between" alignItems="center" gap={1} mb={3}>
          <Typography variant="h5" fontWeight={800}>
            Your websites
          </Typography>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialogOpen(true)}>
            Add website
          </Button>
        </Box>

        {isLoading && <Typography>Loading...</Typography>}

        <Grid container spacing={2}>
          {websites?.map((site) => (
            <Grid item xs={12} sm={6} md={4} key={site.id}>
              <Card>
                <CardActionArea onClick={() => navigate(`/websites/${site.id}`)}>
                  <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 2 }}>
                    <Box
                      sx={{
                        width: 40,
                        height: 40,
                        borderRadius: 2,
                        display: 'grid',
                        placeItems: 'center',
                        bgcolor: 'rgba(33,72,192,0.08)',
                        color: 'primary.main',
                        flexShrink: 0,
                      }}
                    >
                      <LanguageRoundedIcon />
                    </Box>
                    <Box minWidth={0} flexGrow={1}>
                      <Typography variant="subtitle1" fontWeight={700} noWrap>
                        {site.name ?? site.domain}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" noWrap>
                        {site.url}
                      </Typography>
                    </Box>
                    <ChevronRightRoundedIcon color="disabled" />
                  </CardContent>
                </CardActionArea>
              </Card>
            </Grid>
          ))}
        </Grid>

        {websites?.length === 0 && (
          <Box textAlign="center" py={8} px={2}>
            <Box
              sx={{
                width: 64,
                height: 64,
                mx: 'auto',
                mb: 2,
                borderRadius: 4,
                display: 'grid',
                placeItems: 'center',
                bgcolor: 'rgba(33,72,192,0.08)',
                color: 'primary.main',
              }}
            >
              <LanguageRoundedIcon sx={{ fontSize: 34 }} />
            </Box>
            <Typography variant="h6" fontWeight={700} gutterBottom>
              No websites yet
            </Typography>
            <Typography color="text.secondary" mb={3}>
              Add one to run your first AI Search Readiness audit.
            </Typography>
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialogOpen(true)}>
              Add website
            </Button>
          </Box>
        )}
      </Container>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Add a website</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            margin="dense"
            label="Website URL"
            placeholder="https://example.com"
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
          />
          {createWebsite.isError && (
            <Typography color="error" variant="body2" mt={1}>
              {(createWebsite.error as any)?.response?.data?.message ?? 'Failed to add website'}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={!newUrl || createWebsite.isPending}
            onClick={() => createWebsite.mutate(newUrl)}
          >
            Add
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
