import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AppBar,
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
  Stack,
  TextField,
  Toolbar,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { apiClient } from '../api/client';
import { useAuth } from '../auth/AuthContext';

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
  const { user, logout } = useAuth();
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
    <Box bgcolor="background.default" minHeight="100vh">
      <AppBar position="static" color="transparent" elevation={0}>
        <Toolbar>
          <Stack direction="row" alignItems="baseline" spacing={1} sx={{ flexGrow: 1 }}>
            <Typography variant="h6" fontWeight={700}>
              AnswerScope
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Powered by Expentor
            </Typography>
          </Stack>
          <Typography variant="body2" sx={{ mr: 2 }}>
            {user?.email}
          </Typography>
          <Button onClick={logout}>Sign out</Button>
        </Toolbar>
      </AppBar>

      <Container sx={{ py: 4 }}>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
          <Typography variant="h5" fontWeight={700}>
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
                  <CardContent>
                    <Typography variant="h6">{site.name ?? site.domain}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {site.url}
                    </Typography>
                  </CardContent>
                </CardActionArea>
              </Card>
            </Grid>
          ))}
        </Grid>

        {websites?.length === 0 && (
          <Typography color="text.secondary">
            No websites yet - add one to run your first AI Search Readiness audit.
          </Typography>
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
