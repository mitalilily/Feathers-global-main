import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Grid,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { useEffect, useMemo, useState } from 'react'
import { quoteReverse } from '../../../api/returns'
import { fetchWalletBalance } from '../../../api/wallet.api'
import {
  buildReverseCreatePayload,
  type OrderForReverse,
  type ReverseCreatePayload,
} from './reverseFlow'

interface ReverseOrderFlowCardProps {
  order: OrderForReverse
  isSubmitting?: boolean
  onBack: () => void
  onConfirm: (payload: ReverseCreatePayload) => void
}

const formatAddress = (...parts: Array<string | null | undefined>) =>
  parts
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(', ')

const readonlyFieldSx = {
  '& .MuiInputBase-input.Mui-disabled': {
    WebkitTextFillColor: '#111827',
  },
}

export default function ReverseOrderFlowCard({
  order,
  isSubmitting = false,
  onBack,
  onConfirm,
}: ReverseOrderFlowCardProps) {
  const [rate, setRate] = useState<number>(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [wallet, setWallet] = useState<number>(0)
  const [eddDays, setEddDays] = useState<number | null>(null)
  const [isOda, setIsOda] = useState(false)

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        setLoading(true)
        setError(null)
        const [quoteResponse, walletResponse] = await Promise.all([
          quoteReverse({ orderId: String(order.id) }),
          fetchWalletBalance(),
        ])

        if (cancelled) return

        setRate(Number(quoteResponse?.quote?.rate || 0))
        setEddDays(quoteResponse?.quote?.eddDays ?? null)
        setIsOda(Boolean(quoteResponse?.quote?.oda))
        setWallet(Number(walletResponse?.data?.balance || 0))
      } catch (cause: unknown) {
        if (cancelled) return
        setError(cause instanceof Error ? cause.message : 'Failed to get reverse quote')
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [order.id])

  const pickupAddress = useMemo(
    () => formatAddress(order.address, order.city, order.state, order.pincode),
    [order.address, order.city, order.state, order.pincode],
  )
  const returnAddress = useMemo(
    () =>
      formatAddress(
        order.pickup_details?.address,
        order.pickup_details?.city,
        order.pickup_details?.state,
        order.pickup_details?.pincode,
      ),
    [
      order.pickup_details?.address,
      order.pickup_details?.city,
      order.pickup_details?.state,
      order.pickup_details?.pincode,
    ],
  )
  const orderItemsCount = Array.isArray(order.products) ? order.products.length : 0
  const walletGap = Math.max(0, rate - wallet)
  const canConfirm = !loading && !(!!error && rate === 0) && !(rate > 0 && rate > wallet) && !isSubmitting

  return (
    <Card
      sx={{
        borderRadius: 3,
        border: '1px solid rgba(4, 123, 133, 0.16)',
        boxShadow: '0 14px 34px rgba(15, 23, 42, 0.08)',
        overflow: 'hidden',
      }}
    >
      <Box
        sx={{
          px: { xs: 2, md: 2.5 },
          py: 1.6,
          borderBottom: '1px solid rgba(4, 123, 133, 0.12)',
          bgcolor: 'rgba(4, 123, 133, 0.04)',
        }}
      >
        <Stack
          direction={{ xs: 'column', lg: 'row' }}
          spacing={1.2}
          alignItems={{ xs: 'flex-start', lg: 'center' }}
          justifyContent="space-between"
        >
          <Box>
            <Typography variant="overline" sx={{ color: '#047b85', fontWeight: 900 }}>
              Dedicated Reverse Flow
            </Typography>
            <Typography sx={{ fontWeight: 900, color: '#111827', fontSize: '1.1rem' }}>
              {order.order_number || `Order ${order.id}`}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Review the customer pickup, return destination, and reverse charges before creating
              the shipment.
            </Typography>
          </Box>

          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Chip
              label={String(order.integration_type || '-').toUpperCase()}
              size="small"
              sx={{ fontWeight: 800 }}
            />
            {order.awb_number ? (
              <Chip label={`AWB ${order.awb_number}`} size="small" variant="outlined" />
            ) : null}
          </Stack>
        </Stack>
      </Box>

      <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
        <Stack spacing={2}>
          <Alert severity="info" sx={{ borderRadius: 2.5 }}>
            This reverse shipment is prefilled from the delivered order. If you need to change the
            consignee, pickup, or item details substantially, use the manual reverse entry instead.
          </Alert>

          <Grid container spacing={1.5}>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Customer pickup contact"
                value={order.buyer_name || '-'}
                disabled
                sx={readonlyFieldSx}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Customer pickup phone"
                value={order.buyer_phone || '-'}
                disabled
                sx={readonlyFieldSx}
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                multiline
                minRows={2}
                label="Pickup from customer"
                value={pickupAddress || '-'}
                disabled
                sx={readonlyFieldSx}
              />
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Return warehouse"
                value={
                  order.pickup_details?.name || order.pickup_details?.warehouse_name || '-'
                }
                disabled
                sx={readonlyFieldSx}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Return contact phone"
                value={order.pickup_details?.phone || '-'}
                disabled
                sx={readonlyFieldSx}
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                multiline
                minRows={2}
                label="Return to warehouse"
                value={returnAddress || '-'}
                disabled
                sx={readonlyFieldSx}
              />
            </Grid>
          </Grid>

          <Divider />

          <Grid container spacing={1.5}>
            <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
              <TextField
                fullWidth
                label="Items in reverse"
                value={String(orderItemsCount || 0)}
                disabled
                sx={readonlyFieldSx}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
              <TextField
                fullWidth
                label="Length"
                value={String(order.length || 0)}
                disabled
                sx={readonlyFieldSx}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
              <TextField
                fullWidth
                label="Breadth"
                value={String(order.breadth || 0)}
                disabled
                sx={readonlyFieldSx}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
              <TextField
                fullWidth
                label="Height"
                value={String(order.height || 0)}
                disabled
                sx={readonlyFieldSx}
              />
            </Grid>
          </Grid>

          <Box
            sx={{
              borderRadius: 2.5,
              border: '1px solid rgba(4, 123, 133, 0.12)',
              bgcolor: 'rgba(248, 250, 252, 0.9)',
              px: { xs: 1.5, md: 2 },
              py: 1.75,
            }}
          >
            <Stack
              direction={{ xs: 'column', md: 'row' }}
              spacing={1.5}
              justifyContent="space-between"
              alignItems={{ xs: 'flex-start', md: 'center' }}
            >
              <Box>
                <Typography sx={{ fontWeight: 900, color: '#111827' }}>
                  Estimated reverse charges: Rs. {Number(rate || 0).toFixed(2)}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.35 }}>
                  Wallet balance: Rs. {wallet.toFixed(2)}
                  {eddDays !== null ? ` | Estimated delivery: ${eddDays} days` : ''}
                  {isOda ? ' | ODA area may take longer and incur surcharges.' : ''}
                </Typography>
              </Box>

              <Stack direction="row" spacing={1}>
                <Button
                  variant="outlined"
                  onClick={onBack}
                  disabled={isSubmitting}
                  sx={{ textTransform: 'none', fontWeight: 700 }}
                >
                  Change order
                </Button>
                <Button
                  variant="contained"
                  onClick={() => onConfirm(buildReverseCreatePayload(order, rate))}
                  disabled={!canConfirm}
                  sx={{ textTransform: 'none', fontWeight: 800 }}
                >
                  {isSubmitting ? 'Creating Reverse...' : 'Create Reverse Shipment'}
                </Button>
              </Stack>
            </Stack>

            {loading ? (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Fetching reverse quote...
              </Typography>
            ) : null}
            {error ? (
              <Typography color="error" variant="body2" sx={{ mt: 1 }}>
                {error}
              </Typography>
            ) : null}
            {walletGap > 0 ? (
              <Typography color="error" variant="body2" sx={{ mt: 1 }}>
                Insufficient wallet balance. Add Rs. {walletGap.toFixed(2)} more before creating
                this reverse shipment.
              </Typography>
            ) : null}
          </Box>
        </Stack>
      </CardContent>
    </Card>
  )
}
