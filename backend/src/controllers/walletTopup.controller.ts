import { Request, Response } from 'express'
import {
  confirmVerifiedPayment,
  createWalletOrder,
  getWalletTopupStatus,
} from '../models/services/walletTopupService'
import { getPaymentOptions } from '../models/services/paymentOptions.service'
import { getMerchantScopedUserId } from '../utils/merchantScope'

export const createTopup = async (req: Request, res: Response): Promise<any> => {
  const amt = Number(req.body.amount)
  const { name, email, phone } = req.body

  if (!amt || amt <= 0) {
    return res.status(400).json({ error: 'Invalid amount' })
  }

  try {
    const userId = getMerchantScopedUserId(req)
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    // Enforce minimum wallet recharge amount (if configured)
    const paymentSettings = await getPaymentOptions()
    const minWalletRecharge = paymentSettings.minWalletRecharge ?? 0

    if (minWalletRecharge > 0 && amt < minWalletRecharge) {
      return res.status(400).json({
        error: `Minimum wallet recharge amount is ₹${minWalletRecharge}`,
        minWalletRecharge,
      })
    }

    // Razorpay order creation
    const data = await createWalletOrder(userId, amt, { name, email, phone })

    // returns { orderId, amount, currency, key, name, description, prefill, theme }
    res.status(201).json(data)
  } catch (err) {
    console.error('Razorpay top-up error:', err)
    res.status((err as any)?.statusCode || 500).json({
      error: (err as any)?.message || 'Top-up failed',
    })
  }
}

export const confirmFromClient = async (req: Request, res: Response) => {
  const { orderId, paymentId, signature } = req.body
  const userId = getMerchantScopedUserId(req)

  if (!orderId || !paymentId || !signature) {
    return res.status(400).json({ error: 'Missing Razorpay payment confirmation details' })
  }

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const result = await confirmVerifiedPayment({ orderId, paymentId, signature, userId })
    return res.json(result)
  } catch (err: any) {
    console.error('Razorpay confirmation error:', err)
    return res.status(err?.statusCode || 500).json({
      error: err?.message || 'Payment confirmation failed',
    })
  }
}

export const getTopupStatus = async (req: Request, res: Response) => {
  const orderId = String(req.params.orderId || '').trim()
  const userId = getMerchantScopedUserId(req)

  if (!orderId) {
    return res.status(400).json({ error: 'Missing Razorpay order id' })
  }

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const result = await getWalletTopupStatus({ orderId, userId })
    return res.json(result)
  } catch (err: any) {
    console.error('Razorpay top-up status error:', err)
    return res.status(err?.statusCode || 500).json({
      error: err?.message || 'Unable to fetch payment status',
    })
  }
}
