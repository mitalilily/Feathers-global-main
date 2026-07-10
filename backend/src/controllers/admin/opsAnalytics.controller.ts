// @ts-nocheck
import { Response } from 'express'
import { getAdminOpsAnalytics } from '../../models/services/adminOpsAnalytics.service'

export const getAdminOpsAnalyticsController = async (req: any, res: Response) => {
  try {
    const data = await getAdminOpsAnalytics({
      fromDate: req.query.fromDate || undefined,
      toDate: req.query.toDate || undefined,
      userId: req.query.userId || req.query.accountId || undefined,
      courier: req.query.courier || undefined,
      zone: req.query.zone || undefined,
      search: req.query.search || undefined,
    })

    return res.json(data)
  } catch (error: any) {
    console.error('[getAdminOpsAnalyticsController]', error)
    return res.status(500).json({
      success: false,
      message: error?.message || 'Failed to fetch ops analytics',
    })
  }
}
