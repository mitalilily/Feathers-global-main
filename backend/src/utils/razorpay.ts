import axios from 'axios'
import crypto from 'crypto'
import dotenv from 'dotenv'
import path from 'path'
import Razorpay from 'razorpay'

const env = process.env.NODE_ENV || 'development'
dotenv.config({ path: path.resolve(__dirname, `../../.env.${env}`) })
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

type RazorpayMode = 'test' | 'live'
type RazorpayCredentials = {
  keyId: string
  keySecret: string
  webhookSecret?: string
  merchantId?: string
}

const readEnv = (...names: string[]) => {
  for (const name of names) {
    const value = process.env[name]?.trim()
    if (value) return value
  }
  return ''
}

const normalizeMode = (value?: string): RazorpayMode => {
  if (value === 'live' || value === 'test') return value
  return process.env.NODE_ENV === 'production' ? 'live' : 'test'
}

const mask = (value: string) => {
  if (!value) return 'missing'
  if (value.length <= 10) return `${value.slice(0, 2)}***`
  return `${value.slice(0, 8)}...${value.slice(-4)}`
}

export const razorpayMode = normalizeMode(process.env.RAZORPAY_MODE)

const credentials: Record<RazorpayMode, RazorpayCredentials> = {
  test: {
    keyId: readEnv('RAZORPAY_KEY_ID', 'RAZORPAY_TEST_KEY_ID'),
    keySecret: readEnv('RAZORPAY_KEY_SECRET', 'RAZORPAY_TEST_KEY_SECRET'),
    webhookSecret: readEnv('RAZORPAY_WEBHOOK_SECRET', 'RAZORPAY_TEST_WEBHOOK_SECRET'),
    merchantId: readEnv('RAZORPAY_MERCHANT_ID', 'RAZORPAY_MID'),
  },
  live: {
    keyId: readEnv('RAZORPAY_KEY_ID_PROD', 'RAZORPAY_LIVE_KEY_ID', 'RAZORPAY_KEY_ID'),
    keySecret: readEnv(
      'RAZORPAY_KEY_SECRET_PROD',
      'RAZORPAY_LIVE_KEY_SECRET',
      'RAZORPAY_KEY_SECRET',
    ),
    webhookSecret: readEnv(
      'RAZORPAY_WEBHOOK_SECRET_PROD',
      'RAZORPAY_LIVE_WEBHOOK_SECRET',
      'RAZORPAY_WEBHOOK_SECRET',
    ),
    merchantId: readEnv('RAZORPAY_MERCHANT_ID_PROD', 'RAZORPAY_MERCHANT_ID', 'RAZORPAY_MID'),
  },
}

const activeCredentials = credentials[razorpayMode]

export const razorpayCredentialError =
  !activeCredentials.keyId || !activeCredentials.keySecret
    ? `[Razorpay] Missing ${razorpayMode.toUpperCase()} credentials. Set RAZORPAY_KEY_ID_PROD and RAZORPAY_KEY_SECRET_PROD for live mode.`
    : null

export const isRazorpayConfigured = !razorpayCredentialError

export function assertRazorpayConfigured() {
  if (!isRazorpayConfigured) {
    const error = new Error(razorpayCredentialError || 'Razorpay is not configured') as Error & {
      statusCode: number
    }
    error.statusCode = 503
    throw error
  }
}

export const razorpayCheckoutKeyId = activeCredentials.keyId
export const razorpayMerchantId = activeCredentials.merchantId

export const razorpay = new Razorpay({
  key_id: activeCredentials.keyId || 'rzp_missing_key_id',
  key_secret: activeCredentials.keySecret || 'missing_key_secret',
})

if (isRazorpayConfigured) {
  console.info(
    `[Razorpay] Initialised in ${razorpayMode.toUpperCase()} mode with key ${mask(activeCredentials.keyId)}`,
  )
} else {
  console.warn(razorpayCredentialError)
}

export const razorpayApi = axios.create({
  baseURL: 'https://api.razorpay.com/v1',
  auth: {
    username: activeCredentials.keyId || 'rzp_missing_key_id',
    password: activeCredentials.keySecret || 'missing_key_secret',
  },
})

const timingSafeEquals = (expected: string, actual: string) => {
  const expectedBuffer = Buffer.from(expected)
  const actualBuffer = Buffer.from(actual)

  return (
    expectedBuffer.length === actualBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, actualBuffer)
  )
}

export function verifyCheckoutSignature(orderId: string, paymentId: string, signature: string) {
  if (!isRazorpayConfigured || !orderId || !paymentId || !signature) return false

  const expected = crypto
    .createHmac('sha256', activeCredentials.keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex')

  return timingSafeEquals(expected, signature)
}

export function isValidSig(body: string | Buffer, sig?: string) {
  if (!sig || !activeCredentials.webhookSecret) return false

  const rawBody = Buffer.isBuffer(body) ? body.toString('utf8') : body
  const expected = crypto
    .createHmac('sha256', activeCredentials.webhookSecret)
    .update(rawBody)
    .digest('hex')

  return timingSafeEquals(expected, sig)
}
