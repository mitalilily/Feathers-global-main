import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  Divider,
  FormControlLabel,
  Grid,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { quoteReverse } from '../../../api/returns'
import { fetchWalletBalance } from '../../../api/wallet.api'
import { usePickupAddresses } from '../../../hooks/Pickup/usePickupAddresses'
import { useB2COrdersByUser, useCreateReverseShipment } from '../../../hooks/Orders/useOrders'
import type { B2COrder, HydratedPickup, IAddress } from '../../../types/generic.types'
import { type ReverseFlowRouteState } from './reverseFlow'

const SUPPORTED_REVERSE_CARRIERS = new Set(['delhivery', 'shadowfax', 'xpressbees', 'ekart', 'amazon'])

type ReverseItem = {
  name: string
  sku: string
  price: number
  qty: number
  maxQty: number
  hsn: string
  discount: number
  taxRate: number
}

const packageTypes = ['Document', 'Packet', 'Box', 'Bag']
const reverseReasons = [
  'Customer return',
  'Damaged item',
  'Wrong item delivered',
  'Size or fit issue',
  'Pickup failed earlier',
  'Other',
]

const toTitleCase = (value: string) =>
  value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')

const formatOrderDate = (value?: string | null) => {
  if (!value) return '-'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return String(value)
  return parsed.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

const normalizeWeightToGrams = (weight: number | null | undefined) => {
  const numeric = Number(weight ?? 0)
  if (!Number.isFinite(numeric) || numeric <= 0) return 500
  return numeric > 50 ? Math.round(numeric) : Math.round(numeric * 1000)
}

const slugifyReason = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

const toOrderItems = (order: B2COrder | null): ReverseItem[] =>
  Array.isArray(order?.products)
    ? order.products.map((item, index) => ({
        name: String(item?.productName || `Item ${index + 1}`),
        sku: String(item?.sku || 'NA'),
        price: Number(item?.price || 0),
        qty: Math.max(1, Number(item?.quantity || 1)),
        maxQty: Math.max(1, Number(item?.quantity || 1)),
        hsn: String(item?.hsnCode || ''),
        discount: Number(item?.discount || 0),
        taxRate: Number(item?.taxRate || 0),
      }))
    : []

const getReturnAddress = (pickup: HydratedPickup | null | undefined): IAddress | null =>
  pickup ? (pickup.isRTOSame || !pickup.rto ? pickup.pickup : pickup.rto || pickup.pickup) : null

const getReturnLabel = (pickup: HydratedPickup) => {
  const address = getReturnAddress(pickup)
  return (
    address?.addressNickname ||
    pickup.pickup?.addressNickname ||
    address?.contactName ||
    pickup.pickup?.contactName ||
    'Return location'
  )
}

const formatAddress = (address?: IAddress | null) =>
  [address?.addressLine1, address?.addressLine2, address?.city, address?.state, address?.pincode]
    .filter(Boolean)
    .map((part) => String(part).trim())
    .join(', ')

export default function ReversePickupForm() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const routeState = (location.state || {}) as ReverseFlowRouteState
  const sourceOrderId = searchParams.get('sourceOrderId')
  const createReverseShipment = useCreateReverseShipment()
  const { data: pickupResponse } = usePickupAddresses({ isPickupEnabled: 'active' as unknown as boolean })
  const pickupAddresses = (pickupResponse?.pickupAddresses || []) as HydratedPickup[]
  const primaryPickup = pickupAddresses.find((pickup) => pickup.isPrimary) || pickupAddresses[0] || null

  const [orderQuery, setOrderQuery] = useState('')
  const deferredOrderQuery = useDeferredValue(orderQuery.trim())
  const [itemSearch, setItemSearch] = useState('')
  const [selectedOrder, setSelectedOrder] = useState<B2COrder | null>(null)
  const [selectedReturnPickupId, setSelectedReturnPickupId] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [customerAddress, setCustomerAddress] = useState('')
  const [customerCity, setCustomerCity] = useState('')
  const [customerState, setCustomerState] = useState('')
  const [customerPincode, setCustomerPincode] = useState('')
  const [items, setItems] = useState<ReverseItem[]>([])
  const [reason, setReason] = useState(reverseReasons[0])
  const [notes, setNotes] = useState('')
  const [fragile, setFragile] = useState(false)
  const [packageType, setPackageType] = useState('Box')
  const [shippingMode, setShippingMode] = useState('surface')
  const [weightGrams, setWeightGrams] = useState(500)
  const [lengthCm, setLengthCm] = useState(10)
  const [breadthCm, setBreadthCm] = useState(10)
  const [heightCm, setHeightCm] = useState(10)
  const [quoteState, setQuoteState] = useState({
    loading: false,
    error: '',
    rate: 0,
    wallet: 0,
    eddDays: null as number | null,
    oda: false,
  })

  const { data: deliveredOrdersResponse, isLoading: searchingOrders } = useB2COrdersByUser(1, 8, {
    status: 'delivered',
    search: deferredOrderQuery.length >= 3 ? deferredOrderQuery : undefined,
  })

  const matchingOrders = useMemo(
    () => ((deliveredOrdersResponse?.orders || []) as B2COrder[]),
    [deliveredOrdersResponse?.orders],
  )

  const selectedReturnPickup = useMemo(
    () =>
      pickupAddresses.find((pickup) => pickup.pickupId === selectedReturnPickupId || pickup.id === selectedReturnPickupId) ||
      primaryPickup,
    [pickupAddresses, primaryPickup, selectedReturnPickupId],
  )

  const selectedReturnAddress = useMemo(
    () => getReturnAddress(selectedReturnPickup),
    [selectedReturnPickup],
  )

  const providerKey = String(selectedOrder?.integration_type || '').trim().toLowerCase()
  const isProviderSupported = !selectedOrder || SUPPORTED_REVERSE_CARRIERS.has(providerKey)

  const filteredItems = useMemo(() => {
    const normalizedSearch = itemSearch.trim().toLowerCase()
    if (!normalizedSearch) return items
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(normalizedSearch) || item.sku.toLowerCase().includes(normalizedSearch),
    )
  }, [itemSearch, items])

  const totalSelectedUnits = useMemo(
    () => items.reduce((sum, item) => sum + Number(item.qty || 0), 0),
    [items],
  )

  const selectedOrderSummary = useMemo(
    () =>
      selectedOrder
        ? {
            id: String(selectedOrder.id),
            orderNumber: selectedOrder.order_number,
            awb: selectedOrder.awb_number || '-',
            created: formatOrderDate(selectedOrder.order_date || selectedOrder.created_at),
          }
        : null,
    [selectedOrder],
  )

  const hydrateFromOrder = (order: B2COrder) => {
    setSelectedOrder(order)
    setOrderQuery(order.order_number || String(order.id))
    setCustomerName(order.buyer_name || '')
    setCustomerPhone(order.buyer_phone || '')
    setCustomerEmail(order.buyer_email || '')
    setCustomerAddress(order.address || '')
    setCustomerCity(order.city || '')
    setCustomerState(order.state || '')
    setCustomerPincode(order.pincode || '')
    setItems(toOrderItems(order))
    setWeightGrams(normalizeWeightToGrams(order.weight))
    setLengthCm(Number(order.length || 10))
    setBreadthCm(Number(order.breadth || 10))
    setHeightCm(Number(order.height || 10))
    setShippingMode(String((order as unknown as { shipping_mode?: string })?.shipping_mode || 'surface').toLowerCase())
    setItemSearch('')
    if (primaryPickup && !selectedReturnPickupId) {
      setSelectedReturnPickupId(primaryPickup.pickupId)
    }
  }

  useEffect(() => {
    if (primaryPickup && !selectedReturnPickupId) {
      setSelectedReturnPickupId(primaryPickup.pickupId)
    }
  }, [primaryPickup, selectedReturnPickupId])

  useEffect(() => {
    if (routeState.reverseOrder) {
      hydrateFromOrder(routeState.reverseOrder as B2COrder)
    }
  }, [routeState.reverseOrder])

  useEffect(() => {
    if (!sourceOrderId) return
    const matched = matchingOrders.find((order) => String(order.id) === String(sourceOrderId))
    if (matched) {
      hydrateFromOrder(matched)
    }
  }, [matchingOrders, sourceOrderId])

  useEffect(() => {
    if (!selectedOrder || !selectedReturnAddress || !isProviderSupported) {
      setQuoteState((current) => ({
        ...current,
        rate: 0,
        error: selectedOrder && !isProviderSupported ? 'Reverse pickup is not supported for this courier.' : '',
      }))
      return
    }

    let cancelled = false

    const loadQuote = async () => {
      try {
        setQuoteState((current) => ({ ...current, loading: true, error: '' }))
        const [quoteResponse, walletResponse] = await Promise.all([
          quoteReverse({
            orderId: String(selectedOrder.id),
            weightGrams,
            package_length: lengthCm,
            package_breadth: breadthCm,
            package_height: heightCm,
            shipping_mode: shippingMode,
          }),
          fetchWalletBalance(),
        ])

        if (cancelled) return

        setQuoteState({
          loading: false,
          error: '',
          rate: Number(quoteResponse?.quote?.rate || 0),
          wallet: Number(walletResponse?.data?.balance || 0),
          eddDays: quoteResponse?.quote?.eddDays ?? null,
          oda: Boolean(quoteResponse?.quote?.oda),
        })
      } catch (error: unknown) {
        if (cancelled) return
        const errorRecord = error as {
          response?: { data?: { message?: string } }
          message?: string
        }
        const message =
          error && typeof error === 'object' && 'response' in error
            ? errorRecord?.response?.data?.message || errorRecord?.message || 'Failed to get reverse quote'
            : error instanceof Error
              ? error.message
              : 'Failed to get reverse quote'
        setQuoteState((current) => ({
          ...current,
          loading: false,
          error: message,
          rate: 0,
        }))
      }
    }

    loadQuote()

    return () => {
      cancelled = true
    }
  }, [selectedOrder, selectedReturnAddress, weightGrams, lengthCm, breadthCm, heightCm, shippingMode, isProviderSupported])

  const handleSelectOrder = (order: B2COrder) => {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('sourceOrderId', String(order.id))
    navigate(
      {
        pathname: location.pathname,
        search: `?${nextParams.toString()}`,
      },
        {
          replace: true,
          state: {
            ...routeState,
            reverseOrder: order as unknown as ReverseFlowRouteState['reverseOrder'],
          } satisfies ReverseFlowRouteState,
        },
      )
    hydrateFromOrder(order)
  }

  const updateItemQty = (index: number, nextQty: number) => {
    setItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              qty: Math.max(0, Math.min(item.maxQty, Number.isFinite(nextQty) ? nextQty : item.qty)),
            }
          : item,
      ),
    )
  }

  const estimatedWalletDebit = Number((quoteState.rate * 1.18).toFixed(2))
  const hasInsufficientBalance =
    estimatedWalletDebit > 0 && Number.isFinite(quoteState.wallet) && estimatedWalletDebit > quoteState.wallet

  const canSubmit =
    Boolean(selectedOrder) &&
    Boolean(selectedReturnAddress?.pincode) &&
    isProviderSupported &&
    totalSelectedUnits > 0 &&
    weightGrams >= 50 &&
    lengthCm > 0 &&
    breadthCm > 0 &&
    heightCm > 0 &&
    !quoteState.loading &&
    !quoteState.error &&
    quoteState.rate > 0 &&
    !hasInsufficientBalance &&
    !createReverseShipment.isPending

  const handleSubmit = () => {
    if (!selectedOrder || !selectedReturnPickup || !selectedReturnAddress) return

    const orderItems = items
      .filter((item) => item.qty > 0)
      .map((item) => ({
        name: item.name,
        sku: item.sku,
        qty: item.qty,
        price: item.price,
        hsn: item.hsn,
        discount: item.discount,
        tax_rate: item.taxRate,
      }))

    if (!orderItems.length) return

    const returnContactName =
      selectedReturnAddress.contactName ||
      selectedReturnAddress.addressNickname ||
      selectedReturnPickup.pickup?.contactName ||
      'Return Desk'

    const tags = [
      fragile ? 'fragile_reverse' : '',
      reason ? `reverse_reason=${slugifyReason(reason)}` : '',
    ]
      .filter(Boolean)
      .join(',')

    createReverseShipment.mutate(
      {
        original_order_id: String(selectedOrder.id),
        order_number: `${selectedOrder.order_number || String(selectedOrder.id)}-R`,
        payment_type: 'reverse',
        order_amount: 0,
        order_date: new Date().toISOString(),
        package_weight: Number((weightGrams / 1000).toFixed(3)),
        package_length: lengthCm,
        package_breadth: breadthCm,
        package_height: heightCm,
        package_type: packageType,
        shipping_mode: shippingMode,
        shipping_charges: quoteState.rate,
        prepaid_amount: 0,
        is_rto_different: 'no',
        discount: 0,
        integration_type: selectedOrder.integration_type,
        transaction_fee: 0,
        gift_wrap: 0,
        request_auto_pickup: 'Yes',
        pickup_location_id: selectedReturnPickup.pickupId,
        notes,
        fragile,
        consignee: {
          name: returnContactName,
          address: selectedReturnAddress.addressLine1 || '',
          address_2: selectedReturnAddress.addressLine2 || '',
          city: selectedReturnAddress.city || '',
          state: selectedReturnAddress.state || '',
          pincode: selectedReturnAddress.pincode || '',
          email: selectedReturnAddress.contactEmail || '',
          phone: selectedReturnAddress.contactPhone || '',
        },
        pickup: {
          warehouse_name: customerName || 'Customer Pickup',
          address: customerAddress,
          city: customerCity,
          state: customerState,
          pincode: customerPincode,
          phone: customerPhone,
          name: customerName,
        },
        rto: {
          warehouse_name: getReturnLabel(selectedReturnPickup),
          address: selectedReturnAddress.addressLine1 || '',
          address_2: selectedReturnAddress.addressLine2 || '',
          city: selectedReturnAddress.city || '',
          state: selectedReturnAddress.state || '',
          pincode: selectedReturnAddress.pincode || '',
          phone: selectedReturnAddress.contactPhone || '',
          name: returnContactName,
        },
        order_items: orderItems,
        tags,
      },
      {
        onSuccess: () => {
          if (location.pathname === '/orders/create') {
            navigate('/orders/list?status=pending')
          }
        },
      },
    )
  }

  return (
    <Stack spacing={1.5} sx={{ minHeight: 0 }}>
      <Alert severity="info" sx={{ borderRadius: 3 }}>
        <AlertTitle>Manual DTO flow</AlertTitle>
        Reverse shipments are created from an already delivered forward order. Search by order ID,
        AWB, or reference number, then review customer, return location, item quantities, and box
        details before manifesting the reverse pickup.
      </Alert>

      <Grid container spacing={1.5}>
        <Grid size={{ xs: 12, lg: 8 }}>
          <Card sx={{ borderRadius: 3, border: '1px solid #E5E7EB', boxShadow: '0 10px 28px rgba(15, 23, 42, 0.06)' }}>
            <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
              <Grid container spacing={1.5}>
                <Grid size={{ xs: 12, xl: 7 }}>
                  <Typography sx={{ fontWeight: 800, color: '#0F172A', mb: 0.9 }}>Order ID</Typography>
                  <TextField
                    fullWidth
                    value={orderQuery}
                    onChange={(event) => setOrderQuery(event.target.value)}
                    placeholder="Enter Order ID / Reference Number"
                    helperText="Use a delivered forward order number, AWB, or source reference."
                  />
                </Grid>
                <Grid size={{ xs: 12, xl: 5 }}>
                  <Typography sx={{ fontWeight: 800, color: '#0F172A', mb: 0.9 }}>
                    Customer and Return Location
                  </Typography>
                  <TextField
                    select
                    fullWidth
                    value={selectedReturnPickupId}
                    onChange={(event) => setSelectedReturnPickupId(event.target.value)}
                    placeholder="Select Return Location"
                    helperText="Choose where the reverse shipment should be delivered."
                  >
                    {pickupAddresses.map((pickup) => (
                      <MenuItem key={pickup.id} value={pickup.pickupId}>
                        {getReturnLabel(pickup)}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>
              </Grid>

              {selectedOrderSummary ? (
                <Paper
                  variant="outlined"
                  sx={{
                    mt: 1.5,
                    p: 1.4,
                    borderRadius: 2.5,
                    borderColor: 'rgba(37, 99, 235, 0.22)',
                    bgcolor: 'rgba(239, 246, 255, 0.72)',
                  }}
                >
                  <Stack
                    direction={{ xs: 'column', md: 'row' }}
                    spacing={1}
                    justifyContent="space-between"
                    alignItems={{ xs: 'flex-start', md: 'center' }}
                  >
                    <Stack spacing={0.4}>
                      <Typography sx={{ fontWeight: 800, color: '#0F172A' }}>
                        Source order: {selectedOrderSummary.orderNumber}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        AWB {selectedOrderSummary.awb} | Delivered order date {selectedOrderSummary.created}
                      </Typography>
                    </Stack>
                    <Chip
                      label={toTitleCase(String(selectedOrder?.integration_type || '-'))}
                      size="small"
                      sx={{
                        fontWeight: 700,
                        bgcolor: isProviderSupported ? 'rgba(22, 163, 74, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                        color: isProviderSupported ? '#166534' : '#B91C1C',
                      }}
                    />
                  </Stack>
                </Paper>
              ) : null}

              {deferredOrderQuery.length >= 3 && !selectedOrder && matchingOrders.length > 0 ? (
                <Stack spacing={0.9} sx={{ mt: 1.5 }}>
                  {matchingOrders.map((order) => (
                    <Paper
                      key={order.id}
                      variant="outlined"
                      sx={{
                        p: 1.15,
                        borderRadius: 2,
                        borderColor: 'rgba(148, 163, 184, 0.35)',
                      }}
                    >
                      <Stack
                        direction={{ xs: 'column', md: 'row' }}
                        spacing={1}
                        justifyContent="space-between"
                        alignItems={{ xs: 'flex-start', md: 'center' }}
                      >
                        <Stack spacing={0.35}>
                          <Typography sx={{ fontWeight: 700, color: '#111827' }}>
                            {order.order_number}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            {order.buyer_name} | {order.city}, {order.state} - {order.pincode}
                          </Typography>
                        </Stack>
                        <Button
                          variant="outlined"
                          onClick={() => handleSelectOrder(order)}
                          sx={{ textTransform: 'none', fontWeight: 700 }}
                        >
                          Use Order
                        </Button>
                      </Stack>
                    </Paper>
                  ))}
                </Stack>
              ) : null}

              {deferredOrderQuery.length >= 3 && !selectedOrder && !searchingOrders && matchingOrders.length === 0 ? (
                <Alert severity="warning" sx={{ mt: 1.5, borderRadius: 2.5 }}>
                  No delivered forward order matched that ID or reference.
                </Alert>
              ) : null}
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, lg: 4 }}>
          <Card sx={{ borderRadius: 3, border: '1px solid #E5E7EB', boxShadow: '0 10px 28px rgba(15, 23, 42, 0.06)' }}>
            <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
              <Typography sx={{ fontWeight: 800, color: '#0F172A', mb: 1.1 }}>Box Details</Typography>
              <Stack spacing={1.25}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Chip label="Box 1" size="small" sx={{ fontWeight: 700 }} />
                  <Typography variant="caption" color="text.secondary">
                    Single-box manifest in current flow
                  </Typography>
                </Stack>

                <TextField select label="Package Type" value={packageType} onChange={(event) => setPackageType(event.target.value)}>
                  {packageTypes.map((option) => (
                    <MenuItem key={option} value={option}>
                      {option}
                    </MenuItem>
                  ))}
                </TextField>

                <TextField select label="Shipping Mode" value={shippingMode} onChange={(event) => setShippingMode(event.target.value)}>
                  <MenuItem value="surface">Surface</MenuItem>
                  <MenuItem value="express">Express</MenuItem>
                </TextField>

                <Grid container spacing={1}>
                  <Grid size={{ xs: 4 }}>
                    <TextField
                      fullWidth
                      label="L"
                      type="number"
                      value={lengthCm}
                      onChange={(event) => setLengthCm(Number(event.target.value || 0))}
                    />
                  </Grid>
                  <Grid size={{ xs: 4 }}>
                    <TextField
                      fullWidth
                      label="B"
                      type="number"
                      value={breadthCm}
                      onChange={(event) => setBreadthCm(Number(event.target.value || 0))}
                    />
                  </Grid>
                  <Grid size={{ xs: 4 }}>
                    <TextField
                      fullWidth
                      label="H"
                      type="number"
                      value={heightCm}
                      onChange={(event) => setHeightCm(Number(event.target.value || 0))}
                    />
                  </Grid>
                </Grid>

                <TextField
                  label="Package Weight (gm)"
                  type="number"
                  value={weightGrams}
                  onChange={(event) => setWeightGrams(Number(event.target.value || 0))}
                  helperText="Reverse quote uses this weight along with the entered dimensions."
                />

                <Divider />

                <Stack spacing={0.65}>
                  <Typography variant="body2" color="text.secondary">
                    Reverse freight
                  </Typography>
                  <Typography sx={{ fontSize: '1.4rem', fontWeight: 900, color: '#0F172A' }}>
                    Rs. {quoteState.rate.toFixed(2)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Estimated wallet debit with GST: Rs. {estimatedWalletDebit.toFixed(2)}
                  </Typography>
                  <Typography variant="body2" color={hasInsufficientBalance ? 'error.main' : 'text.secondary'}>
                    Wallet balance: Rs. {quoteState.wallet.toFixed(2)}
                  </Typography>
                  {quoteState.eddDays !== null ? (
                    <Typography variant="body2" color="text.secondary">
                      Estimated return delivery: {quoteState.eddDays} days
                    </Typography>
                  ) : null}
                  {quoteState.oda ? (
                    <Typography variant="body2" color="warning.main">
                      ODA area detected for this reverse route.
                    </Typography>
                  ) : null}
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={1.5}>
        <Grid size={{ xs: 12, lg: 8 }}>
          <Card sx={{ borderRadius: 3, border: '1px solid #E5E7EB', boxShadow: '0 10px 28px rgba(15, 23, 42, 0.06)' }}>
            <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
              <Typography sx={{ fontWeight: 800, color: '#0F172A', mb: 1.1 }}>Item Details</Typography>
              <TextField
                fullWidth
                placeholder="Enter at least 3 letters to search by product name / SKU code"
                value={itemSearch}
                onChange={(event) => setItemSearch(event.target.value)}
                sx={{ mb: 1.5 }}
              />

              {filteredItems.length > 0 ? (
                <Stack spacing={1}>
                  {filteredItems.map((item) => {
                    const sourceIndex = items.findIndex(
                      (candidate) => candidate.name === item.name && candidate.sku === item.sku,
                    )

                    return (
                      <Paper key={`${item.sku}-${item.name}`} variant="outlined" sx={{ p: 1.2, borderRadius: 2 }}>
                        <Grid container spacing={1} alignItems="center">
                          <Grid size={{ xs: 12, md: 5 }}>
                            <Typography sx={{ fontWeight: 700, color: '#111827' }}>{item.name}</Typography>
                            <Typography variant="body2" color="text.secondary">
                              SKU {item.sku} | Max qty {item.maxQty}
                            </Typography>
                          </Grid>
                          <Grid size={{ xs: 6, md: 3 }}>
                            <TextField
                              fullWidth
                              label="Quantity"
                              type="number"
                              value={item.qty}
                              onChange={(event) => updateItemQty(sourceIndex, Number(event.target.value || 0))}
                              inputProps={{ min: 0, max: item.maxQty }}
                            />
                          </Grid>
                          <Grid size={{ xs: 6, md: 4 }}>
                            <Typography sx={{ fontWeight: 700, color: '#111827' }}>
                              Rs. {Number(item.price || 0).toFixed(2)}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              HSN {item.hsn || '-'}
                            </Typography>
                          </Grid>
                        </Grid>
                      </Paper>
                    )
                  })}
                </Stack>
              ) : (
                <Box
                  sx={{
                    py: 5,
                    borderRadius: 2.5,
                    border: '1px dashed #CBD5E1',
                    bgcolor: '#F8FAFC',
                    textAlign: 'center',
                  }}
                >
                  <Typography sx={{ fontWeight: 700, color: '#475569' }}>
                    {selectedOrder ? 'No matching items found' : 'No source order selected yet'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.4 }}>
                    Select a delivered order to preload the returnable items.
                  </Typography>
                </Box>
              )}

              <FormControlLabel
                sx={{ mt: 1.2 }}
                control={<Checkbox checked={fragile} onChange={(event) => setFragile(event.target.checked)} />}
                label="My package contains fragile items"
              />
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, lg: 4 }}>
          <Card sx={{ borderRadius: 3, border: '1px solid #E5E7EB', boxShadow: '0 10px 28px rgba(15, 23, 42, 0.06)' }}>
            <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
              <Typography sx={{ fontWeight: 800, color: '#0F172A', mb: 1.1 }}>Customer Pickup Details</Typography>
              <Stack spacing={1.1}>
                <TextField label="Customer Name" value={customerName} onChange={(event) => setCustomerName(event.target.value)} />
                <TextField label="Customer Phone" value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} />
                <TextField label="Customer Email" value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} />
                <TextField label="Address" value={customerAddress} onChange={(event) => setCustomerAddress(event.target.value)} multiline minRows={2} />
                <Grid container spacing={1}>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <TextField fullWidth label="City" value={customerCity} onChange={(event) => setCustomerCity(event.target.value)} />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <TextField fullWidth label="State" value={customerState} onChange={(event) => setCustomerState(event.target.value)} />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <TextField fullWidth label="Pincode" value={customerPincode} onChange={(event) => setCustomerPincode(event.target.value)} />
                  </Grid>
                </Grid>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={1.5}>
        <Grid size={{ xs: 12, lg: 8 }}>
          <Card sx={{ borderRadius: 3, border: '1px solid #E5E7EB', boxShadow: '0 10px 28px rgba(15, 23, 42, 0.06)' }}>
            <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
              <Typography sx={{ fontWeight: 800, color: '#0F172A', mb: 1.1 }}>Other Details</Typography>
              <Stack spacing={1.15}>
                <TextField select label="Reason for Return" value={reason} onChange={(event) => setReason(event.target.value)}>
                  {reverseReasons.map((option) => (
                    <MenuItem key={option} value={option}>
                      {option}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  label="Notes for field executive"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  multiline
                  minRows={3}
                  placeholder="Add pickup instructions, landmark notes, or return-specific guidance."
                />
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, lg: 4 }}>
          <Card sx={{ borderRadius: 3, border: '1px solid #E5E7EB', boxShadow: '0 10px 28px rgba(15, 23, 42, 0.06)' }}>
            <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
              <Typography sx={{ fontWeight: 800, color: '#0F172A', mb: 1 }}>Return Destination</Typography>
              {selectedReturnAddress ? (
                <Stack spacing={0.7}>
                  <Typography sx={{ fontWeight: 700, color: '#111827' }}>
                    {getReturnLabel(selectedReturnPickup as HydratedPickup)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {formatAddress(selectedReturnAddress) || 'Return address is incomplete'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Contact: {selectedReturnAddress.contactName || '-'} | {selectedReturnAddress.contactPhone || '-'}
                  </Typography>
                </Stack>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  Add a pickup or RTO location before creating reverse orders.
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {!isProviderSupported && selectedOrder ? (
        <Alert severity="error" sx={{ borderRadius: 2.5 }}>
          Reverse pickup is not supported for {toTitleCase(selectedOrder.integration_type)} yet.
        </Alert>
      ) : null}

      {hasInsufficientBalance ? (
        <Alert severity="error" sx={{ borderRadius: 2.5 }}>
          Insufficient wallet balance. Required Rs. {estimatedWalletDebit.toFixed(2)}, available Rs.{' '}
          {quoteState.wallet.toFixed(2)}.
        </Alert>
      ) : null}

      {quoteState.error ? (
        <Alert severity="warning" sx={{ borderRadius: 2.5 }}>
          {quoteState.error}
        </Alert>
      ) : null}

      <Stack direction="row" justifyContent="flex-end" spacing={1.25}>
        <Button variant="outlined" onClick={() => navigate(-1)} sx={{ textTransform: 'none', fontWeight: 700 }}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={!canSubmit}
          sx={{ textTransform: 'none', fontWeight: 800, px: 2.5 }}
        >
          {createReverseShipment.isPending ? 'Creating Reverse Order...' : 'Create & Manifest Reverse Order'}
        </Button>
      </Stack>
    </Stack>
  )
}
