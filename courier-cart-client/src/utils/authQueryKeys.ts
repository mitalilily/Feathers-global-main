import { getAuthTokens } from '../api/tokenVault'

const GUEST_AUTH_SCOPE = 'guest'

export const normalizeAuthScope = (scope?: string | null) => scope?.trim() || GUEST_AUTH_SCOPE

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
  return normalizeAuthScope(decodedPayload?.sub || accessToken.slice(-16))
}

export const getUserProfileQueryKey = (scope?: string | null) =>
  ['userProfile', normalizeAuthScope(scope ?? getCurrentAuthScope())] as const

export const getUserInfoQueryKey = (scope?: string | null) =>
  ['userInfo', normalizeAuthScope(scope ?? getCurrentAuthScope())] as const

export const getWalletBalanceQueryKey = (scope?: string | null) =>
  ['walletBalance', normalizeAuthScope(scope ?? getCurrentAuthScope())] as const

export const getWalletTransactionsQueryKey = (
  page: number,
  limit: number,
  type?: 'credit' | 'debit',
  dateFrom?: string,
  dateTo?: string,
  scope?: string | null,
) =>
  [
    'walletTransactions',
    normalizeAuthScope(scope ?? getCurrentAuthScope()),
    page,
    limit,
    type,
    dateFrom,
    dateTo,
  ] as const
