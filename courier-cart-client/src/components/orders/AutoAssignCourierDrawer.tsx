import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { autoAssignAndBookB2COrders, type AutoAssignBookResult } from '../../api/order.service'
import { usePickupAddresses } from '../../hooks/Pickup/usePickupAddresses'
import type { HydratedPickup } from '../../types/generic.types'
import CustomDrawer from '../UI/drawer/CustomDrawer'
import { toast } from '../UI/Toast'

type AutoAssignCourierDrawerProps = {
  open: boolean
  orders: Array<Record<string, any> & { id: string | number }>
  onClose: () => void
  onComplete?: () => void
}

const today = () => new Date().toISOString().slice(0, 10)

const getWarehouseLabel = (warehouse: HydratedPickup) =>
  warehouse.pickup?.addressNickname || warehouse.pickup?.contactName || 'Warehouse'

const resultColor = (result: AutoAssignBookResult) => {
  if (result.success) return 'success'
  if (result.skipped) return 'warning'
  return 'error'
}

export default function AutoAssignCourierDrawer({
  open,
  orders,
  onClose,
  onComplete,
}: AutoAssignCourierDrawerProps) {
  const queryClient = useQueryClient()
  const { data: warehouseData, isLoading: warehousesLoading } = usePickupAddresses({
    page: 1,
    limit: 100,
  })
  const warehouses = (warehouseData?.pickupAddresses || []).filter(
    (warehouse) => warehouse.isPickupEnabled,
  )
  const [warehouseId, setWarehouseId] = useState('')
  const [pickupDate, setPickupDate] = useState(today())
  const [pickupTime, setPickupTime] = useState('10:00')
  const [running, setRunning] = useState(false)
  const [results, setResults] = useState<AutoAssignBookResult[]>([])
  const [summary, setSummary] = useState('')

  const runAutoAssign = async () => {
    if (!warehouseId) return
    setRunning(true)
    setResults([])
    setSummary('')
    try {
      const response = await autoAssignAndBookB2COrders({
        order_ids: orders.map((order) => order.id),
        pickup_location_id: warehouseId,
        pickup_date: pickupDate,
        pickup_time: pickupTime,
      })
      setResults(response.results || [])
      setSummary(response.message)
      toast.open({
        message: response.message,
        severity: response.summary.failedCount ? 'warning' : 'success',
      })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['b2cOrdersByUser'] }),
        queryClient.invalidateQueries({ queryKey: ['orders'] }),
      ])
      onComplete?.()
    } catch (error: any) {
      const message = error?.response?.data?.message || error?.message || 'Auto assign failed'
      setSummary(message)
      toast.open({ message, severity: 'error' })
    } finally {
      setRunning(false)
    }
  }

  return (
    <CustomDrawer
      open={open}
      onClose={running ? () => undefined : onClose}
      title="Auto Assign & Book"
      width={720}
    >
      <Stack spacing={2}>
        <Alert severity="info">
          Auto assign uses your active courier priority rules. Each selected order is checked
          separately and booked with the first serviceable courier from its matching rule.
        </Alert>

        <TextField
          select
          fullWidth
          label="Pickup warehouse"
          value={warehouseId}
          disabled={warehousesLoading || running}
          onChange={(event) => setWarehouseId(event.target.value)}
          helperText={
            warehousesLoading
              ? 'Loading warehouses...'
              : warehouses.length
                ? 'This warehouse will be used for every selected order.'
                : 'Add and enable a pickup warehouse before auto assigning.'
          }
        >
          {warehouses.map((warehouse) => (
            <MenuItem key={warehouse.pickupId} value={warehouse.pickupId}>
              {getWarehouseLabel(warehouse)} — {warehouse.pickup?.pincode || 'No pincode'}
            </MenuItem>
          ))}
        </TextField>

        <Stack direction={{ xs: 'column', md: 'row' }} gap={1}>
          <TextField
            label="Pickup date"
            type="date"
            value={pickupDate}
            disabled={running}
            onChange={(event) => setPickupDate(event.target.value)}
            InputLabelProps={{ shrink: true }}
            fullWidth
          />
          <TextField
            label="Pickup time"
            type="time"
            value={pickupTime}
            disabled={running}
            onChange={(event) => setPickupTime(event.target.value)}
            InputLabelProps={{ shrink: true }}
            fullWidth
          />
        </Stack>

        <Divider />

        <Typography fontWeight={800}>{orders.length} selected orders</Typography>
        {summary && <Alert severity={results.some((result) => !result.success) ? 'warning' : 'success'}>{summary}</Alert>}

        {running && (
          <Stack alignItems="center" spacing={1.2} sx={{ py: 4 }}>
            <CircularProgress size={30} />
            <Typography color="text.secondary">Matching rules and booking couriers...</Typography>
          </Stack>
        )}

        {!!results.length && (
          <Stack spacing={1}>
            {results.map((result) => (
              <Paper key={result.orderId} sx={{ p: 1.25, borderRadius: 2 }}>
                <Stack direction="row" alignItems="center" gap={1}>
                  <Chip label={result.success ? 'Booked' : result.skipped ? 'Skipped' : 'Failed'} color={resultColor(result) as any} size="small" />
                  <Box sx={{ flex: 1 }}>
                    <Typography fontWeight={800}>{result.orderNumber || result.orderId}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {result.message}
                    </Typography>
                    {result.ruleName && (
                      <Typography variant="caption" color="text.secondary">
                        Rule: {result.ruleName}
                      </Typography>
                    )}
                  </Box>
                  <Box textAlign="right">
                    {result.courier && <Typography fontWeight={700}>{result.courier}</Typography>}
                    {result.awbNumber && (
                      <Typography variant="caption" color="text.secondary">
                        AWB: {result.awbNumber}
                      </Typography>
                    )}
                  </Box>
                </Stack>
              </Paper>
            ))}
          </Stack>
        )}

        <Stack direction="row" justifyContent="flex-end" spacing={1}>
          <Button onClick={onClose} disabled={running}>
            Close
          </Button>
          <Button
            variant="contained"
            disabled={!warehouseId || running || !orders.length}
            onClick={() => void runAutoAssign()}
          >
            {running ? 'Auto assigning...' : 'Auto Assign & Book'}
          </Button>
        </Stack>
      </Stack>
    </CustomDrawer>
  )
}
