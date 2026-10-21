import { Box, Button, MenuItem, Select, Stack, Typography } from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import WarningRoundedIcon from '@mui/icons-material/WarningRounded';
import ErrorRoundedIcon from '@mui/icons-material/ErrorRounded';
import type { AuditListItem, Website } from '../../types/audit';
import {
  formatDateTime,
  scoreStatus,
  scoreStatusLabel,
  type ScoreStatus,
} from '../../utils/auditFormatting';

const STATUS_ICON: Record<ScoreStatus, typeof CheckCircleRoundedIcon> = {
  good: CheckCircleRoundedIcon,
  warning: WarningRoundedIcon,
  critical: ErrorRoundedIcon,
};

/**
 * Hero card at the top of the mobile audit screen: site, big readiness
 * score with a status label (icon + text, never color alone), audit
 * picker, and the single primary action.
 */
export default function MobileAuditHero({
  website,
  audits,
  selected,
  selectedAuditId,
  onSelectAudit,
  onRunAudit,
  runDisabled,
}: {
  website?: Website;
  audits?: AuditListItem[];
  selected?: AuditListItem;
  selectedAuditId: string | null;
  onSelectAudit: (id: string) => void;
  onRunAudit: () => void;
  runDisabled: boolean;
}) {
  const completed = selected?.status === 'COMPLETED' && selected.overallScore != null;
  const score = completed ? Math.round(selected!.overallScore as number) : null;
  const status = score != null ? scoreStatus(score) : null;
  const StatusIcon = status ? STATUS_ICON[status] : null;

  return (
    <Box
      sx={{
        borderRadius: 4,
        p: 2.5,
        color: '#fff',
        position: 'relative',
        overflow: 'hidden',
        background: 'linear-gradient(150deg,#2148C0 0%,#16307A 62%,#0B1B4A 100%)',
        boxShadow: '0 10px 30px rgba(33,72,192,0.28)',
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          width: 220,
          height: 220,
          borderRadius: '50%',
          top: -90,
          right: -70,
          background: 'radial-gradient(circle, rgba(14,165,165,0.45) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />
      <Box sx={{ position: 'relative' }}>
        <Typography variant="caption" sx={{ opacity: 0.75, letterSpacing: 0.6, fontWeight: 600 }}>
          AI SEARCH READINESS
        </Typography>
        <Typography variant="body2" sx={{ opacity: 0.9, mt: 0.25 }} noWrap>
          {website?.name ?? website?.domain ?? 'Website'}
        </Typography>

        <Stack direction="row" alignItems="flex-end" spacing={1} mt={1.5} mb={1}>
          <Typography sx={{ fontSize: 64, fontWeight: 800, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
            {score != null ? score : selected?.status === 'FAILED' ? '!' : '--'}
          </Typography>
          <Typography sx={{ fontSize: 20, fontWeight: 600, opacity: 0.7, pb: 0.75 }}>/100</Typography>
        </Stack>

        <Box sx={{ minHeight: 28 }}>
          {status && StatusIcon ? (
            <Stack
              direction="row"
              alignItems="center"
              spacing={0.75}
              sx={{ display: 'inline-flex', bgcolor: 'rgba(255,255,255,0.16)', borderRadius: 99, px: 1.25, py: 0.5 }}
            >
              <StatusIcon sx={{ fontSize: 16 }} />
              <Typography variant="caption" fontWeight={700}>
                {scoreStatusLabel(status)}
              </Typography>
            </Stack>
          ) : (
            <Typography variant="caption" sx={{ opacity: 0.8 }}>
              {!selected
                ? 'No audit yet'
                : selected.status === 'FAILED'
                  ? 'Last audit failed'
                  : 'Audit in progress...'}
            </Typography>
          )}
        </Box>

        {audits && audits.length > 0 && (
          <Select
            fullWidth
            size="small"
            value={selectedAuditId ?? ''}
            onChange={(e) => onSelectAudit(e.target.value)}
            inputProps={{ 'aria-label': 'Select audit' }}
            sx={{
              mt: 2,
              color: '#fff',
              bgcolor: 'rgba(255,255,255,0.12)',
              borderRadius: 2.5,
              '& .MuiOutlinedInput-notchedOutline': { border: 'none' },
              '& .MuiSelect-icon': { color: '#fff' },
              '& .MuiSelect-select': { py: 1.25 },
            }}
          >
            {audits.map((a) => (
              <MenuItem key={a.id} value={a.id}>
                {formatDateTime(a.createdAt)}
                {a.overallScore != null ? ` · ${Math.round(a.overallScore)}` : ` · ${a.status}`}
              </MenuItem>
            ))}
          </Select>
        )}

        <Button
          fullWidth
          variant="contained"
          startIcon={<AddRoundedIcon />}
          disabled={runDisabled}
          onClick={onRunAudit}
          sx={{
            mt: 1.5,
            minHeight: 48,
            borderRadius: 2.5,
            bgcolor: '#fff',
            color: 'primary.main',
            fontWeight: 700,
            '&:hover': { bgcolor: '#fff' },
            '&:active': { transform: 'scale(0.98)' },
            '&.Mui-disabled': { bgcolor: 'rgba(255,255,255,0.35)', color: 'rgba(255,255,255,0.7)' },
          }}
        >
          Run new audit
        </Button>
      </Box>
    </Box>
  );
}
