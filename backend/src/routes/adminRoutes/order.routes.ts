import { Router } from 'express'
import {
  addManualNdrToOrderControllerAdmin,
  escalateProviderOrderControllerAdmin,
  getAllOrdersControllerAdmin,
  getProviderPodControllerAdmin,
  generateProviderQrControllerAdmin,
  exportOrdersControllerAdmin,
  regenerateOrderDocumentsControllerAdmin,
  updateOrderStatusControllerAdmin,
  updateEkartDispatchDateControllerAdmin,
  updateEkartEwbnControllerAdmin,
  updateProviderOrderControllerAdmin,
} from '../../controllers/admin/order.controller'
import { isAdminMiddleware } from '../../middlewares/isAdmin'
import { requireAuth } from '../../middlewares/requireAuth'
const router = Router()

router.get('/all-orders', requireAuth, isAdminMiddleware, getAllOrdersControllerAdmin)
router.get('/export', requireAuth, isAdminMiddleware, exportOrdersControllerAdmin)
router.post('/:id/status', requireAuth, isAdminMiddleware, updateOrderStatusControllerAdmin)
router.post('/:id/ndr', requireAuth, isAdminMiddleware, addManualNdrToOrderControllerAdmin)
router.post('/:id/provider-update', requireAuth, isAdminMiddleware, updateProviderOrderControllerAdmin)
router.post(
  '/:id/ekart/dispatch-date',
  requireAuth,
  isAdminMiddleware,
  updateEkartDispatchDateControllerAdmin,
)
router.post(
  '/:id/ekart/ewbn',
  requireAuth,
  isAdminMiddleware,
  updateEkartEwbnControllerAdmin,
)
router.post('/:id/provider-escalate', requireAuth, isAdminMiddleware, escalateProviderOrderControllerAdmin)
router.post('/:id/provider-qr', requireAuth, isAdminMiddleware, generateProviderQrControllerAdmin)
router.get('/:id/provider-pod', requireAuth, isAdminMiddleware, getProviderPodControllerAdmin)
router.post(
  '/:id/regenerate-documents',
  requireAuth,
  isAdminMiddleware,
  regenerateOrderDocumentsControllerAdmin,
)
export default router
