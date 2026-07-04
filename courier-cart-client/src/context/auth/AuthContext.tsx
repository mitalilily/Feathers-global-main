import { useQueryClient } from '@tanstack/react-query'
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react'
import { logoutApi } from '../../api/auth'
import {
  clearAuthTokens,
  getAuthTokens,
  getStoredSessionUser,
  setAuthTokens,
  setStoredSessionUser,
} from '../../api/tokenVault'
import { useUserProfile } from '../../hooks/User/useUserProfile'
import type { IUserProfileDB } from '../../types/user.types'
import { getCurrentAuthScope } from '../../utils/authQueryKeys'
import { emptyUserProfile } from '../../utils/utility'

type SessionUser = Partial<IUserProfileDB>

/* ---------- context shape ---------- */
interface AuthCtx {
  setUserId: Dispatch<SetStateAction<string>>
  userId: string
  user: IUserProfileDB
  loading: boolean
  isAuthenticated: boolean
  setTokens: (access: string, refresh: string, sessionUser?: SessionUser | null) => void
  clearTokens: () => void
  logout: () => Promise<void>
  refetchUser: () => void
  walletBalance: number | null
  setWalletBalance: Dispatch<SetStateAction<number | null>>
}

export const AuthContext = createContext<AuthCtx | undefined>(undefined)

/* ---------- provider ---------- */
export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const queryClient = useQueryClient()

  const { accessToken, refreshToken } = getAuthTokens()
  const hasTokens = !!accessToken && !!refreshToken

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(hasTokens)
  const [authScope, setAuthScope] = useState<string>(getCurrentAuthScope())
  const [authCheckTimedOut, setAuthCheckTimedOut] = useState(false)
  const [walletBalance, setWalletBalance] = useState<number | null>(null)
  const [userId, setUserId] = useState('')
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(() =>
    getStoredSessionUser<SessionUser>(),
  )

  const {
    data: user,
    isFetching: userFetching,
    isError: userProfileError,
    refetch: refetchUser,
  } = useUserProfile(isAuthenticated, authScope)

  useEffect(() => {
    if (!isAuthenticated || user?.id || userProfileError) {
      setAuthCheckTimedOut(false)
      return
    }

    const timeout = window.setTimeout(() => {
      setAuthCheckTimedOut(true)
    }, 3500)

    return () => window.clearTimeout(timeout)
  }, [isAuthenticated, user?.id, userProfileError])

  useEffect(() => {
    // If we successfully fetched a user, ensure auth is marked as true.
    if (user?.id) {
      setIsAuthenticated(true)
      setSessionUser(user)
      setStoredSessionUser(user)
    }
    // Do NOT automatically mark user as unauthenticated on generic errors here.
    // Auth state should primarily follow presence of valid tokens; 401 handling
    // is done in axios interceptors which clear tokens and redirect as needed.
  }, [user])

  const setTokens = (access: string, refresh: string, nextSessionUser?: SessionUser | null) => {
    queryClient.removeQueries({ queryKey: ['userInfo'] })
    queryClient.removeQueries({ queryKey: ['userProfile'] })
    queryClient.removeQueries({ queryKey: ['walletBalance'] })
    queryClient.removeQueries({ queryKey: ['walletTransactions'] })
    setAuthTokens(access, refresh)
    if (nextSessionUser) {
      setSessionUser(nextSessionUser)
      setStoredSessionUser(nextSessionUser)
      setUserId(nextSessionUser.id ?? '')
    } else {
      setSessionUser(null)
      setUserId('')
    }
    setAuthScope(getCurrentAuthScope())
    setWalletBalance(null)
    setAuthCheckTimedOut(false)
    setIsAuthenticated(true)
  }

  const clearTokens = () => {
    clearAuthTokens()
    setSessionUser(null)
    setAuthScope(getCurrentAuthScope())
    setIsAuthenticated(false)
    setUserId('')
    setWalletBalance(null)
    setAuthCheckTimedOut(false)
    queryClient.removeQueries({ queryKey: ['userInfo'] })
    queryClient.removeQueries({ queryKey: ['userProfile'] })
    queryClient.removeQueries({ queryKey: ['walletBalance'] })
    queryClient.removeQueries({ queryKey: ['walletTransactions'] })
  }

  const logout = async () => {
    try {
      await logoutApi()
    } catch (e) {
      console.error('Logout error ignored:', e)
    }
    clearTokens()
    window.location.href = '/login'
  }

  const activeUser = (user ?? sessionUser ?? { ...emptyUserProfile }) as IUserProfileDB
  const hasResolvedUser = Boolean(user?.id || sessionUser?.id)
  const value: AuthCtx = {
    user: activeUser,
    loading:
      isAuthenticated &&
      !hasResolvedUser &&
      userFetching &&
      !userProfileError &&
      !authCheckTimedOut,
    isAuthenticated,
    setUserId,
    setTokens,
    clearTokens,
    userId,
    logout,
    refetchUser,
    walletBalance,
    setWalletBalance,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/* ---------- hook ---------- */
export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
