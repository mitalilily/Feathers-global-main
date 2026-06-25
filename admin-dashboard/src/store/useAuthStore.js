// store/useAuthStore.js
import { jwtDecode } from 'jwt-decode'
import { create } from 'zustand'

export function isTokenExpired(token) {
  try {
    if (!token) return true
    const decoded = jwtDecode(token)
    return !decoded.exp || decoded.exp < Date.now() / 1000
  } catch (err) {
    return true // treat invalid/undecodable token as expired
  }
}

const removeAuthStorage = () => {
  localStorage.removeItem('accessToken')
  localStorage.removeItem('refreshToken')
  localStorage.removeItem('userId')
}

export const useAuthStore = create((set) => {
  const accessToken = localStorage.getItem('accessToken')
  const refreshToken = localStorage.getItem('refreshToken')
  const userId = localStorage.getItem('userId')

  const isAccessValid = accessToken && !isTokenExpired(accessToken)
  const isRefreshValid = refreshToken && !isTokenExpired(refreshToken)

  if (!isAccessValid || !isRefreshValid) {
    removeAuthStorage()
  }

  return {
    token: isAccessValid && isRefreshValid ? accessToken : null,
    refreshToken: isAccessValid && isRefreshValid ? refreshToken : null,
    userId: isAccessValid && isRefreshValid ? userId : null,
    isLoggedIn: Boolean(isAccessValid && isRefreshValid && userId),

    login: (token, userId, refreshToken) => {
      if (!token || !refreshToken || !userId || isTokenExpired(token) || isTokenExpired(refreshToken)) {
        removeAuthStorage()
        set({
          token: null,
          refreshToken: null,
          userId: null,
          isLoggedIn: false,
        })
        return false
      }

      localStorage.setItem('accessToken', token)
      localStorage.setItem('refreshToken', refreshToken)
      localStorage.setItem('userId', userId)

      set({
        token,
        refreshToken,
        userId,
        isLoggedIn: true,
      })

      return true
    },

    logout: () => {
      removeAuthStorage()
      set({
        token: null,
        refreshToken: null,
        userId: null,
        isLoggedIn: false,
      })
    },
  }
})
