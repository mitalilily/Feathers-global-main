let access = ""
let refresh = ""
let session = ""

const ACCESS_TOKEN_KEY = 'cc_access'
const REFRESH_TOKEN_KEY = 'cc_refresh'
const AUTH_SESSION_KEY = 'cc_auth_session'
const SESSION_USER_KEY = 'cc_session_user'

const readLocalStorage = (key: string) => {
  if (typeof window === 'undefined') return ''

  try {
    return window.localStorage.getItem(key) || ''
  } catch {
    return ''
  }
}

const writeLocalStorage = (key: string, value: string) => {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Embedded Shopify sessions must still work when third-party storage is blocked.
  }
}

const removeLocalStorage = (key: string) => {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.removeItem(key)
  } catch {
    // The in-memory session is cleared below even when browser storage is unavailable.
  }
}

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
  if (!sessionId) return
  writeLocalStorage(AUTH_SESSION_KEY, sessionId)
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
    accessToken: readLocalStorage(ACCESS_TOKEN_KEY) || access,
    refreshToken: readLocalStorage(REFRESH_TOKEN_KEY) || refresh,
    sessionId: readLocalStorage(AUTH_SESSION_KEY) || session,
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
    writeLocalStorage(ACCESS_TOKEN_KEY, accessToken)
    writeLocalStorage(REFRESH_TOKEN_KEY, refreshToken)
    writeLocalStorage(AUTH_SESSION_KEY, sessionId)
  }

  return { accessToken, refreshToken, sessionId }
}

export const getStoredSessionUser = <T>() => {
  if (typeof window === 'undefined') return null

  try {
    const rawValue = readLocalStorage(SESSION_USER_KEY)
    return rawValue ? (JSON.parse(rawValue) as T) : null
  } catch (error) {
    console.warn('Failed to parse stored session user', error)
    removeLocalStorage(SESSION_USER_KEY)
    return null
  }
}

export const setStoredSessionUser = <T>(user: T) => {
  writeLocalStorage(SESSION_USER_KEY, JSON.stringify(user))
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
    removeLocalStorage(ACCESS_TOKEN_KEY)
    removeLocalStorage(REFRESH_TOKEN_KEY)
    removeLocalStorage(AUTH_SESSION_KEY)
    removeLocalStorage(SESSION_USER_KEY)
  }

  return true
}
