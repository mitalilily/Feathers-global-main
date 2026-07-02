import { and, eq, or, sql } from 'drizzle-orm'
import {
  assertRazorpayConfigured,
  razorpay,
  razorpayApi,
  razorpayCheckoutKeyId,
  razorpayMerchantId,
  verifyCheckoutSignature,
} from '../../utils/razorpay'
import { db } from '../client'
import { userProfiles } from '../schema/userProfile'
import { wallets, walletTopups } from '../schema/wallet'
import { users } from '../schema/users'
import { sendWalletRechargeEventEmail } from './eventEmail.service'
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

const pickText = (...values: unknown[]) => {
  for (const value of values) {
    const text = String(value ?? '').trim()
    if (text) return text
  }
  return ''
}

const normalizePhone = (value: unknown) => String(value ?? '').replace(/\D+/g, '')

type WalletOrderCustomerDetails = {
  name: string
  email: string
  phone: string
}

type WalletTopupRecord = typeof walletTopups.$inferSelect
type WalletRecord = typeof wallets.$inferSelect
type WalletTopupLookup = {
  topup: WalletTopupRecord
  wallet: WalletRecord
}

type RazorpayOrderPayment = {
  id: string
  amount: number
  currency: string
  order_id: string
  status: string
  error_description?: string | null
  created_at?: number
}

type RazorpayOrderPaymentsResponse = {
  entity: 'collection'
  count: number
  items: RazorpayOrderPayment[]
}

export type WalletTopupStatusResult = {
  ok: boolean
  status: 'created' | 'processing' | 'success' | 'failed'
  paymentId?: string | null
  paymentStatus?: string
  message?: string
  alreadyProcessed?: boolean
}

async function resolveWalletOrderCustomerDetails(
  userId: string,
  details: Partial<WalletOrderCustomerDetails>,
): Promise<WalletOrderCustomerDetails> {
  const [profileRow] = await db
    .select({
      userEmail: users.email,
      userPhone: users.phone,
      companyInfo: userProfiles.companyInfo,
    })
    .from(users)
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .where(eq(users.id, userId))
    .limit(1)

  if (!profileRow) {
    throw httpError('User not found for wallet recharge', 404)
  }

  const companyInfo = (profileRow.companyInfo ?? {}) as Record<string, unknown>
  const email = pickText(
    details.email,
    companyInfo.contactEmail,
    companyInfo.companyEmail,
    profileRow.userEmail,
  )
  const phone = normalizePhone(
    details.phone || companyInfo.contactNumber || companyInfo.companyContactNumber || profileRow.userPhone,
  )
  const name = pickText(
    details.name,
    companyInfo.businessName,
    companyInfo.brandName,
    companyInfo.contactPerson,
    companyInfo.companyName,
    email ? email.split('@')[0] : '',
    'Feather Global Customer',
  )

  const missingFields: string[] = []
  if (!email) missingFields.push('contact email')
  if (!phone) missingFields.push('contact number')

  if (missingFields.length) {
    throw httpError(
      `Missing wallet recharge ${missingFields.join(
        ' and ',
      )}. Please update your profile before trying again.`,
      400,
    )
  }

  return { name, email, phone }
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
  details: Partial<WalletOrderCustomerDetails>,
) {
  assertRazorpayConfigured()

  const wallet = await getOrCreateWalletOfUser(userId)
  const resolvedDetails = await resolveWalletOrderCustomerDetails(userId, details)

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
      name: resolvedDetails.name,
      email: resolvedDetails.email,
      contact: resolvedDetails.phone,
    },
    theme: {
      color: '#047b85',
    },
  }
}

async function findWalletTopup(orderId: string, userId?: string): Promise<WalletTopupLookup | null> {
  const conditions: any[] = [eq(walletTopups.gatewayOrderId, orderId)]

  if (userId) {
    conditions.push(eq(wallets.userId, userId))
  }

  const [row] = await db
    .select({
      topup: walletTopups,
      wallet: wallets,
    })
    .from(walletTopups)
    .innerJoin(wallets, eq(walletTopups.walletId, wallets.id))
    .where(and(...conditions))
    .limit(1)

  return row ?? null
}

const getTopupFailureReason = (meta: unknown) => {
  if (!meta || typeof meta !== 'object') return ''
  const record = meta as Record<string, unknown>
  return pickText(record.reason, record.message)
}

const getTopupPaymentState = (
  topup: WalletTopupRecord,
): WalletTopupStatusResult['status'] => {
  if (topup.status === 'processing' || topup.status === 'success' || topup.status === 'failed') {
    return topup.status
  }

  return 'created'
}

const pickBestRazorpayPayment = (payments: RazorpayOrderPayment[]) => {
  const rank = (status: string) => {
    switch (status) {
      case 'captured':
        return 0
      case 'authorized':
        return 1
      case 'created':
        return 2
      case 'failed':
        return 3
      default:
        return 99
    }
  }

  return [...payments].sort((left, right) => {
    const rankDiff = rank(left.status) - rank(right.status)
    if (rankDiff !== 0) return rankDiff
    return Number(right.created_at || 0) - Number(left.created_at || 0)
  })[0]
}

