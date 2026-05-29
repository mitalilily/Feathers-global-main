import axios from 'axios'
import crypto from 'crypto'
import dotenv from 'dotenv'
import path from 'path'
import Razorpay from 'razorpay'

const env = process.env.NODE_ENV || 'development'
dotenv.config({ path: path.resolve(__dirname, `../../.env.${env}`) })

type RazorpayMode = 'test' | 'live'

const resolveMode = (): RazorpayMode => {
  const explicitMode = String(process.env.RAZORPAY_MODE || '').trim().toLowerCase()
  if (explicitMode === 'test' || explicitMode === 'live') return explicitMode
  return process.env.NODE_ENV === 'production' ? 'live' : 'test'
}

export const MODE = resolveMode()

const getCredentials = () => {
  if (MODE === 'live') {
    return {
      key_id: process.env.RAZORPAY_KEY_ID_PROD || process.env.RAZORPAY_KEY_ID || '',
      key_secret: process.env.RAZORPAY_KEY_SECRET_PROD || process.env.RAZORPAY_KEY_SECRET || '',
      webhook_secret:
        process.env.RAZORPAY_WEBHOOK_SECRET_PROD || process.env.RAZORPAY_WEBHOOK_SECRET || '',
    }
  }

  return {
    key_id: process.env.RAZORPAY_KEY_ID || '',
    key_secret: process.env.RAZORPAY_KEY_SECRET || '',
    webhook_secret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
  }
}

const missingCredentialError = () =>
  new Error(
    `[Razorpay] Missing key env vars for ${MODE.toUpperCase()} mode. Configure Razorpay keys or disable payment flows.`,
  )

export const isRazorpayConfigured = () => {
  const credentials = getCredentials()
  return Boolean(credentials.key_id && credentials.key_secret)
}

export const getRazorpayKeyId = () => {
  const credentials = getCredentials()
  if (!credentials.key_id) throw missingCredentialError()
  return credentials.key_id
}

const requireCredentials = () => {
  const credentials = getCredentials()
  if (!credentials.key_id || !credentials.key_secret) {
    throw missingCredentialError()
  }
  return credentials
}

let razorpayInstance: Razorpay | null = null
let razorpayInstanceKey = ''

export const getRazorpay = () => {
  const credentials = requireCredentials()
  if (!razorpayInstance || razorpayInstanceKey !== credentials.key_id) {
    razorpayInstance = new Razorpay({
      key_id: credentials.key_id,
      key_secret: credentials.key_secret,
    })
    razorpayInstanceKey = credentials.key_id
  }
  return razorpayInstance
}

export const razorpay = new Proxy({} as Razorpay, {
  get(_target, prop) {
    return (getRazorpay() as any)[prop]
  },
})

export const razorpayApi = axios.create({
  baseURL: 'https://api.razorpay.com/v1',
})

razorpayApi.interceptors.request.use((config) => {
  const credentials = requireCredentials()
  config.auth = {
    username: credentials.key_id,
    password: credentials.key_secret,
  }
  return config
})

export function isValidSig(body: string, sig: string) {
  const credentials = getCredentials()
  if (!credentials.webhook_secret) {
    throw new Error(`[Razorpay] Missing webhook secret for ${MODE.toUpperCase()} mode`)
  }

  const expected = crypto
    .createHmac('sha256', credentials.webhook_secret)
    .update(body)
    .digest('hex')
  return expected === sig
}

if (isRazorpayConfigured()) {
  console.info(`[Razorpay] Configured in ${MODE.toUpperCase()} mode`)
} else {
  console.warn(
    `[Razorpay] Key env vars are missing for ${MODE.toUpperCase()} mode. Backend will start; payment endpoints will fail until configured.`,
  )
}
