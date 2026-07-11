import {
  Alert,
  AlertTitle,
  Avatar,
  Box,
  Button,
  CircularProgress,
  Divider,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
  Popover,
  Stack,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import { useQueryClient } from '@tanstack/react-query'
import { saveAs } from 'file-saver'
import moment from 'moment'
import { useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  fetchB2COrdersByUser,
  downloadBulkB2CLabelsService,
  fetchOrdersForCsvExport,
  generateManifestService,
} from '../../../api/order.service'
import { fetchTracking } from '../../../api/tracking.service'
import { useAllCouriersWithDetails } from '../../../hooks/Integrations/useCouriers'
import {
  useB2COrdersByUser,
  useCancelShipment,
  useCreateReverseShipment,
  useRegenerateOrderDocuments,
  useRetryFailedManifest,
} from '../../../hooks/Orders/useOrders'
import { usePickupAddresses } from '../../../hooks/Pickup/usePickupAddresses'
import { usePresignedDownloadMutation } from '../../../hooks/Uploads/usePresignedDownloadUrls'
import useEmployeePermissions from '../../../hooks/User/useEmployeePermissions'
import { useKycVerification } from '../../../hooks/User/useKycVerification'
import type { B2COrder } from '../../../types/generic.types'
import { FilterBar, type FilterField } from '../../FilterBar'
import StatusChip from '../../UI/chip/StatusChip'
import CustomDrawer from '../../UI/drawer/CustomDrawer'
import CustomSelect from '../../UI/inputs/CustomSelect'
import { SmartTabs } from '../../UI/tab/Tabs'
import DataTable, { type Column } from '../../UI/table/DataTable'
import TableSkeleton from '../../UI/table/TableSkeleton'
import { toast } from '../../UI/Toast'

import { TextField } from '@mui/material'
import Papa from 'papaparse'
import { FiDownload, FiFileText, FiPlusCircle, FiUploadCloud } from 'react-icons/fi'
import {
  MdAssignment,
  MdCancel,
  MdDownload,
  MdKeyboardReturn,
  MdLocalOffer,
  MdLocalShipping,
  MdMoreVert,
  MdOutlineHelpCenter,
  MdReceipt,
  MdReplay,
  MdSync,
  MdVisibility,
} from 'react-icons/md'
import { courierLogos, defaultLogo } from '../../../utils/constants'
import { getClientAwbTrackingPath } from '../../../utils/awb'
import {
  downloadClientOrdersCsv,
  CLIENT_ORDER_ADDED_HEADERS,
  CLIENT_ORDER_BASE_HEADERS,
} from '../../../utils/orderCsvExport'
import { SupportTicketForm } from '../../support/SupportTicketForm'
import {
  downloadFile,
  getActionableErrorMessage,
  getB2CManifestIdentifier,
  getB2CManifestProvider,
  getDocumentReference,
  getDownloadFileName,
  getOrderDocumentLabel,
  isB2CManifestEligible,
  isHttpUrl,
  summarizeMessages,
  summarizeOrderNumbers,
  type DocumentEntry,
  type DocumentType,
} from '../bulkActionUtils'
import ManifestPickupScheduleDialog from '../ManifestPickupScheduleDialog'
import { OrderExpandedRow } from '../OrderExpandedRow'
import ReverseModal from '../reverse/ReverseModal'
import BulkOrderCourierDrawer from '../BulkOrderCourierDrawer'
import SourceOrderCourierDrawer from '../SourceOrderCourierDrawer'
import B2COrderFormSteps from './B2COrderForm'
import BulkB2CUpload from './BulkB2CUpload'

/* ───────────── Types ───────────── */
interface OrderFilters {
  status?: string
  sortBy?: 'created_at'
  sortOrder?: 'asc' | 'desc'
  type?: string
  courier?: string
  warehouse?: string
  productQuery?: string
  fromDate?: string
  toDate?: string
  search?: string
}

type BulkFeedback = {
  severity: 'info' | 'success' | 'error' | 'warning'
  title: string
  message: string
}

type PickupSchedulePayload = {
  pickup_date: string
  pickup_time: string
  pickup_location: string
  expected_package_count: number
}

const getDefaultPickupDateInput = () => new Date().toISOString().split('T')[0]

const getDefaultPickupTimeInput = () => {
  const nextHour = new Date(Date.now() + 60 * 60 * 1000)
  return `${String(nextHour.getHours()).padStart(2, '0')}:${String(nextHour.getMinutes()).padStart(2, '0')}`
}

const parsePickupDetails = (value: unknown) => {
  if (!value) return {}
  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch {
      return {}
    }
  }
  return value as Record<string, unknown>
}

/* ───────────── Status Color Mapping ───────────── */
const getManifestPickupLocation = (order: B2COrder) => {
  const details = parsePickupDetails(order.pickup_details)
  return String(details?.warehouse_name || order.pickup_location_id || '').trim()
}

const getManifestGroupKey = (order: B2COrder) => {
  const providerKey = getB2CManifestProvider(order)
  if (providerKey !== 'delhivery') return providerKey

  return `${providerKey}:${getManifestPickupLocation(order).toLowerCase()}`
}

const getProviderFromManifestGroupKey = (groupKey: string) => groupKey.split(':')[0] || groupKey

const isMarketplaceSourceOrder = (order: B2COrder) => {
  const integrationType = String(order.integration_type || '')
    .trim()
    .toLowerCase()
  const localOrderId = String(order.order_id || '')
    .trim()
    .toLowerCase()
  return (
    ['shopify', 'woocommerce'].includes(integrationType) ||
    localOrderId.startsWith('shopify_') ||
    localOrderId.startsWith('woocommerce_')
  )
}

export const statusColorMap: Record<string, 'success' | 'pending' | 'error' | 'info'> = {
  pending: 'pending',
  booked: 'info',
  manifest_failed: 'error',
  pickup_initiated: 'pending',
  shipment_created: 'info', // legacy
  in_transit: 'pending',
  out_for_delivery: 'pending',
  delivered: 'success',
  cancelled: 'error',
  ndr: 'error',
  rto: 'error',
  rto_in_transit: 'pending',
  rto_delivered: 'info',
  cancellation_requested: 'info',
  manifest_generated: 'info', // legacy
}

const documentGenerationStatuses = new Set([
  'booked',
  'shipment_created',
  'pickup_initiated',
  'in_transit',
  'out_for_delivery',
  'delivered',
  'ndr',
  'undelivered',
  'rto',
  'rto_in_transit',
  'rto_delivered',
])

const actionMenuItemSx = {
  minHeight: 38,
  px: 1.25,
  py: 0.75,
  gap: 0.75,
  color: 'text.primary',
  '&:hover': {
    bgcolor: 'rgba(232, 85, 0, 0.06)',
  },
  '&.Mui-disabled': {
    opacity: 0.48,
  },
}

const actionMenuDangerItemSx = {
  ...actionMenuItemSx,
  color: 'error.main',
  '& .MuiListItemIcon-root': {
    color: 'error.main',
  },
}

const actionMenuIconSx = {
  minWidth: 28,
  color: 'text.secondary',
  '& svg': {
    fontSize: 18,
  },
}

/* ───────────── Shipping Statuses ───────────── */
const shippingStatusMap: Record<string, string> = {
  pending: 'Pending',
  booked: 'Booked',
  manifest_failed: 'Manifest Failed',
  pickup_initiated: 'Pending Pickup',
  shipment_created: 'Shipment Created',
  in_transit: 'In Transit',
  out_for_delivery: 'Out For Delivery',
  delivered: 'Delivered',
  ndr: 'NDR',
  rto: 'RTO Initiated',
  rto_in_transit: 'RTO In Transit',
  rto_delivered: 'RTO Delivered',
  cancellation_requested: 'Cancellation Requested',
  cancelled: 'Cancelled',
}

