export const AMAZON_SHIPPING_APPLICATION_ID =
  process.env.AMAZON_SHIPPING_APPLICATION_ID ||
  'amzn1.sp.solution.f748c717-0282-414f-84e0-883ed14c385f'

export const AMAZON_SHIPPING_WEBHOOK_PATH = '/webhooks/amazon-shipping/tracking'

export const AMAZON_SHIPPING_WEBHOOK_URL =
  process.env.AMAZON_SHIPPING_WEBHOOK_URL ||
  `https://api.shiplifi.com${AMAZON_SHIPPING_WEBHOOK_PATH}`

export const AMAZON_SHIPPING_WEBHOOK_API_KEY_HEADER = 'X-API-KEY'