const validatePaymentForTopup = (lookup: WalletTopupLookup, payment: RazorpayOrderPayment) => {
  const expectedAmount = toPaise(lookup.topup.amount)
  const expectedCurrency = String(lookup.topup.currency || 'INR').toUpperCase()

  if (!payment || payment.order_id !== lookup.topup.gatewayOrderId) {
    throw httpError('Razorpay payment does not match this wallet top-up order', 400)
  }

  if (Number(payment.amount) !== expectedAmount) {
    throw httpError('Razorpay payment amount mismatch', 400)
  }

  if (String(payment.currency || '').toUpperCase() !== expectedCurrency) {
    throw httpError('Razorpay payment currency mismatch', 400)
  }

  return { expectedAmount, expectedCurrency }
}

async function syncWalletTopupWithGateway(lookup: WalletTopupLookup): Promise<WalletTopupStatusResult> {
  const currentStatus = getTopupPaymentState(lookup.topup)

  if (currentStatus === 'success') {
    return {
      ok: true,
      status: 'success',
      paymentId: lookup.topup.gatewayPaymentId ?? null,
      alreadyProcessed: true,
    }
  }

  if (currentStatus === 'failed') {
    return {
      ok: false,
      status: 'failed',
      paymentId: lookup.topup.gatewayPaymentId ?? null,
      message: getTopupFailureReason(lookup.topup.meta) || 'Razorpay payment failed',
      alreadyProcessed: true,
    }
  }

  assertRazorpayConfigured()

  const { data } = await razorpayApi.get<RazorpayOrderPaymentsResponse>(
    `/orders/${lookup.topup.gatewayOrderId}/payments`,
  )
  const payment = pickBestRazorpayPayment(data.items || [])

  if (!payment) {
    return {
      ok: false,
      status: currentStatus,
      message: 'Waiting for Razorpay to confirm the payment.',
    }
  }

  const { expectedAmount, expectedCurrency } = validatePaymentForTopup(lookup, payment)
  let gatewayPayment: RazorpayOrderPayment = payment

  if (gatewayPayment.status === 'authorized') {
    gatewayPayment = (await razorpay.payments.capture(
      gatewayPayment.id,
      expectedAmount,
      expectedCurrency,
    )) as RazorpayOrderPayment
  }

  if (gatewayPayment.status === 'captured') {
    await confirmSuccess(lookup.topup.gatewayOrderId || '', gatewayPayment.id, Number(gatewayPayment.amount))
    return {
      ok: true,
      status: 'success',
      paymentId: gatewayPayment.id,
      paymentStatus: gatewayPayment.status,
    }
  }

  if (gatewayPayment.status === 'failed') {
    const reason = gatewayPayment.error_description || 'Razorpay payment failed'
    await confirmFailure(lookup.topup.gatewayOrderId || '', gatewayPayment.id, reason)
    return {
      ok: false,
      status: 'failed',
      paymentId: gatewayPayment.id,
      paymentStatus: gatewayPayment.status,
      message: reason,
    }
  }

  await markTopupProcessing(lookup.topup.gatewayOrderId || '', gatewayPayment.id)

  return {
    ok: false,
    status: 'processing',
    paymentId: gatewayPayment.id,
    paymentStatus: gatewayPayment.status,
    message: 'Payment is still processing with Razorpay.',
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

  const [wallet] = await db.select().from(wallets).where(eq(wallets.id, row.walletId)).limit(1)
  if (wallet?.userId) {
    await sendWalletRechargeEventEmail({
      userId: wallet.userId,
      amount: Number(row.amount || amount),
      currency: row.currency ?? 'INR',
      gatewayOrderId: orderId,
      gatewayPaymentId: paymentId,
      status: 'success',
    }).catch((err) => {
      console.error('Failed to send wallet recharge success email:', err)
    })
  }
}

/* 3️⃣  failure */
export async function confirmFailure(orderId: string, paymentId: string | null, reason: string) {
  const [row] = await db
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

  if (!row) return

  const [wallet] = await db.select().from(wallets).where(eq(wallets.id, row.walletId)).limit(1)
  if (wallet?.userId) {
    await sendWalletRechargeEventEmail({
      userId: wallet.userId,
      amount: Number(row.amount || 0),
      currency: row.currency ?? 'INR',
      gatewayOrderId: orderId,
      gatewayPaymentId: paymentId,
      status: 'failed',
      reason,
    }).catch((err) => {
      console.error('Failed to send wallet recharge failure email:', err)
    })
  }
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

  const row = await findWalletTopup(orderId, userId)

  if (!row) {
    throw httpError('Wallet top-up order not found', 404)
  }

  if (row.topup.status === 'success') {
    return { ok: true, status: 'success', alreadyProcessed: true }
  }

  const expectedAmount = toPaise(row.topup.amount)
  const expectedCurrency = (row.topup.currency ?? 'INR').toUpperCase()
  let payment = (await razorpay.payments.fetch(paymentId)) as RazorpayOrderPayment
  validatePaymentForTopup(row, payment)

  if (payment.status === 'authorized') {
    payment = (await razorpay.payments.capture(
      paymentId,
      expectedAmount,
      expectedCurrency,
    )) as RazorpayOrderPayment
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

export async function getWalletTopupStatus(params: {
  orderId: string
  userId: string
}): Promise<WalletTopupStatusResult> {
  const lookup = await findWalletTopup(params.orderId, params.userId)

  if (!lookup) {
    throw httpError('Wallet top-up order not found', 404)
  }

  return syncWalletTopupWithGateway(lookup)
}

export async function reconcileWalletTopupOrder(orderId: string): Promise<WalletTopupStatusResult | null> {
  const lookup = await findWalletTopup(orderId)

  if (!lookup) {
    return null
  }

  return syncWalletTopupWithGateway(lookup)
}