const B2COrdersList = () => {
  const navigate = useNavigate()
  const theme = useTheme()
  const isXs = useMediaQuery(theme.breakpoints.down('sm')) // mobile
  const isSm = useMediaQuery(theme.breakpoints.between('sm', 'md')) // tablet
  const isMd = useMediaQuery(theme.breakpoints.between('md', 'lg')) // small desktop
  const isLgUp = useMediaQuery(theme.breakpoints.up('lg')) // large desktop

  let drawerWidth: string | number = '100%' // default full width
  if (isXs)
    drawerWidth = '100%' // mobile full width
  else if (isSm)
    drawerWidth = '100%' // tablets
  else if (isMd)
    drawerWidth = '98%' // small desktops
  else if (isLgUp) drawerWidth = '98%' // large desktop fixed width
  const [page, setPage] = useState(1)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerMode, setDrawerMode] = useState<'single' | 'bulk'>('single')
  const [rowsPerPage, setRowsPerPage] = useState(10)
  const [selectedOrderIds, setSelectedOrderIds] = useState<Array<B2COrder['id']>>([])
  const [downloadingDocumentType, setDownloadingDocumentType] = useState<DocumentType | null>(null)
  const [bulkManifesting, setBulkManifesting] = useState(false)
  const [manifestingOrderId, setManifestingOrderId] = useState<string | null>(null)
  const [retryingOrderId, setRetryingOrderId] = useState<string | null>(null)
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null)
  const [trackingOrderId, setTrackingOrderId] = useState<string | null>(null)
  const [actionMenuAnchor, setActionMenuAnchor] = useState<HTMLElement | null>(null)
  const [activeActionOrderId, setActiveActionOrderId] = useState<B2COrder['id'] | null>(null)
  const [detailsOrder, setDetailsOrder] = useState<B2COrder | null>(null)
  const [documentGenerationRef, setDocumentGenerationRef] = useState<string | null>(null)
  const [exportingCsv, setExportingCsv] = useState(false)
  const [bulkFeedback, setBulkFeedback] = useState<BulkFeedback | null>(null)
  const [filters, setFilters] = useState<OrderFilters>({
    status: '',
    sortBy: 'created_at',
    sortOrder: 'desc',
  })
  const [selectedTab, setSelectedTab] = useState<string>('')
  const [pickupDialogOpen, setPickupDialogOpen] = useState(false)
  const [pickupDialogTitle, setPickupDialogTitle] = useState('Confirm pickup schedule')
  const [pickupDialogDescription, setPickupDialogDescription] = useState('')
  const [pickupDialogDate, setPickupDialogDate] = useState(getDefaultPickupDateInput())
  const [pickupDialogTime, setPickupDialogTime] = useState(getDefaultPickupTimeInput())
  const [pickupDialogLocation, setPickupDialogLocation] = useState('')
  const [pickupDialogPackageCount, setPickupDialogPackageCount] = useState(1)
  const [ticketDialogOpen, setTicketDialogOpen] = useState(false)
  const [courierSelectionOrder, setCourierSelectionOrder] = useState<B2COrder | null>(null)
  const [bulkCourierSelectionOpen, setBulkCourierSelectionOpen] = useState(false)
  const [selectedWarehouse, setSelectedWarehouse] = useState<string | null>(null)
  const [downloadingByWarehouse, setDownloadingByWarehouse] = useState(false)
  const [warehousePopoverAnchor, setWarehousePopoverAnchor] = useState<HTMLElement | null>(null)
  const [warehouseFromDate, setWarehouseFromDate] = useState('')
  const [warehouseToDate, setWarehouseToDate] = useState(getDefaultPickupDateInput())
  const pickupDialogResolverRef = useRef<((value: PickupSchedulePayload | null) => void) | null>(
    null,
  )
  const warehouseSelectorRef = useRef<HTMLDivElement>(null)

  const effectiveFilters: OrderFilters = {
    ...filters,
    status: selectedTab || undefined,
    sortBy: filters.sortBy || 'created_at',
    sortOrder: filters.sortOrder || 'desc',
  }

  const { data, isLoading, isFetching, isError } = useB2COrdersByUser(
    page,
    rowsPerPage,
    effectiveFilters,
  )
  const { mutateAsync: retryFailedManifest } = useRetryFailedManifest()
  const { mutateAsync: regenerateDocuments, isPending: regeneratingDocuments } =
    useRegenerateOrderDocuments()
  const queryClient = useQueryClient()
  const { mutateAsync: presignDownloads } = usePresignedDownloadMutation()
  const {
    canAddReturnOrders,
    canCancelOrders,
    canExportOrders,
    canViewCustomerDetails,
    canViewReturnOrders,
  } = useEmployeePermissions()
  const { data: couriers } = useAllCouriersWithDetails()
  const { data: warehouses } = usePickupAddresses()
  const { mutateAsync: cancelShipment } = useCancelShipment()
  const { mutate: createReverse } = useCreateReverseShipment()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [reverseOrder, setReverseOrder] = useState<any | null>(null)
  const orders: B2COrder[] = data?.orders || []
  const selectedOrders: B2COrder[] = orders.filter((order) => selectedOrderIds.includes(order.id))
  const manifestValidationMessage =
    selectedOrders.length === 0
      ? 'Select orders to start a bulk action.'
      : selectedOrders.some((order) => !isB2CManifestEligible(order))
        ? 'Some selected orders are not ready for manifest yet.'
        : ''

  const clearSelection = () => {
    setSelectedOrderIds([])
  }

  const handleActionMenuOpen = (event: MouseEvent<HTMLElement>, orderId: B2COrder['id']) => {
    event.stopPropagation()
    setActionMenuAnchor(event.currentTarget)
    setActiveActionOrderId(orderId)
  }

  const handleActionMenuClose = () => {
    setActionMenuAnchor(null)
    setActiveActionOrderId(null)
  }

  const runActionFromMenu = (
    event: MouseEvent<HTMLElement>,
    action: () => void | Promise<void>,
  ) => {
    event.stopPropagation()
    handleActionMenuClose()
    void action()
  }

  const handleViewDetails = (order: B2COrder) => {
    setDetailsOrder(order)
  }

  const handleTrackShipment = (order: B2COrder) => {
    const awb = String(order.awb_number || '').trim()
    if (!awb) {
      toast.open({
        message: 'AWB number is not available for this order.',
        severity: 'info',
      })
      return
    }
    navigate(getClientAwbTrackingPath(awb))
  }

  const requestDelhiveryPickupSchedule = (ordersForPickup: B2COrder[], label: string) =>
    new Promise<PickupSchedulePayload | null>((resolve) => {
      const details = parsePickupDetails(ordersForPickup[0]?.pickup_details)
      const initialDate =
        typeof details?.pickup_date === 'string' && details.pickup_date.trim()
          ? details.pickup_date.slice(0, 10)
          : getDefaultPickupDateInput()
      const initialTimeRaw =
        typeof details?.pickup_time === 'string' && details.pickup_time.trim()
          ? details.pickup_time.trim()
          : getDefaultPickupTimeInput()
      const initialPickupLocation = getManifestPickupLocation(ordersForPickup[0])

      pickupDialogResolverRef.current = resolve
      setPickupDialogTitle('Confirm Pickup Before Manifest')
      setPickupDialogDescription(label)
      setPickupDialogDate(initialDate)
      setPickupDialogTime(initialTimeRaw.slice(0, 5))
      setPickupDialogLocation(initialPickupLocation)
      setPickupDialogPackageCount(Math.max(1, ordersForPickup.length))
      setPickupDialogOpen(true)
    })

  const closePickupDialog = (value: PickupSchedulePayload | null) => {
    setPickupDialogOpen(false)
    pickupDialogResolverRef.current?.(value)
    pickupDialogResolverRef.current = null
  }

  const handleSyncLiveTracking = async (order: B2COrder) => {
    if (!order.awb_number) {
      toast.open({
        message: 'AWB is required to sync live status.',
        severity: 'error',
      })
      return
    }

    setTrackingOrderId(String(order.id))
    try {
      const tracking = await fetchTracking({ awb: order.awb_number })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['b2cOrdersByUser'] }),
        queryClient.invalidateQueries({ queryKey: ['orders'] }),
      ])
      toast.open({
        message: `Live status synced: ${tracking.status || 'updated'}`,
        severity: 'success',
      })
    } catch (error) {
      const message = getActionableErrorMessage(error, 'Unable to sync live tracking status.')
      toast.open({ message, severity: 'error' })
    } finally {
      setTrackingOrderId(null)
    }
  }

  /* ───────────── Handlers ───────────── */
  const handleGenerateManifest = async (order: B2COrder) => {
    const manifestRef = getB2CManifestIdentifier(order)
    if (!manifestRef) {
      const message = `Manifest cannot be started for ${order.order_number} yet.`
      setBulkFeedback({
        severity: 'error',
        title: 'Manifest unavailable',
        message,
      })
      toast.open({ message, severity: 'error' })
      return
    }
    setManifestingOrderId(String(order.id))
    try {
      const providerKey = getB2CManifestProvider(order)
      const pickupSchedule =
        providerKey === 'delhivery'
          ? await requestDelhiveryPickupSchedule(
              [order],
              `Set the pickup date and time for ${order.order_number} before generating the manifest.`,
            )
          : null

      if (providerKey === 'delhivery' && !pickupSchedule) {
        setBulkFeedback({
          severity: 'info',
          title: 'Manifest cancelled',
          message: `Manifest was cancelled for ${order.order_number}.`,
        })
        return
      }

      setBulkFeedback({
        severity: 'info',
        title: 'Manifest in progress',
        message: `Processing ${order.order_number}.`,
      })
      const response = await generateManifestService({
        awbs: [manifestRef],
        type: 'b2c',
        ...(pickupSchedule || {}),
      })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['b2cOrdersByUser'] }),
        queryClient.invalidateQueries({ queryKey: ['orders'] }),
      ])
      const successMessage = `Manifest completed for ${order.order_number}.`
      const warningSummary = summarizeMessages(response.warnings || [])
      if (warningSummary) {
        const warningMessage = `${successMessage} ${warningSummary}`
        setBulkFeedback({
          severity: 'warning',
          title: 'Manifest completed with warnings',
          message: warningMessage,
        })
        toast.open({ message: warningMessage, severity: 'info' })
        return
      }
      setBulkFeedback({
        severity: 'success',
        title: 'Manifest completed',
        message: successMessage,
      })
      toast.open({ message: successMessage, severity: 'success' })
    } catch (error) {
      console.error('Manifest failed for order:', order.order_number, error)
      const errorMessage = getActionableErrorMessage(
        error,
        `Manifest failed for ${order.order_number}.`,
      )
      setBulkFeedback({
        severity: 'error',
        title: 'Manifest failed',
        message: `${order.order_number}: ${errorMessage}`,
      })
      toast.open({
        message: `${order.order_number}: ${errorMessage}`,
        severity: 'error',
      })
    } finally {
      setManifestingOrderId((current) => (current === String(order.id) ? null : current))
    }
  }

  const handleRetryManifest = async (order: B2COrder) => {
    if (!order.id) return
    setRetryingOrderId(String(order.id))
    try {
      await retryFailedManifest(String(order.id))
    } finally {
      setRetryingOrderId((current) => (current === String(order.id) ? null : current))
    }
  }

  const handleGenerateOrderDocument = async (order: B2COrder, type: 'label' | 'invoice') => {
    const orderId = String(order.id || '').trim()
    if (!orderId) {
      toast.open({
        message: 'Order identifier is not available.',
        severity: 'error',
      })
      return
    }

    if (!isDocumentGenerationReady(order)) {
      toast.open({
        message: 'Generate the manifest before creating label or invoice documents.',
        severity: 'info',
      })
      return
    }

    const documentRef = `${order.id}-${type}`
    try {
      setDocumentGenerationRef(documentRef)
      await regenerateDocuments({
        orderId,
        regenerateLabel: type === 'label',
        regenerateInvoice: type === 'invoice',
      })
    } catch (error) {
      console.error(`Failed to generate ${type} for order:`, order.order_number, error)
    } finally {
      setDocumentGenerationRef((current) => (current === documentRef ? null : current))
    }
  }

  const handleCancelOrder = async (order: B2COrder) => {
    if (!order.id) return
    setCancellingOrderId(String(order.id))
    try {
      await cancelShipment(String(order.id))
    } finally {
      setCancellingOrderId((current) => (current === String(order.id) ? null : current))
    }
  }

  const handleApplyFilters = (appliedFilters: OrderFilters) => {
    // Merge while preserving current status unless explicitly set
    setFilters((prev) => ({
      ...prev,
      ...appliedFilters,
      status: appliedFilters.status !== undefined ? appliedFilters.status : prev.status,
      sortBy: appliedFilters.sortBy !== undefined ? appliedFilters.sortBy : prev.sortBy,
      sortOrder: appliedFilters.sortOrder !== undefined ? appliedFilters.sortOrder : prev.sortOrder,
    }))
    setPage(1)
    clearSelection()
    setBulkFeedback(null)
  }

  const { checkKycBeforeAction } = useKycVerification()

  const handleExportCSV = async () => {
    if (exportingCsv) return

    setExportingCsv(true)
    try {
      const exportOrders = await fetchOrdersForCsvExport('b2c', effectiveFilters)
      if (!exportOrders.length) {
        toast.open({ message: 'No orders to export', severity: 'warning' })
        return
      }

      downloadClientOrdersCsv(exportOrders, 'b2c')
      toast.open({
        message: `Exported ${exportOrders.length} B2C orders with ${CLIENT_ORDER_ADDED_HEADERS.length} added columns.`,
        severity: 'success',
      })
      console.info('B2C CSV export columns', {
        previousLastColumn: CLIENT_ORDER_BASE_HEADERS[CLIENT_ORDER_BASE_HEADERS.length - 1],
        addedColumns: CLIENT_ORDER_ADDED_HEADERS,
        newLastColumn: CLIENT_ORDER_ADDED_HEADERS[CLIENT_ORDER_ADDED_HEADERS.length - 1],
      })
    } catch (error) {
      const message = getActionableErrorMessage(error, 'Failed to export orders.')
      toast.open({ message, severity: 'error' })
    } finally {
      setExportingCsv(false)
    }
    if (Date.now() < 0) {
      if (!orders.length) {
        toast.open({ message: 'No orders to export', severity: 'warning' })
        return
      }

      const csvData = orders.map((order) => ({
        'Order #': order.order_number || order.id,
        Type: order.order_type || 'B2C',
        'Buyer Name': order.buyer_name || '—',
        City: order.city || '—',
        State: order.state || '—',
        Amount: `₹${Number(order.order_amount ?? 0).toFixed(2)}`,
        Status: order.order_status || '—',
        'Created At': moment(order.created_at).format('DD MMM YYYY, hh:mm A'),
      }))

      const csv = Papa.unparse(csvData)
      const blob = new Blob([csv], { type: 'text/csv' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `b2c-orders-${new Date().toISOString().split('T')[0]}.csv`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
      toast.open({
        message: 'Orders exported successfully',
        severity: 'success',
      })
    }
  }

  const handleCreateB2COrder = () => {
    checkKycBeforeAction(() => {
      setDrawerMode('single')
      setDrawerOpen(true)
    })
  }

  const handleOpenBulkUpload = () => {
    checkKycBeforeAction(() => {
      setDrawerMode('bulk')
      setDrawerOpen(true)
    })
  }

  const handleTabChange = (newValue: string) => {
    setSelectedTab(newValue)
    setPage(1)
    clearSelection()
    setBulkFeedback(null)
    setFilters((prev) => ({
      ...prev,
      sortBy: prev.sortBy || 'created_at',
      sortOrder: prev.sortOrder || 'desc',
    }))

    // Keep status filtering local; do not sync status to URL params.
  }

  const handleBulkManifest = async () => {
    if (!selectedOrders.length) {
      const message = 'Select eligible orders to manifest.'
      setBulkFeedback({
        severity: 'error',
        title: 'No orders selected',
        message,
      })
      toast.open({ message, severity: 'error' })
      return
    }

    if (manifestValidationMessage) {
      setBulkFeedback({
        severity: 'error',
        title: 'Manifest unavailable',
        message: manifestValidationMessage,
      })
      toast.open({ message: manifestValidationMessage, severity: 'error' })
      return
    }

    setBulkManifesting(true)
    setBulkFeedback({
      severity: 'info',
      title: 'Manifest in progress',
      message: `Processing ${selectedOrders.length} selected order(s).`,
    })

    try {
      const manifestGroups = selectedOrders.reduce<Record<string, B2COrder[]>>((groups, order) => {
        const manifestIdentifier = getB2CManifestIdentifier(order)
        if (!manifestIdentifier) return groups

        const groupKey = getManifestGroupKey(order)
        if (!groups[groupKey]) groups[groupKey] = []
        groups[groupKey].push(order)
        return groups
      }, {})

      const failedOrders: B2COrder[] = []
      const failureReasons: string[] = []
      const warningMessages: string[] = []
      let successCount = 0

      for (const [groupKey, providerOrders] of Object.entries(manifestGroups)) {
        const providerKey = getProviderFromManifestGroupKey(groupKey)
        const identifiers = providerOrders
          .map((order) => getB2CManifestIdentifier(order))
          .filter((value): value is string => Boolean(value))

        if (!identifiers.length) continue

        try {
          const pickupSchedule =
            providerKey === 'delhivery'
              ? await requestDelhiveryPickupSchedule(
                  providerOrders,
                  `Set the pickup date and time for ${providerOrders.length} order(s) before generating the manifest.`,
                )
              : null

          if (providerKey === 'delhivery' && !pickupSchedule) {
            failedOrders.push(...providerOrders)
            failureReasons.push(`${providerKey}: Manifest cancelled before pickup confirmation.`)
            continue
          }

          const response = await generateManifestService({
            awbs: identifiers,
            type: 'b2c',
            ...(pickupSchedule || {}),
          })
          successCount += providerOrders.length
          if (response.warnings?.length) {
            warningMessages.push(...response.warnings)
          }
        } catch (error) {
          console.error('Bulk manifest provider batch failed:', error)
          failedOrders.push(...providerOrders)
          failureReasons.push(
            `${providerKey}: ${getActionableErrorMessage(error, 'Manifest could not be completed for this batch.')}`,
          )
        }
      }

      if (successCount > 0) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['b2cOrdersByUser'] }),
          queryClient.invalidateQueries({ queryKey: ['orders'] }),
        ])
      }

      if (failedOrders.length > 0) {
        const failedOrderIds = failedOrders.map((order) => order.id)
        const failedOrderNumbers = summarizeOrderNumbers(
          failedOrders.map((order) => order.order_number || order.id),
        )
        const message =
          successCount > 0
            ? `Completed ${successCount} order(s). Failed for ${failedOrders.length}: ${failedOrderNumbers}. ${failureReasons.join(' ')}`
            : `Failed for ${failedOrders.length} order(s): ${failedOrderNumbers}. ${failureReasons.join(' ')}`
        const warningSummary = summarizeMessages(warningMessages)
        const finalMessage = warningSummary ? `${message} ${warningSummary}` : message

        setSelectedOrderIds(failedOrderIds)
        setBulkFeedback({
          severity: successCount > 0 ? 'warning' : 'error',
          title: successCount > 0 ? 'Manifest partially completed' : 'Manifest failed',
          message: finalMessage,
        })
        toast.open({ message: finalMessage, severity: 'error' })
        return
      }

      const successMessage = `Manifest completed for ${successCount} order(s).`
      const warningSummary = summarizeMessages(warningMessages)
      if (warningSummary) {
        const warningMessage = `${successMessage} ${warningSummary}`
        setBulkFeedback({
          severity: 'warning',
          title: 'Manifest completed with warnings',
          message: warningMessage,
        })
        toast.open({ message: warningMessage, severity: 'info' })
        clearSelection()
        return
      }
      setBulkFeedback({
        severity: 'success',
        title: 'Manifest completed',
        message: successMessage,
      })
      toast.open({ message: successMessage, severity: 'success' })
      clearSelection()
    } finally {
      setBulkManifesting(false)
    }
  }

  const handleBulkDownload = async (type: DocumentType) => {
    if (!canExportOrders) {
      const message = 'You do not have permission to download shipment documents.'
      setBulkFeedback({
        severity: 'error',
        title: 'Access restricted',
        message,
      })
      toast.open({ message, severity: 'error' })
      return
    }

    if (!selectedOrders.length) {
      const message = 'Select at least one order to download documents.'
      setBulkFeedback({
        severity: 'error',
        title: 'No orders selected',
        message,
      })
      toast.open({ message, severity: 'error' })
      return
    }

    setDownloadingDocumentType(type)
    setBulkFeedback({
      severity: 'info',
      title: `Downloading ${type}s`,
      message:
        type === 'label'
          ? `Generating missing labels and preparing one PDF for ${selectedOrders.length} selected order(s).`
          : `Preparing ${selectedOrders.length} selected order(s) for ${type} download.`,
    })

    try {
      if (type === 'label') {
        const result = await downloadBulkB2CLabelsService(selectedOrders.map((order) => order.id))
        saveAs(result.blob, `bulk-labels-${new Date().toISOString().slice(0, 10)}.pdf`)

        const summaryMessage =
          result.failed > 0
            ? `Downloaded one PDF with ${result.total - result.failed} label(s). ${result.failed} label(s) could not be prepared.${result.warnings ? ` ${result.warnings}` : ''}`
            : `Downloaded one PDF with ${result.total} label(s).${result.generated ? ` Generated ${result.generated} missing label(s).` : ''}`

        setBulkFeedback({
          severity: result.failed > 0 ? 'warning' : 'success',
          title: result.failed > 0 ? 'Labels downloaded with warnings' : 'Labels downloaded',
          message: summaryMessage,
        })
        toast.open({
          message: summaryMessage,
          severity: result.failed > 0 ? 'info' : 'success',
        })
        return
      }

      const documentEntries = selectedOrders.reduce((entries: DocumentEntry[], order: B2COrder) => {
        const { key, url } = getDocumentReference(order, type)
        if (!key && !url) return entries

        const source = key || url
        entries.push({
          key,
          url,
          fileName: getDownloadFileName(order, type, source),
          orderLabel: getOrderDocumentLabel(order),
        })
        return entries
      }, [])

      if (!documentEntries.length) {
        const message = `No ${type} files are available for the selected orders.`
        setBulkFeedback({
          severity: 'error',
          title: `No ${type} files found`,
          message,
        })
        toast.open({ message, severity: 'error' })
        return
      }

      const uniqueEntries = Array.from(
        new Map<string, DocumentEntry>(
          documentEntries.map((entry) => [entry.key || entry.url || entry.fileName, entry]),
        ).values(),
      )

      const keyEntries = uniqueEntries.filter((entry): entry is DocumentEntry & { key: string } =>
        Boolean(entry.key),
      )
      const directEntries = uniqueEntries.filter(
        (entry): entry is DocumentEntry & { url: string } => !entry.key && Boolean(entry.url),
      )
      const presignedUrls = keyEntries.length
        ? await presignDownloads({
            keys: keyEntries.map((entry) => String(entry.key)),
          })
        : []

      let downloadedCount = 0
      let skippedCount = documentEntries.length - uniqueEntries.length
      const unavailableOrders: string[] = []

      for (const entry of directEntries) {
        try {
          await downloadFile(String(entry.url), entry.fileName)
          downloadedCount += 1
        } catch (error) {
          skippedCount += 1
          unavailableOrders.push(entry.orderLabel)
          console.warn(`Skipping unavailable ${type} file for order ${entry.orderLabel}:`, error)
        }
      }

      for (const [index, entry] of keyEntries.entries()) {
        const resolvedUrl = Array.isArray(presignedUrls) ? presignedUrls[index] : null
        const downloadUrl = resolvedUrl || (entry.url ? String(entry.url) : null)
        if (!downloadUrl) {
          skippedCount += 1
          unavailableOrders.push(entry.orderLabel)
          continue
        }

        try {
          await downloadFile(downloadUrl, entry.fileName)
          downloadedCount += 1
        } catch (error) {
          skippedCount += 1
          unavailableOrders.push(entry.orderLabel)
          console.warn(`Skipping unavailable ${type} file for order ${entry.orderLabel}:`, error)
        }
      }

      if (!downloadedCount) {
        const unavailableSummary =
          unavailableOrders.length > 0
            ? ` Files are not ready for: ${summarizeOrderNumbers(unavailableOrders)}.`
            : ''
        const message = `No ${type} files could be downloaded for the selected orders.${unavailableSummary}`
        setBulkFeedback({
          severity: 'error',
          title: `${type[0].toUpperCase()}${type.slice(1)} download failed`,
          message,
        })
        toast.open({ message, severity: 'error' })
        return
      }

      const summaryMessage =
        skippedCount > 0
          ? `Downloaded ${downloadedCount} ${type} file(s). ${skippedCount} file(s) were skipped because they were duplicates or not available yet.${unavailableOrders.length ? ` Orders: ${summarizeOrderNumbers(unavailableOrders)}.` : ''}`
          : `Downloaded ${downloadedCount} ${type} file(s).`

      setBulkFeedback({
        severity: skippedCount > 0 ? 'warning' : 'success',
        title:
          skippedCount > 0
            ? `${type[0].toUpperCase()}${type.slice(1)} download completed with skips`
            : `${type[0].toUpperCase()}${type.slice(1)} download completed`,
        message: summaryMessage,
      })
      toast.open({
        message: summaryMessage,
        severity: skippedCount > 0 ? 'info' : 'success',
      })
    } catch (error) {
      console.error(`Bulk ${type} download failed:`, error)
      const message = getActionableErrorMessage(
        error,
        `Failed to download selected ${type} files. Please try again.`,
      )
      setBulkFeedback({
        severity: 'error',
        title: `${type[0].toUpperCase()}${type.slice(1)} download failed`,
        message,
      })
      toast.open({ message, severity: 'error' })
    } finally {
      setDownloadingDocumentType(null)
    }
  }

  const handleDownloadLabelsByWarehouse = async () => {
    if (!selectedWarehouse) {
      toast.open({ message: 'Please select a warehouse', severity: 'warning' })
      return
    }

    setDownloadingByWarehouse(true)
    try {
      // Fetch all orders for the selected warehouse with date range filter
      const warehouseFilters = {
        warehouse: selectedWarehouse,
        fromDate: warehouseFromDate || undefined,
        toDate: warehouseToDate || undefined,
      }

      // Fetch all pages of data for the warehouse
      let allOrders: B2COrder[] = []
      let currentPage = 1
      let hasMore = true

      while (hasMore) {
        const response = await fetchB2COrdersByUser({
          page: currentPage,
          limit: 100,
          ...warehouseFilters,
        })
        if (response?.orders && response.orders.length > 0) {
          allOrders = [...allOrders, ...response.orders]
          if (response.orders.length < 100) {
            hasMore = false
          } else {
            currentPage += 1
          }
        } else {
          hasMore = false
        }
      }

      if (allOrders.length === 0) {
        const dateInfo =
          warehouseFromDate || warehouseToDate ? ' within the selected date range' : ''
        toast.open({
          message: `No orders found for the selected warehouse${dateInfo}`,
          severity: 'warning',
        })
        setDownloadingByWarehouse(false)
        return
      }

      const entries = allOrders
        .map((order) => {
          const docRef = getDocumentReference(order, 'label')
          if (!docRef) return null
          const key = docRef.key || docRef.url
          if (!key) return null
          return {
            key,
            fileName: getDownloadFileName(order, 'label'),
            orderLabel: getOrderDocumentLabel(order),
          }
        })
        .filter((v) => v !== null) as Array<{
        key: string
        fileName: string
        orderLabel: string
      }>

      if (!entries.length) {
        toast.open({
          message: `No label files available for orders in the selected warehouse`,
          severity: 'warning',
        })
        setDownloadingByWarehouse(false)
        return
      }

      const downloadUrls = await presignDownloads({
        keys: entries.map((e) => e.key),
      })

      let downloadedCount = 0
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i]
        const downloadUrl = downloadUrls?.[i]
        if (!downloadUrl) continue

        try {
          await downloadFile(downloadUrl, entry.fileName)
          downloadedCount += 1
        } catch (error) {
          console.warn(`Failed to download label for ${entry.orderLabel}:`, error)
        }
      }

      const message = `Downloaded ${downloadedCount} label file(s) for ${allOrders.length} order(s)`
      toast.open({
        message,
        severity: downloadedCount > 0 ? 'success' : 'warning',
      })
    } catch (error) {
      console.error('Warehouse label download failed:', error)
      toast.open({ message: 'Failed to download labels', severity: 'error' })
    } finally {
      setDownloadingByWarehouse(false)
    }
  }

  const handleSingleDocumentDownload = async (order: B2COrder, type: DocumentType) => {
    if (!canExportOrders) {
      toast.open({
        message: 'You do not have permission to download shipment documents.',
        severity: 'error',
      })
      return
    }

    const reference = getDocumentReference(order, type)
    const keyValue = reference.key ? String(reference.key).trim() : ''
    const urlValue = reference.url ? String(reference.url).trim() : ''

    if (keyValue) {
      try {
        const urls = await presignDownloads({ keys: [keyValue] })
        const signedUrl = Array.isArray(urls) ? urls[0] : urls
        if (!signedUrl) {
          throw new Error(`${type} is not available yet.`)
        }
        await downloadFile(signedUrl, getDownloadFileName(order, type, keyValue))
        return
      } catch (error) {
        toast.open({
          message: getActionableErrorMessage(error, `Unable to download ${type}.`),
          severity: 'error',
        })
        return
      }
    }

    if (urlValue && isHttpUrl(urlValue)) {
      window.open(urlValue, '_blank', 'noopener,noreferrer')
      return
    }

    toast.open({
      message: `${type === 'label' ? 'Label' : type === 'invoice' ? 'Invoice' : 'Manifest'} is not available yet.`,
      severity: 'error',
    })
  }

  /* ───────────── Filter Fields ───────────── */
  const filterFields: FilterField[] = [
    {
      name: 'search',
      label: 'Search',
      type: 'text',
      placeholder: 'Search by customer, order # etc.',
    },
    {
      name: 'productQuery',
      label: 'Product / SKU',
      type: 'text',
      placeholder: 'Search by product name or SKU',
      isAdvanced: true,
    },
    {
      name: 'type',
      label: 'Order Type',
      type: 'select',
      options: [
        { label: 'All', value: '' },
        { label: 'COD', value: 'cod' },
        { label: 'Prepaid', value: 'prepaid' },
      ],
      isAdvanced: true,
    },
    {
      name: 'courier',
      label: 'Courier',
      type: 'select',
      options:
        couriers?.map((c: { name?: string; id?: string }) => ({
          label: String(c.name || ''),
          value: String(c.id || ''),
        })) ?? [],
      isAdvanced: true,
    },
    {
      name: 'warehouse',
      label: 'Warehouse',
      type: 'select',
      options:
        warehouses?.pickupAddresses?.map((w) => ({
          label: String(w.pickup?.addressNickname || ''),
          value: String(w.pickup?.addressNickname || ''),
        })) ?? [],
      isAdvanced: true,
    },
    { name: 'fromDate', label: 'From Date', type: 'date', placeholder: 'From' },
    { name: 'toDate', label: 'To Date', type: 'date', placeholder: 'To' },
  ]

  const defaultFilterValues: Record<string, unknown> = {
    sortBy: 'created_at',
    sortOrder: 'desc',
    ...filters,
  }

  /* ───────────── Columns ───────────── */
  const getProviderKey = (row: B2COrder) => {
    const providerText = String(`${row.integration_type || ''} ${row.courier_partner || ''}`)
      .trim()
      .toLowerCase()
    if (providerText.includes('delhivery')) return 'delhivery'
    if (providerText.includes('ekart')) return 'ekart'
    if (providerText.includes('xpressbees') || providerText.includes('xpress bees')) {
      return 'xpressbees'
    }
    if (providerText.includes('shadowfax')) return 'shadowfax'
    if (providerText.includes('amazon')) return 'amazon'
    return providerText
  }

  const hasDocument = (row: B2COrder, type: DocumentType) => {
    const { key, url } = getDocumentReference(row, type)
    return Boolean(key || url)
  }

  const isDocumentGenerationReady = (row: B2COrder) => {
    const normalizedStatus = String(row.order_status || '')
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, '_')
    return (
      Boolean(String(row.manifest || row.awb_number || '').trim()) ||
      documentGenerationStatuses.has(normalizedStatus)
    )
  }

  const isCancellable = (row: B2COrder) => {
    const status = (row.order_status || '').toLowerCase()
    const terminalStatuses = new Set(['cancelled', 'delivered', 'rto_delivered'])
    const provider = getProviderKey(row)
    const providerSupports = ['delhivery', 'ekart', 'shadowfax', 'xpressbees', 'amazon'].includes(
      provider,
    )

    return providerSupports && !terminalStatuses.has(status)
  }

  const canSelectCourierForOrder = (row: B2COrder) => {
    const status = String(row.order_status || '')
      .trim()
      .toLowerCase()
    const terminalStatuses = new Set(['cancelled', 'delivered', 'rto_delivered'])

    return (
      isMarketplaceSourceOrder(row) &&
      !String(row.awb_number || '').trim() &&
      !terminalStatuses.has(status)
    )
  }

  const canBulkBookSelectedOrders =
    selectedOrders.length > 0 && selectedOrders.every(canSelectCourierForOrder)

  const columns: Column<B2COrder>[] = [
    {
      label: 'Source',
      id: 'is_external_api',
      minWidth: 120,
      render: (_, row) => (
        <StatusChip
          label={row.is_external_api ? 'API' : 'Local'}
          status={row.is_external_api ? 'info' : 'success'}
        />
      ),
    },
    { label: 'Order #', id: 'order_number', minWidth: 230 },
    {
      label: 'AWB',
      id: 'awb_number',
      minWidth: 220,
      render: (value) =>
        value ? (
          <Box
            onClick={() => navigate(getClientAwbTrackingPath(String(value)))}
            sx={{
              cursor: 'pointer',
              color: '#047b85',
              fontWeight: 500,
              textDecoration: 'underline',
              '&:hover': { opacity: 0.8 },
            }}
          >
            {value}
          </Box>
        ) : (
          <span>-</span>
        ),
    },
    {
      label: 'Buyer',
      id: 'buyer_name',
      minWidth: 180,
      render: (value, row) =>
        canViewCustomerDetails ? value : `${row.buyer_name || 'Customer'} • Details restricted`,
    },
    {
      label: 'Order Total',
      id: 'order_amount',
      minWidth: 150,
      render: (_v, row) => {
        const orderAmount = Number(row.order_amount ?? 0)
        const cod = Number(row.cod_charges ?? 0)
        const customerTotal = Math.max(orderAmount - cod, 0)
        return `₹${customerTotal.toFixed(2)}`
      },
    },
    {
      label: 'Shipping Charge',
      id: 'shipping_charges',
      minWidth: 160,
      hiddenBelow: 'xl',
      render: (v) => `₹${Number(v ?? 0).toFixed(2)}`,
    },
    {
      label: 'COD Charge',
      id: 'cod_charges',
      minWidth: 145,
      hiddenBelow: 'lg',
      render: (v) => `₹${Number(v ?? 0).toFixed(2)}`,
    },
    {
      label: 'Other Charge',
      id: 'other_charges',
      minWidth: 155,
      hiddenBelow: 'xl',
      render: (v) => `₹${Number(v ?? 0).toFixed(2)}`,
    },
    {
      label: 'Courier',
      id: 'courier_partner',
      minWidth: 150,
      render: (value, row) => {
        const courierName = String(value || row.integration_type || '').trim()
        const logoUrl =
          Object.entries(courierLogos).find(([key]) =>
            courierName.toLowerCase().includes(key.toLowerCase()),
          )?.[1] ?? defaultLogo
        return (
          <Stack direction="row" alignItems="center" spacing={1}>
            <Avatar
              src={logoUrl}
              alt={courierName}
              sx={{ width: 20, height: 20, borderRadius: '4px' }}
            />
            <Typography variant="body2">{courierName || '—'}</Typography>
          </Stack>
        )
      },
    },
    {
      label: 'Status',
      id: 'order_status',
      minWidth: 170,
      render: (v) => <StatusChip label={v} status={statusColorMap[v] || 'info'} />,
    },
    {
      label: 'Created At',
      id: 'created_at',
      minWidth: 180,
      hiddenBelow: 'xl',
      render: (v) => moment(v).format('DD MMM YYYY, hh:mm A'),
    },
    {
      label: 'Last Updated',
      id: 'updated_at',
      minWidth: 180,
      hiddenBelow: 'xl',
      render: (v) => moment(v).format('DD MMM YYYY, hh:mm A'),
    },
    {
      label: 'Actions',
      id: 'id',
      minWidth: 170,
      showCellTooltip: false,
      stickyRight: true,
      render: (_, row) => {
        const rowId = String(row.id)
        const isManifestingRow = manifestingOrderId === rowId
        const isRetryingRow = retryingOrderId === rowId
        const isCancellingRow = cancellingOrderId === rowId
        const isTrackingRow = trackingOrderId === rowId
        const retriesRemaining = Number(row.manifest_retries_remaining ?? 0)
        const providerKey = getProviderKey(row)
        const hasManifestWarning =
          Boolean(String(row.manifest || '').trim()) &&
          Boolean(String(row.manifest_error || '').trim())
        const canRetryManifest = row.can_retry_manifest === true
        const hasPickupFailure =
          providerKey === 'delhivery' &&
          canRetryManifest &&
          (String(row.pickup_status || '').toLowerCase() === 'failed' ||
            String(row.order_status || '').toLowerCase() === 'shipment_created')

        // Retry the next failed provider step: manifest generation, invoice, or pickup request.
        const canRetryRowManifest =
          canRetryManifest &&
          (String(row.order_status || '').toLowerCase() === 'manifest_failed' ||
            hasManifestWarning ||
            hasPickupFailure)
        const canTrackShipment = Boolean(String(row.awb_number || '').trim())
        const canSyncTracking = canTrackShipment
        const isCancelled =
          String(row.order_status || '')
            .trim()
            .toLowerCase() === 'cancelled'
        const isDocumentReady = isDocumentGenerationReady(row)
        const isLabelGenerating = documentGenerationRef === `${row.id}-label`
        const isInvoiceGenerating = documentGenerationRef === `${row.id}-invoice`
        const isMenuOpen = activeActionOrderId === row.id && Boolean(actionMenuAnchor)

        const renderActionItem = ({
          key,
          icon,
          label,
          onClick,
          disabled = false,
          loading = false,
          danger = false,
        }: {
          key: string
          icon: ReactNode
          label: string
          onClick: () => void | Promise<void>
          disabled?: boolean
          loading?: boolean
          danger?: boolean
        }) => (
          <MenuItem
            key={key}
            disabled={disabled || loading}
            onClick={(event) => runActionFromMenu(event, onClick)}
            sx={danger ? actionMenuDangerItemSx : actionMenuItemSx}
          >
            <ListItemIcon
              sx={danger ? { ...actionMenuIconSx, color: 'error.main' } : actionMenuIconSx}
            >
              {loading ? <CircularProgress size={16} /> : icon}
            </ListItemIcon>
            <ListItemText
              primary={label}
              primaryTypographyProps={{ fontSize: 13, fontWeight: 700 }}
            />
          </MenuItem>
        )

        return (
          <>
            <Button
              size="small"
              variant={isMenuOpen ? 'contained' : 'outlined'}
              endIcon={<MdMoreVert size={16} />}
              onClick={(event) => handleActionMenuOpen(event, row.id)}
              aria-haspopup="menu"
              aria-expanded={isMenuOpen ? 'true' : undefined}
              sx={{
                minHeight: 32,
                px: 1.15,
                borderRadius: '8px',
                fontSize: 12,
                fontWeight: 800,
                textTransform: 'none',
                whiteSpace: 'nowrap',
                borderColor: 'rgba(232, 85, 0, 0.32)',
                color: isMenuOpen ? '#FFFFFF' : '#047b85',
                bgcolor: isMenuOpen ? '#047b85' : '#FFFFFF',
                boxShadow: isMenuOpen ? '0 10px 20px rgba(232, 85, 0, 0.16)' : 'none',
                '&:hover': {
                  borderColor: '#047b85',
                  bgcolor: isMenuOpen ? '#D34B00' : 'rgba(232, 85, 0, 0.06)',
                },
              }}
            >
              Actions
            </Button>
            <Menu
              anchorEl={actionMenuAnchor}
              open={isMenuOpen}
              onClose={handleActionMenuClose}
              onClick={(event) => event.stopPropagation()}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
              transformOrigin={{ vertical: 'top', horizontal: 'right' }}
              slotProps={{
                paper: {
                  sx: {
                    mt: 0.75,
                    minWidth: 260,
                    borderRadius: '10px',
                    border: '1px solid rgba(17, 24, 39, 0.10)',
                    background: 'rgba(255, 255, 255, 0.98)',
                    boxShadow: '0 18px 38px rgba(17, 24, 39, 0.16)',
                    overflow: 'hidden',
                  },
                },
                list: {
                  dense: true,
                  sx: { py: 0.45 },
                },
              }}
            >
              {renderActionItem({
                key: 'view-details',
                icon: <MdVisibility />,
                label: 'View Details',
                onClick: () => handleViewDetails(row),
              })}
              {canSelectCourierForOrder(row) &&
                renderActionItem({
                  key: 'select-courier',
                  icon: <MdLocalShipping />,
                  label: 'Select Courier',
                  onClick: () => setCourierSelectionOrder(row),
                  disabled: isTrackingRow || isManifestingRow || isRetryingRow || isCancellingRow,
                })}
              <Divider sx={{ my: 0.35 }} />
              {renderActionItem({
                key: 'generate-manifest',
                icon: <MdAssignment />,
                label: isManifestingRow ? 'Generating Manifest' : 'Generate Manifest',
                onClick: () => handleGenerateManifest(row),
                disabled:
                  isCancelled ||
                  !isB2CManifestEligible(row) ||
                  bulkManifesting ||
                  isManifestingRow ||
                  isRetryingRow ||
                  isCancellingRow,
                loading: isManifestingRow,
              })}
              {renderActionItem({
                key: 'generate-label',
                icon: <MdLocalOffer />,
                label: isLabelGenerating
                  ? 'Generating Label'
                  : hasDocument(row, 'label')
                    ? 'Regenerate Label'
                    : 'Generate Label',
                onClick: () => handleGenerateOrderDocument(row, 'label'),
                disabled:
                  isCancelled ||
                  !isDocumentReady ||
                  regeneratingDocuments ||
                  Boolean(documentGenerationRef),
                loading: isLabelGenerating,
              })}
              {renderActionItem({
                key: 'generate-invoice',
                icon: <MdReceipt />,
                label: isInvoiceGenerating
                  ? 'Generating Invoice'
                  : hasDocument(row, 'invoice')
                    ? 'Regenerate Invoice'
                    : 'Generate Invoice',
                onClick: () => handleGenerateOrderDocument(row, 'invoice'),
                disabled:
                  isCancelled ||
                  !isDocumentReady ||
                  regeneratingDocuments ||
                  Boolean(documentGenerationRef),
                loading: isInvoiceGenerating,
              })}
              {canExportOrders &&
                (hasDocument(row, 'label') ||
                  hasDocument(row, 'invoice') ||
                  hasDocument(row, 'manifest')) && <Divider sx={{ my: 0.35 }} />}
              {canExportOrders &&
                hasDocument(row, 'label') &&
                renderActionItem({
                  key: 'download-label',
                  icon: <MdDownload />,
                  label: 'Download Label',
                  onClick: () => handleSingleDocumentDownload(row, 'label'),
                  disabled: isManifestingRow || isRetryingRow || isCancellingRow,
                })}
              {canExportOrders &&
                hasDocument(row, 'invoice') &&
                renderActionItem({
                  key: 'download-invoice',
                  icon: <MdDownload />,
                  label: 'Download Invoice',
                  onClick: () => handleSingleDocumentDownload(row, 'invoice'),
                  disabled: isManifestingRow || isRetryingRow || isCancellingRow,
                })}
              {canExportOrders &&
                hasDocument(row, 'manifest') &&
                renderActionItem({
                  key: 'download-manifest',
                  icon: <MdDownload />,
                  label: 'Download Manifest',
                  onClick: () => handleSingleDocumentDownload(row, 'manifest'),
                  disabled: isManifestingRow || isRetryingRow || isCancellingRow,
                })}
              {(canRetryRowManifest ||
                (row.order_status || '').toLowerCase() === 'delivered' ||
                (canCancelOrders && isCancellable(row))) && <Divider sx={{ my: 0.35 }} />}
              {canRetryRowManifest &&
                renderActionItem({
                  key: 'retry-manifest',
                  icon: <MdReplay />,
                  label: hasPickupFailure
                    ? `Retry Pickup (${retriesRemaining} left)`
                    : hasManifestWarning && providerKey !== 'delhivery'
                      ? `Retry Invoice (${retriesRemaining} left)`
                      : `Retry Manifest (${retriesRemaining} left)`,
                  onClick: () => handleRetryManifest(row),
                  disabled: isRetryingRow || isManifestingRow || isCancellingRow,
                  loading: isRetryingRow,
                })}
              {canViewReturnOrders &&
                canAddReturnOrders &&
                (row.order_status || '').toLowerCase() === 'delivered' &&
                renderActionItem({
                  key: 'reverse',
                  icon: <MdKeyboardReturn />,
                  label: 'Create Reverse',
                  onClick: () => setReverseOrder(row),
                })}
              {canCancelOrders &&
                isCancellable(row) &&
                renderActionItem({
                  key: 'cancel',
                  icon: <MdCancel />,
                  label: isCancellingRow ? 'Cancelling Shipment' : 'Cancel Shipment',
                  onClick: () => handleCancelOrder(row),
                  disabled: isCancellingRow || isManifestingRow || isRetryingRow,
                  loading: isCancellingRow,
                  danger: true,
                })}
              <Divider sx={{ my: 0.35 }} />
              {renderActionItem({
                key: 'track-shipment',
                icon: <MdLocalShipping />,
                label: 'Track Shipment',
                onClick: () => handleTrackShipment(row),
                disabled: !canTrackShipment,
              })}
              {renderActionItem({
                key: 'sync-live-status',
                icon: <MdSync />,
                label: isTrackingRow ? 'Syncing Live Status' : 'Sync Live Status',
                onClick: () => handleSyncLiveTracking(row),
                disabled:
                  !canSyncTracking ||
                  isTrackingRow ||
                  isManifestingRow ||
                  isRetryingRow ||
                  isCancellingRow,
                loading: isTrackingRow,
              })}
            </Menu>
          </>
        )
      },
    },
  ]

  /* ───────────── Tabs ───────────── */
  const tabs = [
    { label: 'All', value: '' },
    ...Object.entries(shippingStatusMap).map(([value, label]) => ({
      label,
      value,
    })),
  ]

  if (isError) {
    return (
      <Typography color="error" textAlign="center" py={4}>
        Failed to fetch orders
      </Typography>
    )
  }

  return (
    <Stack spacing={2}>
      {/* Top row: Create button */}
      <Stack direction="column" alignItems="stretch" justifyContent="space-between" gap={2}>
        <Stack
          direction={{ xs: 'column', lg: 'row' }}
          alignItems={{ xs: 'stretch', lg: 'center' }}
          justifyContent="space-between"
          gap={{ xs: 2, md: 2.5 }}
          width="100%"
          sx={{
            p: { xs: 1, md: 1.25, xl: 1.5 },
            borderRadius: '18px',
            background:
              'linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(249,250,251,0.96) 100%)',
            border: '1px solid #F1F5F9',
          }}
        >
          {/* Left Content */}
          <Stack spacing={0.55} sx={{ minWidth: 0, flex: 1 }}>
            <Typography
              sx={{
                fontSize: { xs: '1.1rem', md: '1.35rem', xl: '1.55rem' },
                fontWeight: 800,
                color: '#111827',
                lineHeight: 1.15,
                letterSpacing: '-0.02em',
              }}
            >
              My B2C Orders
            </Typography>

            <Typography
              sx={{
                fontSize: { xs: '0.82rem', md: '0.9rem' },
                color: '#6B7280',
                fontWeight: 500,
                lineHeight: 1.45,
              }}
            >
              Manage, upload, export and create customer shipments with ease.
            </Typography>
          </Stack>

          {/* Right Actions */}
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            gap={1.25}
            // flexWrap="wrap"
            width={{ xs: '100%', lg: 'auto' }}
            justifyContent="flex-end"
          >
            {/* Download by Warehouse Section */}
            {warehouses?.pickupAddresses && warehouses.pickupAddresses.length > 0 && (
              <Box ref={warehouseSelectorRef}>
                <CustomSelect
                  label=""
                  value={selectedWarehouse ?? ''}
                  onSelect={(warehouseId) => {
                    setSelectedWarehouse(warehouseId as string)
                    // Open popover when warehouse is selected
                    setTimeout(() => {
                      if (warehouseSelectorRef.current) {
                        setWarehousePopoverAnchor(warehouseSelectorRef.current)
                      }
                    }, 0)
                  }}
                  items={warehouses.pickupAddresses.map((w) => ({
                    key: w.id || w.pickup?.addressNickname || '',
                    label: w.pickup?.addressNickname || 'Warehouse',
                    description:
                      w.pickup?.city && w.pickup?.state
                        ? `${w.pickup.city}, ${w.pickup.state}`
                        : '',
                  }))}
                  placeholder="Warehouse for label"
                  width="300px"
                  topMargin={false}
                />
              </Box>
            )}

            {/* Date Range Popover */}
            {selectedWarehouse && (
              <Popover
                open={Boolean(warehousePopoverAnchor)}
                anchorEl={warehousePopoverAnchor}
                onClose={() => {
                  setWarehousePopoverAnchor(null)
                  setSelectedWarehouse(null)
                }}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                transformOrigin={{ vertical: 'top', horizontal: 'left' }}
              >
                <Paper
                  sx={{
                    p: 2.5,
                    borderRadius: 2,
                    minWidth: '340px',
                    boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
                  }}
                >
                  <Stack spacing={2}>
                    <Box>
                      <Typography sx={{ fontSize: '0.95rem', fontWeight: 700, mb: 1.5 }}>
                        📅 Select Date Range
                      </Typography>
                      <Typography sx={{ fontSize: '0.85rem', color: '#6B7280', mb: 2 }}>
                        Download labels for orders within this date range (by default shows all)
                      </Typography>
                    </Box>

                    <Stack spacing={1.5}>
                      <Box>
                        <TextField
                          type="date"
                          label="From Date (Optional)"
                          value={warehouseFromDate}
                          onChange={(e) => setWarehouseFromDate(e.target.value)}
                          InputLabelProps={{ shrink: true }}
                          size="small"
                          fullWidth
                          helperText="Leave empty to show all orders from the beginning"
                        />
                      </Box>
                      <Box>
                        <TextField
                          type="date"
                          label="To Date"
                          value={warehouseToDate}
                          onChange={(e) => setWarehouseToDate(e.target.value)}
                          InputLabelProps={{ shrink: true }}
                          size="small"
                          fullWidth
                        />
                      </Box>
                    </Stack>

                    <Stack direction="row" spacing={1} justifyContent="flex-end">
                      <Button
                        variant="text"
                        onClick={() => {
                          setWarehousePopoverAnchor(null)
                          setSelectedWarehouse(null)
                          setWarehouseFromDate('')
                          setWarehouseToDate(getDefaultPickupDateInput())
                        }}
                        sx={{ textTransform: 'none' }}
                      >
                        Cancel
                      </Button>
                      <Button
                        variant="contained"
                        startIcon={
                          downloadingByWarehouse ? (
                            <Box
                              component="span"
                              sx={{
                                display: 'inline-flex',
                                animation: 'spin 1s linear infinite',
                                '@keyframes spin': {
                                  '0%': { transform: 'rotate(0deg)' },
                                  '100%': { transform: 'rotate(360deg)' },
                                },
                              }}
                            >
                              <MdDownload size={18} />
                            </Box>
                          ) : (
                            <MdDownload size={18} />
                          )
                        }
                        onClick={async () => {
                          await handleDownloadLabelsByWarehouse()
                          setWarehousePopoverAnchor(null)
                          setSelectedWarehouse(null)
                          setWarehouseFromDate('')
                          setWarehouseToDate(getDefaultPickupDateInput())
                        }}
                        disabled={downloadingByWarehouse}
                        sx={{
                          bgcolor: '#047b85',
                          textTransform: 'none',
                          '&:hover': { bgcolor: '#B40312' },
                        }}
                      >
                        {downloadingByWarehouse ? 'Downloading...' : 'Download'}
                      </Button>
                    </Stack>
                  </Stack>
                </Paper>
              </Popover>
            )}

            <Button
              variant="outlined"
              onClick={handleExportCSV}
              disabled={exportingCsv}
              startIcon={<MdDownload size={16} />}
              fullWidth
              sx={{
                minHeight: 28,
                py: 0.75,
                px: 1.5,
                borderRadius: '8px',
                fontWeight: 600,
                fontSize: '0.8rem',
                textTransform: 'none',
                borderColor: '#E5E7EB',
                color: '#111827',
                backgroundColor: '#fff',
                whiteSpace: 'nowrap',
                '&:hover': {
                  borderColor: '#D1D5DB',
                  backgroundColor: '#F9FAFB',
                },
              }}
            >
              {exportingCsv ? 'Exporting...' : 'Export CSV'}
            </Button>

            <Button
              variant="outlined"
              onClick={handleOpenBulkUpload}
              startIcon={<FiUploadCloud size={16} />}
              fullWidth
              sx={{
                minHeight: 28,
                py: 0.75,
                px: 1.5,
                borderRadius: '8px',
                fontWeight: 600,
                fontSize: '0.8rem',
                textTransform: 'none',
                borderColor: '#FECACA',
                color: '#DC2626',
                backgroundColor: '#FEF2F2',
                whiteSpace: 'nowrap',
                '&:hover': {
                  borderColor: '#FCA5A5',
                  backgroundColor: '#FEE2E2',
                },
              }}
            >
              Bulk Upload
            </Button>

            <Button
              variant="contained"
              onClick={handleCreateB2COrder}
              startIcon={<FiPlusCircle size={16} />}
              fullWidth
              sx={{
                minHeight: 28,
                py: 0.75,
                px: 1.5,
                borderRadius: '8px',
                fontWeight: 700,
                fontSize: '0.8rem',
                textTransform: 'none',
                whiteSpace: 'nowrap',
                background: 'linear-gradient(135deg, #DC2626 0%, #B91C1C 100%)',
                boxShadow: '0 12px 24px rgba(220,38,38,0.22)',
                '&:hover': {
                  background: 'linear-gradient(135deg, #B91C1C 0%, #991B1B 100%)',
                  boxShadow: '0 14px 28px rgba(220,38,38,0.28)',
                },
              }}
            >
              Create Order
            </Button>
          </Stack>
        </Stack>
      </Stack>
      {/* 🔹 Status Tabs Row */}

      <Box
        sx={{
          px: { xs: 1, md: 2 },
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            lg: 'minmax(180px, 220px) minmax(0, 1fr)',
            xl: 'minmax(180px, 220px) minmax(0, 1fr) auto',
          },
          gap: { xs: 1.5, lg: 2 },
          alignItems: 'start',
        }}
      >
        <Box sx={{ width: '100%', maxWidth: { lg: 220 } }}>
          <CustomSelect
            label="Sort by Created At"
            value={filters.sortOrder || 'desc'}
            onSelect={(value) => {
              const sortOrder = (value as 'asc' | 'desc') || 'desc'
              setFilters((prev) => ({
                ...prev,
                sortBy: 'created_at',
                sortOrder,
              }))
              setPage(1)
              clearSelection()
              setBulkFeedback(null)
            }}
            items={[
              { key: 'asc', label: 'Newest first' },
              { key: 'desc', label: 'Oldest first' },
            ]}
          />
        </Box>
        <Stack
          direction="row"
          alignItems="center"
          flexWrap="wrap"
          gap={1.25}
          sx={{
            width: '100%',
            minWidth: 0,
          }}
        >
          {/* Label */}
          <Stack gap={1.2}>
            <Typography
              sx={{
                flexShrink: 0,
                fontSize: { xs: '0.78rem', md: '0.84rem' },
                fontWeight: 700,
                color: '#374151',
                whiteSpace: 'nowrap',
                mr: { xs: 0, sm: 0.5 },
              }}
            >
              Status
            </Typography>

            {/* Tabs */}
            <Box
              sx={{
                flex: 1,
                minWidth: { xs: '100%', sm: 260, md: 340 },
                order: { xs: 3, sm: 2 },
              }}
            >
              <SmartTabs
                showDivider={false}
                tabs={tabs}
                value={selectedTab}
                onChange={handleTabChange}
              />
            </Box>
          </Stack>
          {/* Filters */}
          <Box
            sx={{
              flexShrink: 0,
              ml: { xs: 0, sm: 'auto' },
              order: { xs: 2, sm: 3 },
              width: { xs: '100%', sm: 'auto' },
            }}
          >
            <FilterBar
              fields={filterFields}
              onApply={handleApplyFilters}
              defaultValues={defaultFilterValues}
              mode="button"
              buttonLabel="Filters"
              appliedCount={Object.values(filters).filter(Boolean).length}
            />
          </Box>
        </Stack>
      </Box>
      {/* 🔹 Advanced Filter Bar - Button Mode */}

      {bulkFeedback && (
        <Alert
          severity={bulkFeedback.severity}
          onClose={() => setBulkFeedback(null)}
          sx={{ alignItems: 'flex-start' }}
        >
          <AlertTitle>{bulkFeedback.title}</AlertTitle>
          {bulkFeedback.message}
        </Alert>
      )}
      {selectedOrders.length > 0 && (
        <Box
          sx={{
            p: 2,
            borderRadius: '10px',
            border: '1px solid rgba(51, 51, 105, 0.14)',
            backgroundColor: 'rgba(51, 51, 105, 0.04)',
          }}
        >
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            gap={1.5}
            sx={{ flexWrap: 'nowrap' }}
          >
            <Box sx={{ flex: 0, whiteSpace: 'nowrap' }}>
              <Typography sx={{ fontWeight: 700, color: '#047b85', fontSize: '15px' }}>
                {selectedOrders.length} order
                {selectedOrders.length > 1 ? 's' : ''} selected
              </Typography>
              {manifestValidationMessage && (
                <Typography sx={{ color: '#C0392B', fontSize: '11px', mt: 0.25 }}>
                  {manifestValidationMessage}
                </Typography>
              )}
            </Box>

            <Stack
              direction="row"
              gap={0.75}
              flexWrap="nowrap"
              sx={{ alignItems: 'center', overflow: 'auto' }}
            >
              <Button
                variant="contained"
                onClick={() => setBulkCourierSelectionOpen(true)}
                disabled={!canBulkBookSelectedOrders}
                startIcon={<MdLocalShipping size={14} />}
                sx={{
                  textTransform: 'none',
                  minHeight: 28,
                  py: 0.75,
                  px: 1.5,
                  fontSize: '0.8rem',
                  fontWeight: 600,
                }}
              >
                Bulk Book
              </Button>
              <Button
                variant="contained"
                onClick={handleBulkManifest}
                disabled={bulkManifesting || Boolean(manifestValidationMessage)}
                startIcon={<FiPlusCircle size={14} />}
                sx={{
                  textTransform: 'none',
                  minHeight: 28,
                  py: 0.75,
                  px: 1.5,
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  '&.Mui-disabled': {
                    opacity: 1,
                    color: '#ffffff',
                    backgroundColor: 'rgba(4, 123, 133, 0.62)',
                    border: '1px solid rgba(4, 123, 133, 0.45)',
                    '& .MuiButton-startIcon': {
                      color: '#ffffff',
                    },
                  },
                }}
              >
                {bulkManifesting ? 'Manifesting...' : 'Manifest Selected'}
              </Button>
              {canExportOrders && (
                <Button
                  variant="outlined"
                  onClick={() => handleBulkDownload('label')}
                  disabled={downloadingDocumentType !== null}
                  startIcon={<FiDownload size={14} />}
                  sx={{
                    textTransform: 'none',
                    minHeight: 28,
                    py: 0.75,
                    px: 1.5,
                    fontSize: '0.8rem',
                    fontWeight: 600,
                  }}
                >
                  {downloadingDocumentType === 'label' ? 'Downloading...' : 'Download Labels'}
                </Button>
              )}
              {canExportOrders && (
                <Button
                  variant="outlined"
                  onClick={() => handleBulkDownload('invoice')}
                  disabled={downloadingDocumentType !== null}
                  startIcon={<FiFileText size={14} />}
                  sx={{
                    textTransform: 'none',
                    minHeight: 28,
                    py: 0.75,
                    px: 1.5,
                    fontSize: '0.8rem',
                    fontWeight: 600,
                  }}
                >
                  {downloadingDocumentType === 'invoice' ? 'Downloading...' : 'Download Invoices'}
                </Button>
              )}
              {canExportOrders && (
                <Button
                  variant="outlined"
                  onClick={() => handleBulkDownload('manifest')}
                  disabled={downloadingDocumentType !== null}
                  startIcon={<FiDownload size={14} />}
                  sx={{
                    textTransform: 'none',
                    minHeight: 28,
                    py: 0.75,
                    px: 1.5,
                    fontSize: '0.8rem',
                    fontWeight: 600,
                  }}
                >
                  {downloadingDocumentType === 'manifest' ? 'Downloading...' : 'Download Manifests'}
                </Button>
              )}
              <Button
                variant="outlined"
                onClick={() => setTicketDialogOpen(true)}
                startIcon={<MdOutlineHelpCenter size={14} />}
                sx={{
                  textTransform: 'none',
                  minHeight: 28,
                  py: 0.75,
                  px: 1.5,
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  color: '#047b85',
                  borderColor: '#047b85',
                  '&:hover': {
                    borderColor: '#047b85',
                    backgroundColor: 'rgba(217, 4, 22, 0.04)',
                  },
                }}
              >
                Raise Ticket
              </Button>
              <Button
                variant="text"
                onClick={() => {
                  clearSelection()
                  setBulkFeedback(null)
                }}
                sx={{
                  textTransform: 'none',
                  minHeight: 28,
                  py: 0.75,
                  px: 1.5,
                  fontSize: '0.8rem',
                  fontWeight: 600,
                }}
              >
                Clear
              </Button>
            </Stack>
          </Stack>
        </Box>
      )}
      {/* 🔹 Data Table */}
      {isLoading && !data ? (
        <TableSkeleton title="Loading B2C orders" />
      ) : (
        <DataTable<B2COrder>
          rows={orders}
          columns={columns}
          loading={isFetching}
          loadingLabel="Updating B2C orders..."
          emptyMessage="No B2C orders match the current filters."
          pagination
          selectable
          currentPage={page - 1}
          defaultRowsPerPage={rowsPerPage}
          totalCount={data?.totalCount || 0}
          onPageChange={(newPage) => {
            setPage(newPage + 1)
            clearSelection()
            setBulkFeedback(null)
          }}
          onRowsPerPageChange={(newLimit) => {
            setRowsPerPage(newLimit)
            setPage(1)
            clearSelection()
            setBulkFeedback(null)
          }}
          onSelectRows={(ids) => setSelectedOrderIds(ids)}
          selectedRowIds={selectedOrderIds}
          // selectionResetToken={selectionResetToken}
          expandable
          renderExpandedRow={(row) => <OrderExpandedRow row={row} />}
        />
      )}
      <ReverseModal
        open={canViewReturnOrders && canAddReturnOrders && Boolean(reverseOrder)}
        order={reverseOrder}
        onClose={() => setReverseOrder(null)}
        onConfirm={(payload) => {
          createReverse(payload)
          setReverseOrder(null)
        }}
      />
      <CustomDrawer
        width={isXs ? '100%' : 820}
        open={Boolean(detailsOrder)}
        onClose={() => setDetailsOrder(null)}
        title={detailsOrder?.order_number ? `Order ${detailsOrder.order_number}` : 'Order Details'}
      >
        {detailsOrder && <OrderExpandedRow row={detailsOrder} />}
      </CustomDrawer>
      <CustomDrawer
        width={drawerWidth}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={drawerMode === 'bulk' ? 'Bulk B2C Upload' : 'Create New B2C Order'}
      >
        {drawerMode === 'bulk' ? (
          <BulkB2CUpload onClose={() => setDrawerOpen(false)} />
        ) : (
          <B2COrderFormSteps onClose={() => setDrawerOpen(false)} />
        )}
      </CustomDrawer>
      <ManifestPickupScheduleDialog
        open={pickupDialogOpen}
        title={pickupDialogTitle}
        description={pickupDialogDescription}
        pickupDate={pickupDialogDate}
        pickupTime={pickupDialogTime}
        pickupLocation={pickupDialogLocation}
        expectedPackageCount={pickupDialogPackageCount}
        minDate={getDefaultPickupDateInput()}
        onPickupDateChange={setPickupDialogDate}
        onPickupTimeChange={setPickupDialogTime}
        onPickupLocationChange={setPickupDialogLocation}
        onExpectedPackageCountChange={setPickupDialogPackageCount}
        onCancel={() => closePickupDialog(null)}
        onConfirm={() =>
          closePickupDialog({
            pickup_date: pickupDialogDate,
            pickup_time: pickupDialogTime,
            pickup_location: pickupDialogLocation.trim(),
            expected_package_count: Math.max(1, Math.round(pickupDialogPackageCount)),
          })
        }
      />

      <SourceOrderCourierDrawer
        open={Boolean(courierSelectionOrder)}
        order={courierSelectionOrder}
        onClose={() => setCourierSelectionOrder(null)}
      />

      <BulkOrderCourierDrawer
        open={bulkCourierSelectionOpen}
        orders={selectedOrders}
        onClose={() => setBulkCourierSelectionOpen(false)}
        onComplete={() => {
          clearSelection()
          setBulkFeedback(null)
        }}
      />

      <CustomDrawer
        open={ticketDialogOpen}
        onClose={() => setTicketDialogOpen(false)}
        anchor="right"
        width={isXs ? '100%' : 500}
        title="Raise Support Ticket"
      >
        <SupportTicketForm
          initialPrefill={{
            orderReferences: selectedOrders.map((order) => ({
              orderId: String(order.id),
              orderNumber: order.order_number || String(order.id),
              awbNumber: order.awb_number || undefined,
              buyerName: order.buyer_name || undefined,
              buyerPhone: order.buyer_phone || undefined,
              buyerEmail: order.buyer_email || undefined,
              courierPartner: order.courier_partner || undefined,
              warehouseName:
                order.pickup_details?.warehouse_name || order.pickup_details?.name || undefined,
              shipmentType: 'b2c',
              orderType: order.order_type || 'prepaid',
              orderStatus: order.order_status || undefined,
            })),
          }}
          onSuccess={() => {
            setTicketDialogOpen(false)
            clearSelection()
            toast.open({
              message: 'Support ticket created successfully',
              severity: 'success',
            })
          }}
          onCancel={() => setTicketDialogOpen(false)}
        />
      </CustomDrawer>
    </Stack>
  )
}

export default B2COrdersList
