import { Router } from 'express'
import {
  getDeveloperErrorLogsController,
  getDeveloperLiveLogsController,
  retryDeveloperManifestController,
  triggerShadowfaxWebhookTestController,
  updateDeveloperIssueStateController,
} from '../../controllers/admin/developer.controller'
import { isAdminMiddleware } from '../../middlewares/isAdmin'
import { requireAuth } from '../../middlewares/requireAuth'

const router = Router()

router.get('/error-logs', requireAuth, isAdminMiddleware, getDeveloperErrorLogsController)
router.get('/live-logs', requireAuth, isAdminMiddleware, getDeveloperLiveLogsController)
router.patch('/issues/:issueKey', requireAuth, isAdminMiddleware, updateDeveloperIssueStateController)
router.post('/retry-manifest', requireAuth, isAdminMiddleware, retryDeveloperManifestController)
router.post(
  '/trigger-shadowfax-webhook',
  requireAuth,
  isAdminMiddleware,
  triggerShadowfaxWebhookTestController,
)

export default router
