import axiosInstance from './axiosInstance'
import type { AxiosRequestConfig } from 'axios'

export interface Pickup {
  id: string
  awb_number: string | null
  courier_partner: string | null
  order_number: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pickup_details: any
  created_at: string
}

export interface PendingActions {
  ndrCount: number
  rtoCount: number
  weightDiscrepancyCount: number
}

export interface InvoiceStatus {
  pending: { count: number; totalAmount: number }
  paid: { count: number; totalAmount: number }
  overdue: { count: number; totalAmount: number }
}

export interface TopDestination {
  city: string
  state: string
  count: number
}

export interface CourierDistribution {
  courier: string
  count: number
}

export const getIncomingPickups = async (config?: AxiosRequestConfig): Promise<Pickup[]> => {
  const { data } = await axiosInstance.get('/dashboard/incoming', config)
  return data.success ? data.pickups : []
}

export const getPendingActions = async (config?: AxiosRequestConfig): Promise<PendingActions> => {
  const { data } = await axiosInstance.get('/dashboard/pending-actions', config)
  return data.success
    ? {
        ndrCount: data.ndrCount || 0,
        rtoCount: data.rtoCount || 0,
        weightDiscrepancyCount: data.weightDiscrepancyCount || 0,
      }
    : { ndrCount: 0, rtoCount: 0, weightDiscrepancyCount: 0 }
}

export const getInvoiceStatus = async (config?: AxiosRequestConfig): Promise<InvoiceStatus> => {
  const { data } = await axiosInstance.get('/dashboard/invoice-status', config)
  return data.success ? data.status : { pending: { count: 0, totalAmount: 0 }, paid: { count: 0, totalAmount: 0 }, overdue: { count: 0, totalAmount: 0 } }
}

export const getTopDestinations = async (
  limit = 10,
  config?: AxiosRequestConfig,
): Promise<TopDestination[]> => {
  const axiosConfig: AxiosRequestConfig = {
    ...config,
    params: {
      limit,
      ...(config?.params ?? {}),
    },
  }
  const { data } = await axiosInstance.get('/dashboard/top-destinations', axiosConfig)
  return data.success ? data.destinations : []
}

export const getCourierDistribution = async (
  config?: AxiosRequestConfig,
): Promise<CourierDistribution[]> => {
  const { data } = await axiosInstance.get('/dashboard/courier-distribution', config)
  return data.success ? data.distribution : []
}

// Merchant Dashboard Stats
export interface MerchantDashboardStats {
  asOfDate?: string
  todayOperations: {
    orders: number
    pending: number
    inTransit: number
    delivered: number
  }
  financial: {
    walletBalance: number
    todayRevenue: number
    totalRevenue: number
    totalShippingCharges: number
    totalFreightCharges: number
    profit: number
    codAmount: number
    codRemittanceDue: number
    codRemittanceCredited: number
  }
  operational: {
    deliverySuccessRate: number
    ndrRate: number
    rtoRate: number
    avgDeliveryTime: number
    totalOrders: number
    deliveredOrders: number
    ndrCount: number
    rtoCount: number
  }
  actions: {
    ndrCount: number
    rtoCount: number
    weightDiscrepancyCount: number
    openTickets: number
    inProgressTickets: number
    pendingInvoices: number
    pendingInvoiceAmount: number
    overdueInvoices: number
    overdueInvoiceAmount: number
  }
  couriers: {
    performance: Record<string, { count: number; delivered: number; revenue: number; deliveryRate: number }>
    distribution: CourierDistribution[]
  }
  geographic: {
    topDestinations: TopDestination[]
  }
  charts: {
    ordersByDate: { date: string; orders: number }[]
    revenueByDate: { date: string; revenue: number }[]
    ordersByDate30: { date: string; orders: number }[]
    revenueByDate30: { date: string; revenue: number }[]
    ordersByStatus: { status: string; count: number }[]
    revenueByOrderType: { type: string; revenue: number }[]
    ordersByCourier: { courier: string; count: number }[]
    revenueByCourier: { courier: string; revenue: number }[]
  }
  metrics: {
    avgOrderValue: number
    totalPrepaidOrders: number
    totalCodOrders: number
    prepaidRevenue: number
    codRevenue: number
    topRevenueCities: Array<{ city: string; revenue: number }>
  }
  recentOrders: Array<Record<string, unknown>>
  trends: {
    ordersGrowth: number
    revenueGrowth: number
    thisWeekOrders: number
    lastWeekOrders: number
    thisWeekRevenue: number
    lastWeekRevenue: number
  }
  recentActivity: {
    transactions: Array<{
      id: string
      type: 'credit' | 'debit'
      amount: number
      reason: string | null
      createdAt: Date | null
    }>
    recentOrders: Array<{
      id: string
      orderNumber: string
      status: string
      amount: number
      createdAt: Date | string
    }>
  }
}

