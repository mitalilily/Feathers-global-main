export const XPRESSBEES_WEBHOOK_PATH = '/webhooks/xpressbees/tracking'

export const XPRESSBEES_WEBHOOK_URL =
  process.env.XPRESSBEES_WEBHOOK_URL || `https://api.fgship.in${XPRESSBEES_WEBHOOK_PATH}`

export const XPRESSBEES_WEBHOOK_SIGNATURE_HEADER = 'X-Hmac-SHA256'
