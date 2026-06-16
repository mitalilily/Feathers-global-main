const normalizeBaseUrl = (value: string) => value.trim().replace(/\/+$/, '')

const derivePublicBaseUrl = () => {
  const configured =
    process.env.EKART_WEBHOOK_BASE_URL ||
    process.env.API_PUBLIC_URL ||
    process.env.API_URL ||
    'https://api.featherglobal.in/api'

  return normalizeBaseUrl(configured).replace(/\/api$/, '')
}

export const EKART_WEBHOOK_PATH = '/api/webhook/ekart/track'
export const EKART_WEBHOOK_LEGACY_PATH = '/api/webhook/ekart'

export const EKART_WEBHOOK_URL =
  process.env.EKART_WEBHOOK_URL || `${derivePublicBaseUrl()}${EKART_WEBHOOK_PATH}`

export const EKART_WEBHOOK_LEGACY_URL =
  process.env.EKART_WEBHOOK_LEGACY_URL || `${derivePublicBaseUrl()}${EKART_WEBHOOK_LEGACY_PATH}`
