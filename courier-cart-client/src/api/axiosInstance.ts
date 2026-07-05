import axios, { type InternalAxiosRequestConfig } from 'axios'
import { clearAuthTokens, getAuthTokens, setAuthTokens } from './tokenVault'

const DEFAULT_PRODUCTION_API_URL = 'https://api.fgship.in/api'

const resolveDefaultApiBaseUrl = () => {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname.toLowerCase()
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
      return 'http://localhost:4000/api'
    }
  }

  return DEFAULT_PRODUCTION_API_URL
}

const API_BASE_URL = (import.meta.env.VITE_API_URL || resolveDefaultApiBaseUrl()).replace(/\/+$/, '')

type AuthAwareRequestConfig = InternalAxiosRequestConfig & {
  _authSessionId?: string
  _retry?: boolean
  _sessionRetry?: boolean
}

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
})

let refreshPromise: Promise<{ accessToken: string; refreshToken: string }> | null = null
let refreshPromiseSessionId: string | null = null

const redirectToLogin = () => {
  if (typeof window === 'undefined') return
  if (!window.location.pathname.includes('/login')) {
    window.location.href = '/login'
  }
}

const applyAccessToken = (cfg: AuthAwareRequestConfig, accessToken: string) => {
  if (accessToken) {
    cfg.headers.Authorization = `Bearer ${accessToken}`
    return
  }

  delete cfg.headers.Authorization
}

const clearCurrentSession = (expectedSessionId?: string | null) => {
  const cleared = clearAuthTokens(expectedSessionId)
  if (cleared) {
    redirectToLogin()
  } else {
    console.info('Ignored auth clear from a stale session request')
  }
  return cleared
}

/* ----- attach access token to every request ----- */
api.interceptors.request.use((cfg) => {
  const requestConfig = cfg as AuthAwareRequestConfig
  const { accessToken, sessionId } = getAuthTokens()

  requestConfig._authSessionId = sessionId
  applyAccessToken(requestConfig, accessToken)

  return requestConfig
})

/* ----- silent-refresh once per 401 ----- */
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config as AuthAwareRequestConfig | undefined

    if (!original || err.response?.status !== 401) {
      return Promise.reject(err)
    }

    const responseCode = String(err.response?.data?.code || '').trim().toUpperCase()
    const currentAuth = getAuthTokens()

    // If a newer login/refresh happened after this request was sent, retry once
    // using the latest session instead of letting an old request clear fresh auth.
    if (
      !original._sessionRetry &&
      original._authSessionId &&
      currentAuth.sessionId &&
      original._authSessionId !== currentAuth.sessionId &&
      currentAuth.accessToken
    ) {
      original._sessionRetry = true
      original._authSessionId = currentAuth.sessionId
      applyAccessToken(original, currentAuth.accessToken)
      return api(original)
    }

    // Skip refresh if:
    // 1. Already retried
    // 2. This is the refresh token endpoint itself (avoid infinite loop)
    if (original._retry || original.url?.includes('/auth/refresh-token')) {
      return Promise.reject(err)
    }

    if (responseCode === 'SESSION_INVALID') {
      console.warn('Session invalid, clearing stored auth and redirecting to login')
      clearCurrentSession(original._authSessionId)
      return Promise.reject(err)
    }

    original._retry = true

    if (!currentAuth.refreshToken) {
      console.warn('No refresh token available, redirecting to login')
      clearCurrentSession(original._authSessionId)
      return Promise.reject(err)
    }

    try {
      console.log('Attempting to refresh access token...')

      if (!refreshPromise || refreshPromiseSessionId !== currentAuth.sessionId) {
        const refreshSessionId = currentAuth.sessionId
        refreshPromiseSessionId = refreshSessionId

        refreshPromise = axios
          .post(
            `${API_BASE_URL}/auth/refresh-token`,
            { refreshToken: currentAuth.refreshToken },
            {
              headers: {
                'x-refresh-token': currentAuth.refreshToken,
              },
            },
          )
          .then(({ data }) => data)
          .finally(() => {
            if (refreshPromiseSessionId === refreshSessionId) {
              refreshPromise = null
              refreshPromiseSessionId = null
            }
          })
      }

      const data = await refreshPromise

      if (!data?.accessToken || !data?.refreshToken) {
        throw new Error('Invalid response from refresh token endpoint')
      }

      const nextAuth = setAuthTokens(data.accessToken, data.refreshToken)
      original._authSessionId = nextAuth.sessionId
      applyAccessToken(original, nextAuth.accessToken)

      console.log('Token refreshed successfully, retrying original request')
      return api(original)
    } catch (e: unknown) {
      const error = e as { response?: { data?: { error?: string } }; message?: string }
      console.error('Refresh token failed:', error?.response?.data?.error || error?.message || e)
      clearCurrentSession(original._authSessionId)
      return Promise.reject(e)
    }
  },
)

export default api
