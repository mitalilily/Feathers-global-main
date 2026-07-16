export const normalizeAwb = (awb?: string | null) => String(awb || '').trim().toUpperCase()

export const isValidAwb = (awb?: string | null) => /^[A-Z0-9-]{6,30}$/.test(normalizeAwb(awb))

export const getAwbTrackingPath = (awb: string) => `/tracking/${encodeURIComponent(normalizeAwb(awb))}`

export const getClientAwbTrackingPath = (awb: string) =>
  `/tools/order_tracking?awb=${encodeURIComponent(normalizeAwb(awb))}`

export const getPublicTrackingPath = (awb: string, uid?: string | null) => {
  const params = new URLSearchParams({ awb: normalizeAwb(awb) })
  const normalizedUid = String(uid || '').trim()
  if (normalizedUid) params.set('uid', normalizedUid)
  return `/track-order?${params.toString()}`
}

export const getPublicTrackingUrl = (awb: string, uid?: string | null) => {
  const path = getPublicTrackingPath(awb, uid)
  const configuredBase = String(import.meta.env.VITE_PUBLIC_TRACKING_BASE_URL || '').trim()
  if (configuredBase) return new URL(path, configuredBase).toString()
  if (typeof window === 'undefined') return new URL(path, 'https://panel.shipmozo.com').toString()

  const host = window.location.hostname.toLowerCase()
  const base =
    host === 'localhost' || host === '127.0.0.1' || host === '::1'
      ? window.location.origin
      : 'https://panel.shipmozo.com'
  return new URL(path, base).toString()
}
