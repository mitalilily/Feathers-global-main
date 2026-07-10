import { Router, raw } from 'express'
import {
  getUserWalletBalance,
  getWalletTransactionsController,
} from '../controllers/wallet.controller'
import { confirmFromClient, createTopup, getTopupStatus } from '../controllers/walletTopup.controller'
import { requireEmployeeModuleAccess } from '../middlewares/requireEmployeeModuleAccess'
import { razorpayWebhook } from '../controllers/webhooks/razorpay.webhooks'
import { requireAuth } from '../middlewares/requireAuth'

const r = Router()

r.post('/wallet/topup', requireAuth, requireEmployeeModuleAccess('wallet.rechargeWallet'), createTopup)
r.get(
  '/wallet/topup/:orderId/status',
  requireAuth,
  requireEmployeeModuleAccess('wallet.rechargeWallet'),
  getTopupStatus,
)
r.get(
  '/wallet/transactions',
  requireAuth,
  requireEmployeeModuleAccess('wallet.viewWallet'),
  getWalletTransactionsController,
)
r.post('/wallet/confirm', requireAuth, requireEmployeeModuleAccess('wallet.rechargeWallet'), confirmFromClient)

r.post('/wallet/webhook', raw({ type: 'application/json' }), razorpayWebhook)

r.get('/wallet/balance', requireAuth, requireEmployeeModuleAccess('wallet.viewWallet'), getUserWalletBalance)

export default r
