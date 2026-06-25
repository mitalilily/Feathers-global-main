import { useEffect } from 'react'
import { useHistory } from 'react-router-dom'
import { isTokenExpired, useAuthStore } from '../../store/useAuthStore'

export const AdminRoute = ({ children }) => {
  const history = useHistory()
  const { token, refreshToken, userId, logout } = useAuthStore()
  const isAuthenticated = Boolean(
    token &&
      refreshToken &&
      userId &&
      !isTokenExpired(token) &&
      !isTokenExpired(refreshToken),
  )

  useEffect(() => {
    if (!isAuthenticated) {
      logout()
      history.replace('/auth/signin')
    }
  }, [isAuthenticated, logout, history])

  if (!isAuthenticated) return null

  return children
}
