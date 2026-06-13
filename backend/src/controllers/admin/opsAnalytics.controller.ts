import { Response } from 'express'
import { getAdminOpsAnalytics } from '../../models/services/adminOpsAnalytics.service'

export const getAdminOpsAnalyticsController = async (req: any, res: Response) => {
  try {
    const data = await getAdminOpsAnalytics({
      fromDate: (req.query.fromDate as string) || undefined,
      toDate: (req.query.toDate as string) || undefined,
      userId: (req.query.userId as string) || (req.query.accountId as string) || undefined,
      courier: (req.query.courier as string) || undefined,
      zone: (req.query.zone as string) || undefined,
      search: (req.query.search as string) || undefined,
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
