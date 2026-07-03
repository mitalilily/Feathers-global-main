import { getAuthTokens } from '../api/tokenVault'

const GUEST_AUTH_SCOPE = 'guest'

const decodeJwtPayload = (token: string) => {
  if (!token) return null

  const tokenParts = token.split('.')
  if (tokenParts.length < 2) return null

  try {
    const normalizedPayload = tokenParts[1].replace(/-/g, '+').replace(/_/g, '/')
    const paddedPayload = normalizedPayload.padEnd(
      normalizedPayload.length + ((4 - (normalizedPayload.length % 4)) % 4),
      '=',
    )
    const payloadJson = window.atob(paddedPayload)
    return JSON.parse(payloadJson) as { sub?: string }
  } catch (error) {
    console.warn('Unable to decode auth token payload for query scoping', error)
    return null
  }
}

export const getCurrentAuthScope = () => {
  if (typeof window === 'undefined') {
    return GUEST_AUTH_SCOPE
  }

  const { accessToken } = getAuthTokens()
  if (!accessToken) return GUEST_AUTH_SCOPE

  const decodedPayload = decodeJwtPayload(accessToken)
  return decodedPayload?.sub?.trim() || accessToken.slice(-16) || GUEST_AUTH_SCOPE
}

export const getUserProfileQueryKey = () => ['userProfile', getCurrentAuthScope()] as const

export const getUserInfoQueryKey = () => ['userInfo', getCurrentAuthScope()] as const

export const getWalletBalanceQueryKey = () => ['walletBalance', getCurrentAuthScope()] as const

export const getWalletTransactionsQueryKey = (
  page: number,
  limit: number,
  type?: 'credit' | 'debit',
  dateFrom?: string,
  dateTo?: string,
) => ['walletTransactions', getCurrentAuthScope(), page, limit, type, dateFrom, dateTo] as const
