import { Response } from 'express'
import {
  getIncomingPickups,
  getPendingActions,
  getInvoiceStatus,
  getTopDestinations,
  getCourierDistribution,
  getMerchantDashboardStats,
} from '../models/services/dashboard.service'
import { getAdminOpsAnalytics } from '../models/services/adminOpsAnalytics.service'

const parseDashboardDate = (value: unknown) => {
  const normalized = String(value || '').trim()
  if (!normalized) return undefined

  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime())) return null

  const now = new Date()
  if (parsed.getTime() > now.getTime()) return null

  return parsed
}

export const getHomePickups = async (req: any, res: Response) => {
  try {
    const userId = req.user?.sub // assume JWT middleware sets this

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' })
    }

    const pickups = await getIncomingPickups(userId)

    return res.json({ success: true, pickups })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ success: false, message: 'Failed to fetch pickups' })
  }
}

export const getDashboardPendingActions = async (req: any, res: Response) => {
  try {
    const userId = req.user?.sub

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' })
    }

    const pendingActions = await getPendingActions(userId)

    return res.json({ success: true, ...pendingActions })
  } catch (error) {
    console.error('Error fetching pending actions:', error)
    return res.status(500).json({ success: false, message: 'Failed to fetch pending actions' })
  }
}

export const getDashboardInvoiceStatus = async (req: any, res: Response) => {
  try {
    const userId = req.user?.sub

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' })
    }

    const invoiceStatus = await getInvoiceStatus(userId)

    return res.json({ success: true, status: invoiceStatus })
  } catch (error) {
    console.error('Error fetching invoice status:', error)
    return res.status(500).json({ success: false, message: 'Failed to fetch invoice status' })
  }
}

export const getDashboardTopDestinations = async (req: any, res: Response) => {
  try {
    const userId = req.user?.sub
    const limit = parseInt((req.query.limit as string) || '10')

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' })
    }

    const destinations = await getTopDestinations(userId, limit)

    return res.json({ success: true, destinations })
  } catch (error) {
    console.error('Error fetching top destinations:', error)
    return res.status(500).json({ success: false, message: 'Failed to fetch top destinations' })
  }
}

export const getDashboardCourierDistribution = async (req: any, res: Response) => {
  try {
    const userId = req.user?.sub

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' })
    }

    const distribution = await getCourierDistribution(userId)

    return res.json({ success: true, distribution })
  } catch (error) {
    console.error('Error fetching courier distribution:', error)
    return res.status(500).json({ success: false, message: 'Failed to fetch courier distribution' })
  }
}

export const getMerchantDashboardStatsController = async (req: any, res: Response) => {
  try {
    const userId = req.user?.sub

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' })
    }

    const selectedDate = parseDashboardDate(req.query.date)
    if (selectedDate === null) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid dashboard date that is not in the future.',
      })
    }

    const stats = await getMerchantDashboardStats(userId, selectedDate)

    return res.json(stats)
  } catch (error) {
    console.error('Error fetching merchant dashboard stats:', error)
    return res.status(500).json({ success: false, message: 'Failed to fetch merchant dashboard stats' })
  }
}

export const getMerchantOpsAnalyticsController = async (req: any, res: Response) => {
  try {
    const userId = req.user?.sub

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' })
    }

    const fromDate = typeof req.query.fromDate === 'string' ? req.query.fromDate.trim() : undefined
    const toDate = typeof req.query.toDate === 'string' ? req.query.toDate.trim() : undefined
    const courier = typeof req.query.courier === 'string' ? req.query.courier.trim() : undefined
    const zone = typeof req.query.zone === 'string' ? req.query.zone.trim() : undefined
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : undefined
    const accountId = typeof req.query.accountId === 'string' ? req.query.accountId.trim() : undefined

    const analytics = await getAdminOpsAnalytics({
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
      userId,
      accountId: accountId || undefined,
      courier: courier || undefined,
      zone: zone || undefined,
      search: search || undefined,
    })

    return res.json(analytics)
  } catch (error) {
    console.error('Error fetching merchant ops analytics:', error)
    return res.status(500).json({ success: false, message: 'Failed to fetch ops analytics' })
  }
}
