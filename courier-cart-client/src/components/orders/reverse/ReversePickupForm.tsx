import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Grid,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FilterBar, type FilterField } from '../../FilterBar'
import { useB2COrdersByUser, useCreateReverseShipment } from '../../../hooks/Orders/useOrders'
import { usePickupAddresses } from '../../../hooks/Pickup/usePickupAddresses'
import { useKycVerification } from '../../../hooks/User/useKycVerification'
import type { B2COrder, HydratedPickup } from '../../../types/generic.types'
import ReverseModal from './ReverseModal'
import DataTable, { type Column } from '../../UI/table/DataTable'
import TableSkeleton from '../../UI/table/TableSkeleton'
import StatusChip from '../../UI/chip/StatusChip'

const SUPPORTED_REVERSE_CARRIERS = new Set(['delhivery', 'shadowfax', 'xpressbees'])

const defaultFilters = {
  search: '',
  courier: '',
  fromDate: '',
  toDate: '',
}

const courierOptions = [
  { label: 'All couriers', value: '' },
  { label: 'Delhivery', value: 'delhivery' },
  { label: 'Shadowfax', value: 'shadowfax' },
  { label: 'Xpressbees', value: 'xpressbees' },
  { label: 'Ekart', value: 'ekart' },
  { label: 'Amazon', value: 'amazon' },
]

