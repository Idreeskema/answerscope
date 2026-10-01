import { useState, FormEvent } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  IconButton,
  InputAdornment,
  Link,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import EmailRoundedIcon from '@mui/icons-material/EmailRounded';
import LockRoundedIcon from '@mui/icons-material/LockRounded';
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';
import VisibilityOffRoundedIcon from '@mui/icons-material/VisibilityOffRounded';
import PlayCircleOutlineRoundedIcon from '@mui/icons-material/PlayCircleOutlineRounded';
import AuthLayout from '../components/auth/AuthLayout';
import { apiClient } from '../api/client';
import { useAuth } from '../auth/AuthContext';

// Pre-seeded demo account (has a completed audit to explore immediately).
// Only meant for local/demo environments - not a secret, just a shortcut.
const DEMO_EMAIL = 'e2e-test@example.com';
const DEMO_PASSWORD = 'SuperSecret123';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  async function performLogin(loginEmail: string, loginPassword: string) {
    setError(null);
    try {
      const res = await apiClient.post('/auth/login', { email: loginEmail, password: loginPassword });
      login(res.data.accessToken, res.data.user);
      navigate('/');
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Login failed');
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    await performLogin(email, password);
    setLoading(false);
  }

  async function handleDemoLogin() {
    setDemoLoading(true);
    await performLogin(DEMO_EMAIL, DEMO_PASSWORD);
    setDemoLoading(false);
  }

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to see your website's AI search readiness.">
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <form onSubmit={handleSubmit}>
        <Stack spacing={2.5}>
          <TextField
            label="Email"
            type="email"
            fullWidth
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <EmailRoundedIcon fontSize="small" color="action" />
                </InputAdornment>
              ),
            }}
          />
          <TextField
            label="Password"
            type={showPassword ? 'text' : 'password'}
            fullWidth
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <LockRoundedIcon fontSize="small" color="action" />
                </InputAdornment>
              ),
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    onClick={() => setShowPassword((v) => !v)}
                    edge="end"
                    size="small"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <VisibilityOffRoundedIcon fontSize="small" />
                    ) : (
                      <VisibilityRoundedIcon fontSize="small" />
                    )}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
          <Button
            type="submit"
            variant="contained"
            size="large"
            fullWidth
            disabled={loading || demoLoading}
            startIcon={loading ? <CircularProgress size={18} color="inherit" /> : undefined}
            sx={{ py: 1.25, fontWeight: 700, boxShadow: 'none' }}
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </Button>
        </Stack>
      </form>

      <Divider sx={{ my: 2.5 }}>
        <Typography variant="caption" color="text.secondary">
          or
        </Typography>
      </Divider>

      <Button
        variant="outlined"
        size="large"
        fullWidth
        disabled={loading || demoLoading}
        onClick={handleDemoLogin}
        startIcon={
          demoLoading ? <CircularProgress size={18} /> : <PlayCircleOutlineRoundedIcon />
        }
        sx={{ py: 1.25, fontWeight: 700 }}
      >
        {demoLoading ? 'Signing in...' : 'Try demo account'}
      </Button>
      <Typography variant="caption" color="text.secondary" display="block" textAlign="center" mt={1}>
        Explores a pre-audited site with real scores and recommendations - no sign-up needed.
      </Typography>

      <Box mt={3}>
        <Typography variant="body2" color="text.secondary" textAlign="center">
          No account yet?{' '}
          <Link component={RouterLink} to="/register" fontWeight={600}>
            Create one
          </Link>
        </Typography>
      </Box>
    </AuthLayout>
  );
}
