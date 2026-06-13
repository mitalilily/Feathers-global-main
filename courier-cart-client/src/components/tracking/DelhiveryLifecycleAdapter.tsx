import { alpha, Box, Card, CardContent, Chip, Grid, Stack, Typography } from '@mui/material'

type StageFlowCardProps = {
  title: string
  description: string
  stages: string[]
  accent: string
}

const unifiedWorkflow = [
  'booked',
  'pickup_initiated',
  'in_transit',
  'out_for_delivery',
  'delivered',
  'rto',
  'rto_in_transit',
  'rto_delivered',
  'cancelled',
]

const forwardLifecycle = ['UD', 'Manifested', 'Not Picked', 'In Transit', 'Pending', 'Dispatched', 'DL Delivered']
const returnLifecycle = ['RT', 'In Transit', 'Pending', 'Dispatched', 'DL RTO']
const reverseLifecycle = ['PP', 'Open', 'Scheduled', 'Dispatched', 'PU', 'In Transit', 'Pending', 'Dispatched', 'DL DTO']

function StageFlowCard({ title, description, stages, accent }: StageFlowCardProps) {
  return (
    <Card
      variant="outlined"
      sx={{
        height: '100%',
        borderRadius: 3,
        borderColor: alpha(accent, 0.18),
        background: `linear-gradient(180deg, ${alpha(accent, 0.05)} 0%, rgba(255,255,255,0.96) 100%)`,
      }}
    >
      <CardContent>
        <Typography variant="subtitle1" fontWeight={800} color="#17171A" gutterBottom>
          {title}
        </Typography>
        <Typography variant="body2" sx={{ color: '#6E6763', mb: 1.5 }}>
          {description}
        </Typography>
        <Stack direction="row" flexWrap="wrap" alignItems="center" gap={0.8}>
          {stages.map((stage, index) => (
            <Box key={`${title}-${stage}-${index}`} sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
              <Chip
                label={stage}
                size="small"
                sx={{
                  borderRadius: '999px',
                  fontWeight: 700,
                  bgcolor: alpha(accent, 0.12),
                  color: accent,
                }}
              />
              {index < stages.length - 1 && (
                <Typography sx={{ color: '#9A8F8B', fontWeight: 800, fontSize: '0.92rem' }}>
                  {'->'}
                </Typography>
              )}
            </Box>
          ))}
        </Stack>
      </CardContent>
    </Card>
  )
}

export function DelhiveryLifecycleAdapter({
  courierName,
  integrationType,
}: {
  courierName?: string | null
  integrationType?: string | null
}) {
  const isDelhivery =
    (courierName || '').toLowerCase().includes('delhivery') ||
    (integrationType || '').toLowerCase() === 'delhivery'

  if (!isDelhivery) {
    return null
  }

  return (
    <Card
      sx={{
        borderRadius: 3,
        border: '1px solid rgba(4, 123, 133, 0.12)',
        boxShadow: '0 12px 26px rgba(20, 20, 20, 0.07)',
        background:
          'radial-gradient(circle at top right, rgba(4,123,133,0.08) 0%, transparent 26%), linear-gradient(180deg, #FFFFFF 0%, #FBF7F4 100%)',
      }}
    >
      <CardContent>
        <Stack spacing={0.8} mb={2}>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
            <Chip
              label="Delhivery adapter"
              size="small"
              sx={{
                borderRadius: '999px',
                bgcolor: alpha('#047b85', 0.12),
                color: '#047b85',
                fontWeight: 800,
              }}
            />
            <Chip
              label="Provider specific"
              size="small"
              variant="outlined"
              sx={{
                borderRadius: '999px',
                borderColor: alpha('#047b85', 0.22),
                color: '#6E6763',
                fontWeight: 700,
              }}
            />
          </Stack>
          <Typography variant="h6" fontWeight={800} color="#17171A">
            Unified workflow on the panel, Delhivery lifecycle underneath
          </Typography>
          <Typography variant="body2" sx={{ color: '#6E6763', maxWidth: 900 }}>
            Users see one shipment journey. Delhivery events are mapped into the shared internal
            states behind the scenes and the raw Delhivery stages remain courier specific.
          </Typography>
        </Stack>

        <Grid container spacing={1.5}>
          <Grid size={{ xs: 12 }}>
            <Box
              sx={{
                p: 1.5,
                borderRadius: 2.5,
                border: '1px solid rgba(4, 123, 133, 0.12)',
                bgcolor: 'rgba(4, 123, 133, 0.04)',
              }}
            >
              <Typography variant="subtitle2" fontWeight={800} color="#047b85" gutterBottom>
                Internal shared workflow
              </Typography>
              <Stack direction="row" flexWrap="wrap" alignItems="center" gap={0.8}>
                {unifiedWorkflow.map((stage, index) => (
                  <Box key={stage} sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
                    <Chip
                      label={stage}
                      size="small"
                      sx={{
                        borderRadius: '999px',
                        fontWeight: 700,
                        bgcolor: alpha('#047b85', 0.1),
                        color: '#047b85',
                      }}
                    />
                    {index < unifiedWorkflow.length - 1 && (
                      <Typography sx={{ color: '#9A8F8B', fontWeight: 800 }}>{'->'}</Typography>
                    )}
                  </Box>
                ))}
              </Stack>
            </Box>
          </Grid>

          <Grid size={{ xs: 12, md: 4 }}>
            <StageFlowCard
              title="Forward shipment"
              description="Delhivery forward lifecycle mapped from pickup to final delivery."
              stages={forwardLifecycle}
              accent="#047b85"
            />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <StageFlowCard
              title="Return journey"
              description="RTO flow from return conversion back to the origin center."
              stages={returnLifecycle}
              accent="#F59E0B"
            />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <StageFlowCard
              title="Reverse pickup"
              description="Return pickup flow for consignee initiated reverse collection."
              stages={reverseLifecycle}
              accent="#8B5CF6"
            />
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  )
}
