let access = ""
let refresh = ""
let session = ""

const ACCESS_TOKEN_KEY = 'cc_access'
const REFRESH_TOKEN_KEY = 'cc_refresh'
const AUTH_SESSION_KEY = 'cc_auth_session'
const SESSION_USER_KEY = 'cc_session_user'

export const AUTH_STORAGE_KEYS = [
  ACCESS_TOKEN_KEY,
  REFRESH_TOKEN_KEY,
  AUTH_SESSION_KEY,
  SESSION_USER_KEY,
] as const

export type AuthTokenSnapshot = {
  accessToken: string
  refreshToken: string
  sessionId: string
}

const createAuthSessionId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `auth-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

const persistSessionId = (sessionId: string) => {
  if (typeof window === 'undefined' || !sessionId) return
  localStorage.setItem(AUTH_SESSION_KEY, sessionId)
}

const normalizeStoredTokens = (stored: AuthTokenSnapshot): AuthTokenSnapshot => {
  const hasTokens = Boolean(stored.accessToken && stored.refreshToken)

  if (!hasTokens) {
    return {
      accessToken: stored.accessToken,
      refreshToken: stored.refreshToken,
      sessionId: '',
    }
  }

  if (stored.sessionId) return stored

  const nextSessionId = createAuthSessionId()
  persistSessionId(nextSessionId)

  return {
    ...stored,
    sessionId: nextSessionId,
  }
}

const readStoredTokens = (): AuthTokenSnapshot => {
  if (typeof window === 'undefined') {
    return { accessToken: access, refreshToken: refresh, sessionId: session }
  }

  return normalizeStoredTokens({
    accessToken: localStorage.getItem(ACCESS_TOKEN_KEY) || '',
    refreshToken: localStorage.getItem(REFRESH_TOKEN_KEY) || '',
    sessionId: localStorage.getItem(AUTH_SESSION_KEY) || '',
  })
}

export const getAuthTokens = (): AuthTokenSnapshot => {
  const stored = readStoredTokens()
  access = stored.accessToken
  refresh = stored.refreshToken
  session = stored.sessionId
  return stored
}

export const setAuthTokens = (accessToken: string, refreshToken: string): AuthTokenSnapshot => {
  const sessionId = createAuthSessionId()

  access = accessToken
  refresh = refreshToken
  session = sessionId

  if (typeof window !== 'undefined') {
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken)
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken)
    localStorage.setItem(AUTH_SESSION_KEY, sessionId)
  }

  return { accessToken, refreshToken, sessionId }
}

export const getStoredSessionUser = <T>() => {
  if (typeof window === 'undefined') return null

  try {
    const rawValue = localStorage.getItem(SESSION_USER_KEY)
    return rawValue ? (JSON.parse(rawValue) as T) : null
  } catch (error) {
    console.warn('Failed to parse stored session user', error)
    localStorage.removeItem(SESSION_USER_KEY)
    return null
  }
}

export const setStoredSessionUser = <T>(user: T) => {
  if (typeof window === 'undefined') return
  localStorage.setItem(SESSION_USER_KEY, JSON.stringify(user))
}

export const isCurrentAuthSession = (sessionId?: string | null) => {
  if (!sessionId) return true
  return getAuthTokens().sessionId === sessionId
}

export const clearAuthTokens = (expectedSessionId?: string | null) => {
  if (!isCurrentAuthSession(expectedSessionId)) {
    return false
  }

  access = ''
  refresh = ''
  session = ''

  if (typeof window !== 'undefined') {
    localStorage.removeItem(ACCESS_TOKEN_KEY)
    localStorage.removeItem(REFRESH_TOKEN_KEY)
    localStorage.removeItem(AUTH_SESSION_KEY)
    localStorage.removeItem(SESSION_USER_KEY)
  }

  return true
}
