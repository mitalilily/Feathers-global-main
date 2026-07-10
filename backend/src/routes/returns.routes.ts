import { Router } from 'express'
import { createReversePickup, quoteReverse } from '../controllers/returns.controller'
import { requireEmployeeModuleAccess } from '../middlewares/requireEmployeeModuleAccess'
import { requireAuth } from '../middlewares/requireAuth'

const r = Router()

r.post(
  '/returns/create',
  requireAuth,
  requireEmployeeModuleAccess(['returnOrders.viewReturnOrder', 'returnOrders.addReturnOrder'], {
    requireAll: true,
    message: 'You do not have permission to create return orders.',
  }),
  createReversePickup,
)
r.post(
  '/returns/quote',
  requireAuth,
  requireEmployeeModuleAccess('returnOrders.viewReturnOrder', {
    message: 'You do not have permission to view return orders.',
  }),
  quoteReverse,
)

export default r
