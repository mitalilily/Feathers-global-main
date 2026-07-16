import express from 'express'
import {
  exportRemittances,
  exportSingleSettlement,
  getCodDashboard,
  getRemittances,
  getRemittancePlan,
  getRemittanceStats,
  updateRemittancePlan,
  updateRemittance,
} from '../controllers/codRemittance.controller'
import { requireAuth } from '../middlewares/requireAuth'

const router = express.Router()

// All routes require authentication
router.use(requireAuth)

// Dashboard
router.get('/dashboard', getCodDashboard)

// Remittances
router.get('/remittances', getRemittances)
router.get('/remittances/stats', getRemittanceStats)
router.get('/remittance-plan', getRemittancePlan)
router.patch('/remittance-plan', updateRemittancePlan)
router.get('/remittances/export', exportRemittances)
router.get('/remittances/:remittanceId/export', exportSingleSettlement) // Single settlement export
router.patch('/remittances/:remittanceId', updateRemittance)

export default router