const formatDate = (value?: string | null) => {
  if (!value) return '-'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return String(value)
  return parsed.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

const formatAddress = (pickup?: HydratedPickup | null) => {
  if (!pickup?.pickup) return 'No pickup address configured'
  const parts = [
    pickup.pickup.addressLine1,
    pickup.pickup.addressLine2,
    pickup.pickup.city,
    pickup.pickup.state,
    pickup.pickup.pincode,
  ]
    .filter(Boolean)
    .map((item) => String(item).trim())

  return parts.join(', ')
}

export default function ReversePickupForm() {
  const navigate = useNavigate()
  const { checkKycBeforeAction } = useKycVerification()
  const [page, setPage] = useState(1)
  const [rowsPerPage, setRowsPerPage] = useState(10)
  const [filters, setFilters] = useState(defaultFilters)
  const [selectedOrder, setSelectedOrder] = useState<B2COrder | null>(null)
  const createReverseShipment = useCreateReverseShipment()
  const { data: pickupResponse } = usePickupAddresses()

  const { data, isLoading, isFetching } = useB2COrdersByUser(page, rowsPerPage, {
    status: 'delivered',
    courier: filters.courier || undefined,
    search: filters.search || undefined,
    fromDate: filters.fromDate || undefined,
    toDate: filters.toDate || undefined,
  })

  const orders = (data?.orders || []) as B2COrder[]
  const reverseReadyOrders = useMemo(
    () =>
      orders.filter((order) =>
        SUPPORTED_REVERSE_CARRIERS.has(String(order.integration_type || '').toLowerCase()),
      ),
    [orders],
  )
  const pickupAddresses = (pickupResponse?.pickupAddresses || []) as HydratedPickup[]
  const primaryPickup = pickupAddresses.find((address) => address.isPrimary) || pickupAddresses[0]
  const pickupMissing = pickupAddresses.length === 0

  const summaryCards = [
    {
      label: 'Delivered orders',
      value: Number(data?.totalCount || 0).toLocaleString('en-IN'),
      hint: 'Eligible base for reverse creation',
    },
    {
      label: 'Reverse-ready',
      value: reverseReadyOrders.length.toLocaleString('en-IN'),
      hint: 'Supported by Delhivery, Shadowfax, Xpressbees',
    },
    {
      label: 'Pickup addresses',
      value: pickupAddresses.length.toLocaleString('en-IN'),
      hint: pickupMissing ? 'Add one before creating reverse' : 'Primary warehouse available',
    },
    {
      label: 'Unsupported',
      value: Math.max(0, orders.length - reverseReadyOrders.length).toLocaleString('en-IN'),
      hint: 'Ekart and Amazon reverse are blocked in this flow',
    },
  ]

  const filterFields: FilterField[] = [
    {
      name: 'search',
      label: 'Search',
      type: 'text',
      placeholder: 'Order number, buyer, AWB',
    },
    {
      name: 'courier',
      label: 'Courier',
      type: 'select',
      options: courierOptions,
    },
    {
      name: 'fromDate',
      label: 'From Date',
      type: 'date',
    },
    {
      name: 'toDate',
      label: 'To Date',
      type: 'date',
    },
  ]

  const columns: Column<B2COrder>[] = [
    {
      id: 'order_number',
      label: 'Order',
      minWidth: 180,
      render: (value, row) => (
        <Stack spacing={0.35}>
          <Typography sx={{ fontWeight: 800, color: '#111827', fontSize: '0.88rem' }}>
            {String(value || row.id)}
          </Typography>
          <Typography sx={{ color: '#6B7280', fontSize: '0.76rem' }}>
            Created {formatDate(row.created_at)}
          </Typography>
        </Stack>
      ),
    },
    {
      id: 'buyer_name',
      label: 'Customer',
      minWidth: 180,
      render: (value, row) => (
        <Stack spacing={0.35}>
          <Typography sx={{ fontWeight: 700, color: '#111827', fontSize: '0.84rem' }}>
            {String(value || '-')}
          </Typography>
          <Typography sx={{ color: '#6B7280', fontSize: '0.76rem' }}>
            {row.buyer_phone || '-'}
          </Typography>
        </Stack>
      ),
    },
    {
      id: 'integration_type',
      label: 'Courier',
      minWidth: 150,
      render: (value) => {
        const courier = String(value || '').toLowerCase()
        const supported = SUPPORTED_REVERSE_CARRIERS.has(courier)
        return (
          <Stack spacing={0.5} alignItems="flex-start">
            <Chip
              label={String(value || '-').toUpperCase()}
              size="small"
              sx={{
                fontWeight: 700,
                bgcolor: supported ? 'rgba(4, 123, 133, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                color: supported ? '#047b85' : '#B91C1C',
              }}
            />
            <Typography sx={{ color: '#6B7280', fontSize: '0.74rem' }}>
              {supported ? 'Reverse supported' : 'Reverse blocked'}
            </Typography>
          </Stack>
        )
      },
    },
    {
      id: 'pincode',
      label: 'Route',
      minWidth: 170,
      render: (_, row) => (
        <Stack spacing={0.35}>
          <Typography sx={{ fontWeight: 700, color: '#111827', fontSize: '0.82rem' }}>
            {row.pincode || '-'}
          </Typography>
          <Typography sx={{ color: '#6B7280', fontSize: '0.74rem' }}>
            Customer {'->'} {primaryPickup?.pickup?.pincode || 'warehouse'}
          </Typography>
        </Stack>
      ),
    },
    {
      id: 'order_status',
      label: 'Status',
      minWidth: 140,
      render: (value) => (
        <StatusChip status="success" label={String(value || 'delivered').replace(/_/g, ' ')} />
      ),
    },
    {
      id: 'id',
      label: 'Action',
      align: 'right',
      minWidth: 160,
      showCellTooltip: false,
      render: (_, row) => {
        const courier = String(row.integration_type || '').toLowerCase()
        const supported = SUPPORTED_REVERSE_CARRIERS.has(courier)
        const hasPickup =
          Boolean(row.pickup_details?.address || row.pickup_details?.warehouse_name) ||
          Boolean(primaryPickup?.pickup?.addressLine1)

        return (
          <Stack direction="row" justifyContent="flex-end">
            <Tooltip
              title={
                !supported
                  ? 'Reverse pickup is not supported for this courier yet.'
                  : !hasPickup
                    ? 'Pickup details are missing for this order.'
                    : 'Create reverse pickup'
              }
            >
              <span>
                <Button
                  size="small"
                  variant="contained"
                  disabled={!supported || !hasPickup}
                  onClick={() =>
                    checkKycBeforeAction(() => {
                      setSelectedOrder(row)
                    })
                  }
                  sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2 }}
                >
                  Create Reverse
                </Button>
              </span>
            </Tooltip>
          </Stack>
        )
      },
    },
  ]

  const selectedReverseOrder = selectedOrder
    ? ({
        ...selectedOrder,
        id: String(selectedOrder.id),
      } as B2COrder & { id: string })
    : null

  return (
    <Stack spacing={2} sx={{ minHeight: 0 }}>
      <Alert
        severity="info"
        sx={{ borderRadius: 3, alignItems: 'flex-start' }}
        action={
          <Button
            size="small"
            onClick={() => navigate('/settings/manage_pickups')}
            sx={{ textTransform: 'none', fontWeight: 800 }}
          >
            Manage pickups
          </Button>
        }
      >
        <AlertTitle>Reverse pickup flow</AlertTitle>
        Reverse shipments pick up the parcel from the customer and move it through the carrier
        network to your configured pickup or return address. Quality check is carrier-specific and
        can happen at pickup or at a hub, so the panel only enables carriers that support reverse
        shipments in this flow.
      </Alert>

      {pickupMissing ? (
        <Alert severity="warning" sx={{ borderRadius: 3 }}>
          No pickup address is configured yet. The reverse flow can still be reviewed here, but
          adding a pickup address will make warehouse handoff and return handling clearer.
        </Alert>
      ) : null}

      <Grid container spacing={1.5}>
        {summaryCards.map((card) => (
          <Grid key={card.label} size={{ xs: 12, sm: 6, xl: 3 }}>
            <Card
              sx={{
                height: '100%',
                borderRadius: 3,
                border: '1px solid rgba(4, 123, 133, 0.12)',
                boxShadow: '0 10px 28px rgba(15, 23, 42, 0.06)',
              }}
            >
              <CardContent sx={{ py: 2.1, px: 2.2 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800 }}>
                  {card.label}
                </Typography>
                <Typography
                  variant="h4"
                  sx={{ mt: 0.6, fontWeight: 900, color: '#111827', letterSpacing: '-0.03em' }}
                >
                  {card.value}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.4 }}>
                  {card.hint}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={1.5}>
        <Grid size={{ xs: 12, xl: 3 }}>
          <Stack spacing={1.5}>
            <Card
              sx={{
                borderRadius: 3,
                border: '1px solid rgba(4, 123, 133, 0.12)',
                boxShadow: '0 10px 28px rgba(15, 23, 42, 0.06)',
              }}
            >
              <CardContent sx={{ py: 2.1, px: 2.2 }}>
                <Typography variant="overline" sx={{ color: '#047b85', fontWeight: 900 }}>
                  Pickup Setup
                </Typography>
                <Typography sx={{ fontWeight: 800, color: '#111827', mt: 0.6 }}>
                  {primaryPickup?.pickup?.addressNickname ||
                    primaryPickup?.pickup?.contactName ||
                    'Primary pickup not found'}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.8 }}>
                  {formatAddress(primaryPickup)}
                </Typography>
                {primaryPickup?.rto ? (
                  <Box sx={{ mt: 1.25 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800 }}>
                      RTO address
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {primaryPickup.rto.addressLine1}, {primaryPickup.rto.city},{' '}
                      {primaryPickup.rto.state} - {primaryPickup.rto.pincode}
                    </Typography>
                  </Box>
                ) : null}
              </CardContent>
            </Card>

            <Card
              sx={{
                borderRadius: 3,
                border: '1px solid rgba(4, 123, 133, 0.12)',
                boxShadow: '0 10px 28px rgba(15, 23, 42, 0.06)',
              }}
            >
              <CardContent sx={{ py: 2.1, px: 2.2 }}>
                <Typography variant="overline" sx={{ color: '#047b85', fontWeight: 900 }}>
                  Supported carriers
                </Typography>
                <Stack direction="row" gap={1} flexWrap="wrap" sx={{ mt: 1 }}>
                  {['Delhivery', 'Xpressbees', 'Shadowfax'].map((carrier) => (
                    <Chip key={carrier} label={carrier} size="small" sx={{ fontWeight: 700 }} />
                  ))}
                </Stack>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1.2 }}>
                  Ekart and Amazon reverse are intentionally blocked in this flow because the
                  courier branches in this repo do not support reverse shipment creation for those
                  carriers.
                </Typography>
              </CardContent>
            </Card>

            <Card
              sx={{
                borderRadius: 3,
                border: '1px solid rgba(4, 123, 133, 0.12)',
                boxShadow: '0 10px 28px rgba(15, 23, 42, 0.06)',
              }}
            >
              <CardContent sx={{ py: 2.1, px: 2.2 }}>
                <Typography variant="overline" sx={{ color: '#047b85', fontWeight: 900 }}>
                  Reverse notes
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.8 }}>
                  Quality check is carrier-specific. Some couriers can inspect at pickup, some at
                  hub, and some skip QC completely. The quote dialog will still validate your
                  wallet balance before confirming the shipment.
                </Typography>
              </CardContent>
            </Card>
          </Stack>
        </Grid>

        <Grid size={{ xs: 12, xl: 9 }}>
          <Stack spacing={1.5}>
            <FilterBar
              fields={filterFields}
              onApply={(applied) => {
                setFilters(applied)
                setPage(1)
              }}
              defaultValues={defaultFilters}
              mode="button"
              buttonLabel="Filters"
              appliedCount={Object.values(filters).filter(Boolean).length}
            />

            {isLoading && !data ? (
              <TableSkeleton title="Loading reverse pickup orders" />
            ) : (
              <Box
                sx={{
                  borderRadius: 3,
                  border: '1px solid rgba(4, 123, 133, 0.12)',
                  overflow: 'hidden',
                  bgcolor: '#fff',
                  boxShadow: '0 10px 28px rgba(15, 23, 42, 0.06)',
                }}
              >
                <DataTable<B2COrder>
                  rows={orders}
                  columns={columns}
                  loading={isFetching}
                  loadingLabel="Refreshing reverse pickup orders..."
                  emptyMessage="No delivered orders are available for reverse pickup."
                  pagination
                  currentPage={page - 1}
                  defaultRowsPerPage={rowsPerPage}
                  totalCount={data?.totalCount || 0}
                  onPageChange={(newPage) => setPage(newPage + 1)}
                  onRowsPerPageChange={(newLimit) => {
                    setRowsPerPage(newLimit)
                    setPage(1)
                  }}
                />
              </Box>
            )}
          </Stack>
        </Grid>
      </Grid>

      {selectedReverseOrder ? (
        <ReverseModal
          open={Boolean(selectedReverseOrder)}
          order={selectedReverseOrder as any}
          onClose={() => setSelectedOrder(null)}
          onConfirm={(payload) => {
            createReverseShipment.mutate(payload, {
              onSuccess: () => {
                setSelectedOrder(null)
              },
            })
          }}
        />
      ) : null}
    </Stack>
  )
}
