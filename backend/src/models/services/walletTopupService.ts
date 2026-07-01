import { and, eq, or, sql } from 'drizzle-orm'
import {
  assertRazorpayConfigured,
  razorpay,
  razorpayCheckoutKeyId,
  razorpayMerchantId,
  verifyCheckoutSignature,
} from '../../utils/razorpay'
import { db } from '../client'
import { wallets, walletTopups } from '../schema/wallet'
import { users } from '../schema/users'
import { createWalletTransaction } from './wallet.service'

import * as dotenv from 'dotenv'
import path from 'path'

// Load correct .env based on NODE_ENV
const env = process.env.NODE_ENV || 'development'
dotenv.config({ path: path.resolve(__dirname, `../../.env.${env}`) })

/* helper */
const toPaise = (amount: number | string) => Math.round(Number(amount) * 100)

const httpError = (message: string, statusCode = 400) => {
  const error = new Error(message) as Error & { statusCode: number }
  error.statusCode = statusCode
  return error
}

export async function walletOfUser(userId: string, tx: any = db) {
  const executor = tx ?? db
  const [wallet] = await executor.select().from(wallets).where(eq(wallets.userId, userId)).limit(1)
  if (!wallet) throw new Error('Wallet not found')
  return wallet
}

export async function getOrCreateWalletOfUser(userId: string, tx: any = db) {
  const executor = tx ?? db
  const [existingWallet] = await executor
    .select()
    .from(wallets)
    .where(eq(wallets.userId, userId))
    .limit(1)

  if (existingWallet) return existingWallet

  const [user] = await executor.select().from(users).where(eq(users.id, userId)).limit(1)
  if (!user) {
    throw new Error(`User not found for wallet lookup: ${userId}`)
  }

  const [createdWallet] = await executor
    .insert(wallets)
    .values({
      userId,
      balance: sql`0`,
    })
    .returning()

  return createdWallet
}

export async function createWalletOrder(
  userId: string,
  amount: number,
  details: { name: string; email: string; phone: string },
) {
  assertRazorpayConfigured()

  const wallet = await getOrCreateWalletOfUser(userId)

  // Generate unique order ID
  const orderId = `wallet_${Date.now()}_${Math.floor(Math.random() * 1000)}`

  // Create Razorpay order
  const razorpayOrder = await razorpay.orders.create({
    amount: toPaise(amount),
    currency: wallet.currency ?? 'INR',
    payment_capture: true,
    receipt: orderId,
    notes: {
      userId,
      walletId: wallet.id,
      type: 'wallet_recharge',
      ...(razorpayMerchantId ? { merchantId: razorpayMerchantId } : {}),
    },
  })

  // Insert into walletTopups as "created"
  await db.insert(walletTopups).values({
    walletId: wallet.id,
    amount,
    currency: wallet.currency ?? 'INR',
    gatewayOrderId: razorpayOrder.id,
    status: 'created',
  })

  // Return Razorpay order details for frontend
  return {
    orderId: razorpayOrder.id,
    amount: razorpayOrder.amount,
    currency: razorpayOrder.currency,
    key: razorpayCheckoutKeyId,
    name: 'Feather Global',
    description: 'Wallet Recharge',
    prefill: {
      name: details.name,
      email: details.email,
      contact: details.phone,
    },
    theme: {
      color: '#047b85',
    },
  }
}

/* 2️⃣  success */
export async function confirmSuccess(orderId: string, paymentId: string, paise: number) {
  const amount = paise / 100

  // Handle both 'created' and 'processing' statuses (frontend may mark as processing first)
  const [row] = await db
    .update(walletTopups)
    .set({
      status: 'success',
      gatewayPaymentId: paymentId,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(walletTopups.gatewayOrderId, orderId),
        or(eq(walletTopups.status, 'created'), eq(walletTopups.status, 'processing')),
      ),
    )
    .returning()

  if (!row) {
    console.error('❌ Topup not found for order:', orderId)
    return
  }

  // Create wallet transaction
  await createWalletTransaction({
    walletId: row.walletId,
    amount: row.amount,
    currency: row.currency ?? 'INR',
    type: 'credit',
    ref: paymentId,
    reason: 'Wallet Recharge',
    meta: { orderId, gateway: 'razorpay' },
  })
}

/* 3️⃣  failure */
export async function confirmFailure(orderId: string, paymentId: string | null, reason: string) {
  await db
    .update(walletTopups)
    .set({
      status: 'failed',
      gatewayPaymentId: paymentId,
      meta: { reason },
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(walletTopups.gatewayOrderId, orderId),
        or(eq(walletTopups.status, 'created'), eq(walletTopups.status, 'processing')),
      ),
    )
    .returning()
}

/* 4️⃣  hmac */

export async function markTopupProcessing(orderId: string, paymentId: string) {
  await db
    .update(walletTopups)
    .set({
      status: 'processing',
      gatewayPaymentId: paymentId,
      updatedAt: new Date(),
    })
    .where(and(eq(walletTopups.gatewayOrderId, orderId), eq(walletTopups.status, 'created')))
}

export async function confirmVerifiedPayment(params: {
  orderId: string
  paymentId: string
  signature: string
  userId: string
}) {
  assertRazorpayConfigured()

  const { orderId, paymentId, signature, userId } = params

  if (!verifyCheckoutSignature(orderId, paymentId, signature)) {
    throw httpError('Invalid Razorpay payment signature', 400)
  }

  const [row] = await db
    .select({
      topup: walletTopups,
      wallet: wallets,
    })
    .from(walletTopups)
    .innerJoin(wallets, eq(walletTopups.walletId, wallets.id))
    .where(and(eq(walletTopups.gatewayOrderId, orderId), eq(wallets.userId, userId)))
    .limit(1)

  if (!row) {
    throw httpError('Wallet top-up order not found', 404)
  }

  if (row.topup.status === 'success') {
    return { ok: true, status: 'success', alreadyProcessed: true }
  }

  const expectedAmount = toPaise(row.topup.amount)
  const expectedCurrency = (row.topup.currency ?? 'INR').toUpperCase()
  let payment: any = await razorpay.payments.fetch(paymentId)

  if (!payment || payment.id !== paymentId || payment.order_id !== orderId) {
    throw httpError('Razorpay payment does not match this wallet top-up order', 400)
  }

  if (Number(payment.amount) !== expectedAmount) {
    throw httpError('Razorpay payment amount mismatch', 400)
  }

  if (String(payment.currency || '').toUpperCase() !== expectedCurrency) {
    throw httpError('Razorpay payment currency mismatch', 400)
  }

  if (payment.status === 'authorized') {
    payment = await razorpay.payments.capture(paymentId, expectedAmount, expectedCurrency)
  }

  if (payment.status === 'captured') {
    await confirmSuccess(orderId, paymentId, Number(payment.amount))
    return { ok: true, status: 'success', paymentStatus: payment.status }
  }

  if (payment.status === 'failed') {
    await confirmFailure(orderId, paymentId, payment.error_description || 'Razorpay payment failed')
    throw httpError(payment.error_description || 'Razorpay payment failed', 402)
  }

  await markTopupProcessing(orderId, paymentId)

  return {
    ok: false,
    status: 'processing',
    paymentStatus: payment.status,
    message: 'Payment is not captured yet. Wallet will be credited when Razorpay confirms capture.',
  }
}