export interface MerchantOpsAnalyticsFilters {
  fromDate?: string
  toDate?: string
  courier?: string
  zone?: string
  search?: string
  accountId?: string
}

export interface MerchantOpsAnalyticsSummary {
  totalOrders: number
  deliveredOrders: number
  deliveryRate: number
  rtoRate: number
  avgDeliveryDays: number
  avgDispatchDays: number
  bestZone?: { label?: string; zone?: string } | null
  worstZone?: { label?: string; zone?: string } | null
  bestCourier?: { label?: string; courier?: string } | null
}

export interface MerchantOpsAnalyticsData {
  summary: MerchantOpsAnalyticsSummary
  zoneOverview: Array<{
    zone: string
    label: string
    orders: number
    deliveryRate: number
    rtoRate: number
    avgDeliveryDays: number
    bestCourier: string
  }>
  zoneCourierMatrix: {
    zones: string[]
    couriers: string[]
    rows: Array<{
      courier: string
      zones: Array<{
        zone: string
        deliveryRate: number
        orders: number
      }>
    }>
  }
  zoneRtoAnalytics: Array<{
    zone: string
    codRto: number
    prepaidRto: number
  }>
  zoneSpeed: Array<{
    zone: string
    bestCourier: string
    avgDays: number
  }>
  ndrAnalytics: Array<{
    reason: string
    count: number
    share: number
  }>
  courierPerformance: Array<{
    courier: string
    orders: number
    delivered: number
    deliveryRate: number
    avgDeliveryDays: number
    rtoRate: number
  }>
  highRiskPincodes: Array<{
    pincode: string
    orders: number
    rtoRate: number
  }>
  pincodeCourierComparison: Array<{
    pincode: string
    courier: string
    deliveryRate: number
    rtoRate: number
    avgDeliveryDays: number
  }>
  codFriendlyPincodes: Array<{
    pincode: string
    codDelivery: number
    codRto: number
  }>
  prepaidRecommendedPincodes: Array<{
    pincode: string
    codRto: number
  }>
  weightDistribution: Array<{
    label: string
    orders: number
    share: number
  }>
  colorWiseRto: Array<{
    color: string
    rto: number
  }>
  priceWiseRto: Array<{
    priceRange: string
    rto: number
  }>
  courierRtoByWeight: Array<{
    courier: string
    [key: string]: string | number
  }>
  productWiseRto: Array<{
    product: string
    orders: number
    delivered: number
    rto: number
    rtoRate: number
  }>
  categoryWiseRto: Array<{
    category: string
    rtoRate: number
  }>
  skuWiseRto: Array<{
    sku: string
    product: string
    rtoRate: number
  }>
  sizeWiseRto: Array<{
    size: string
    rtoRate: number
  }>
  dispatchDelay: Array<{
    dispatchTime: string
    orders: number
    deliveryRate: number
    rtoRate: number
  }>
  guidance: string[]
  filtersApplied: {
    fromDate: string | null
    toDate: string | null
    userId: string | null
    accountId: string | null
    courier: string | null
    zone: string | null
    search: string | null
  }
}

export const getMerchantDashboardStats = async (
  selectedDate?: string,
  config?: AxiosRequestConfig,
): Promise<MerchantDashboardStats> => {
  const axiosConfig: AxiosRequestConfig = {
    ...config,
    params: {
      ...(config?.params ?? {}),
      ...(selectedDate ? { date: selectedDate } : {}),
    },
  }
  const { data } = await axiosInstance.get('/dashboard/stats', axiosConfig)
  return data.success ? data.data : ({} as MerchantDashboardStats)
}

export const getMerchantOpsAnalytics = async (
  filters: MerchantOpsAnalyticsFilters = {},
  config?: AxiosRequestConfig,
): Promise<MerchantOpsAnalyticsData> => {
  const axiosConfig: AxiosRequestConfig = {
    ...config,
    timeout: config?.timeout ?? 60000,
    params: {
      ...(config?.params ?? {}),
      ...filters,
    },
  }

  const { data } = await axiosInstance.get('/dashboard/ops-analytics', axiosConfig)
  return data.success ? data.data : ({} as MerchantOpsAnalyticsData)
}
