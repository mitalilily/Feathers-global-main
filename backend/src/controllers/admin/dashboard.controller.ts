import { Response } from 'express'
import { getAdminDashboardStats } from '../../models/services/adminDashboard.service'

export const getAdminDashboardStatsController = async (_req: any, res: Response) => {
  try {
    const data = await getAdminDashboardStats()
    return res.json(data)
  } catch (error: any) {
    console.error('[getAdminDashboardStatsController]', error)
    return res.status(500).json({
      success: false,
      message: error?.message || 'Failed to fetch admin dashboard stats',
    })
  }
}
