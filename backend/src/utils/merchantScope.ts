export const getMerchantScopedUserId = (req: any): string | undefined => {
  const merchantUserId = String(req?.merchantUserId || req?.user?.merchantSub || '').trim()
  if (merchantUserId) return merchantUserId

  const authenticatedUserId = String(req?.user?.sub || req?.userId || '').trim()
  return authenticatedUserId || undefined
}
