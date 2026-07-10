// @ts-nocheck
import { Router } from 'express'
import { getAdminOpsAnalyticsController } from '../../controllers/admin/opsAnalytics.controller'
import { isAdminMiddleware } from '../../middlewares/isAdmin'
import { requireAuth } from '../../middlewares/requireAuth'

const router = Router()

router.get('/analytics', requireAuth, isAdminMiddleware, getAdminOpsAnalyticsController)

export default router
