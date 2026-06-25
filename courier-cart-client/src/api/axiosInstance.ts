// src/api/axiosInstance.ts
import axios from 'axios'
import { clearAuthTokens, getAuthTokens, setAuthTokens } from './tokenVault'

const DEFAULT_RAILWAY_API_URL = 'https://feathers-global-main-production.up.railway.app/api'

const resolveDefaultApiBaseUrl = () => {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname.toLowerCase()
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
      return 'http://localhost:4000/api'
    }
  }

  return DEFAULT_RAILWAY_API_URL
}

export const API_BASE_URL = (import.meta.env.VITE_API_URL || resolveDefaultApiBaseUrl()).replace(/\/+$/, '')

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
})

let refreshPromise: Promise<{ accessToken: string; refreshToken: string }> | null = null

/* ----- attach access token to every request ----- */
api.interceptors.request.use((cfg) => {
  const { accessToken } = getAuthTokens()
  if (accessToken) cfg.headers.Authorization = `Bearer ${accessToken}`

  if (typeof FormData !== 'undefined' && cfg.data instanceof FormData && cfg.headers) {
    if (typeof cfg.headers.delete === 'function') {
      cfg.headers.delete('Content-Type')
    } else {
      delete (cfg.headers as Record<string, unknown>)['Content-Type']
    }
  }

  return cfg
})

/* ----- silent‑refresh once per 401 ----- */
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config

    // Skip refresh if:
    // 1. Not a 401 error
    // 2. Already retried
    // 3. This is the refresh token endpoint itself (avoid infinite loop)
    if (
      err.response?.status !== 401 ||
      original._retry ||
      original.url?.includes('/auth/refresh-token')
    ) {
      return Promise.reject(err)
    }

    original._retry = true

    const { refreshToken } = getAuthTokens()
    if (!refreshToken) {
      console.warn('⚠️ No refresh token available, redirecting to login')
      clearAuthTokens()
      window.location.href = '/login'
      return Promise.reject(err)
    }

    try {
      console.log('🔄 Attempting to refresh access token...')
      if (!refreshPromise) {
        refreshPromise = axios
          .post(
            `${API_BASE_URL}/auth/refresh-token`,
            { refreshToken },
            {
              headers: {
                'x-refresh-token': refreshToken, // ✅ Send in header for better security
              },
            },
          )
          .then(({ data }) => data)
          .finally(() => {
            refreshPromise = null
          })
      }

      const data = await refreshPromise

      if (!data?.accessToken || !data?.refreshToken) {
        throw new Error('Invalid response from refresh token endpoint')
      }

      setAuthTokens(data.accessToken, data.refreshToken)
      original.headers.Authorization = `Bearer ${data.accessToken}`
      
      console.log('✅ Token refreshed successfully, retrying original request')
      return api(original) // retry original request with new token
    } catch (e: unknown) {
      const error = e as { response?: { data?: { error?: string } }; message?: string }
      console.error('❌ Refresh token failed:', error?.response?.data?.error || error?.message || e)
      clearAuthTokens()
      
      // Only redirect if not already on login page
      if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login'
      }
      return Promise.reject(e)
    }
  },
)

export default api
