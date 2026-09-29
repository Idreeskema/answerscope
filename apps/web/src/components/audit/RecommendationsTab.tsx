import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Chip,
  Stack,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import type { AuditDetail } from '../../types/audit';
import { categoryLabel, recommendationStatusColor, severityColor } from '../../utils/auditFormatting';
import RecommendationFixPanel from './RecommendationFixPanel';

export default function RecommendationsTab({ audit }: { audit: AuditDetail }) {
  if (audit.recommendations.length === 0) {
    return (
      <Typography color="text.secondary">
        No recommendations have been generated for this audit yet.
      </Typography>
    );
  }

  return (
    <Box>
      {audit.recommendations.map((rec) => (
        <Accordion key={rec.id} disableGutters variant="outlined" sx={{ mb: 1 }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Stack direction="row" spacing={1.5} alignItems="center" width="100%" flexWrap="wrap">
              <Chip size="small" label={rec.severity} color={severityColor(rec.severity)} />
              <Typography sx={{ flexGrow: 1, minWidth: 200 }}>{rec.title}</Typography>
              <Chip size="small" variant="outlined" label={categoryLabel(rec.category)} />
              <Chip size="small" label={rec.status} color={recommendationStatusColor(rec.status)} />
              <Typography variant="caption" color="text.secondary">
                priority {rec.priority.toFixed(1)}
              </Typography>
            </Stack>
          </AccordionSummary>
          <AccordionDetails>
            <Stack spacing={1.5}>
              <Field label="Evidence" value={rec.evidence} />
              <Field label="Why it matters" value={rec.explanation} />
              <Field label="How to fix" value={rec.action} />
              {rec.example && <Field label="Example" value={rec.example} mono />}
              <Stack direction="row" spacing={3}>
                <Typography variant="caption" color="text.secondary">
                  Impact {rec.impact}/5
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Effort {rec.effort}/5
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Confidence {(rec.confidence * 100).toFixed(0)}%
                </Typography>
                {rec.affectedUrl && (
                  <Typography variant="caption" color="text.secondary" noWrap>
                    {rec.affectedUrl}
                  </Typography>
                )}
              </Stack>
              <RecommendationFixPanel auditId={audit.id} recommendation={rec} />
            </Stack>
          </AccordionDetails>
        </Accordion>
      ))}
    </Box>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography
        variant="body2"
        sx={{
          whiteSpace: 'pre-wrap',
          ...(mono ? { bgcolor: 'action.hover', p: 1, borderRadius: 1, fontFamily: 'monospace' } : {}),
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}
