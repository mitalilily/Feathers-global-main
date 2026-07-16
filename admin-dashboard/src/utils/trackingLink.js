const PUBLIC_TRACKING_BASE_URL =
  process.env.REACT_APP_PUBLIC_TRACKING_BASE_URL || 'https://panel.shipmozo.com'

export const normalizeAwb = (awb) =>
  String(awb || '')
    .trim()
    .toUpperCase()

export const getPublicTrackingUrl = (awb, uid) => {
  const params = new URLSearchParams({ awb: normalizeAwb(awb) })
  const normalizedUid = String(uid || '').trim()
  if (normalizedUid) params.set('uid', normalizedUid)

  return new URL(`/track-order?${params.toString()}`, PUBLIC_TRACKING_BASE_URL).toString()
}
