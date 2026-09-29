import { useState } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material';

export interface NewAuditOptions {
  maxPages?: number;
  maxDepth?: number;
}

export default function NewAuditDialog({
  open,
  onClose,
  onSubmit,
  isSubmitting,
  errorMessage,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (options: NewAuditOptions) => void;
  isSubmitting: boolean;
  errorMessage?: string | null;
}) {
  const [maxPages, setMaxPages] = useState('');
  const [maxDepth, setMaxDepth] = useState('');

  const handleSubmit = () => {
    const options: NewAuditOptions = {};
    if (maxPages.trim() !== '') options.maxPages = Number(maxPages);
    if (maxDepth.trim() !== '') options.maxDepth = Number(maxDepth);
    onSubmit(options);
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Run a new audit</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" mb={2}>
          Crawls the site and re-runs every analyzer from scratch. Leave the fields below blank to
          use the defaults (100 pages, depth 4).
        </Typography>
        <Stack spacing={2}>
          <TextField
            label="Max pages to crawl"
            type="number"
            value={maxPages}
            onChange={(e) => setMaxPages(e.target.value)}
            inputProps={{ min: 1, max: 2000 }}
            fullWidth
          />
          <TextField
            label="Max crawl depth"
            type="number"
            value={maxDepth}
            onChange={(e) => setMaxDepth(e.target.value)}
            inputProps={{ min: 1, max: 10 }}
            fullWidth
          />
        </Stack>
        {errorMessage && (
          <Typography color="error" variant="body2" mt={2}>
            {errorMessage}
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={isSubmitting}>
          {isSubmitting ? 'Starting...' : 'Start audit'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
