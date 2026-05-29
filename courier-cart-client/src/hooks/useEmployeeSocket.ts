import { useEffect } from 'react'
import { getEmployeeByUserId } from '../api/employee.service'
import { useAuth } from '../context/auth/AuthContext'
import { disconnectSocket, registerUserSocket } from './User/useUserOnline'

export const useEmployeeSocket = () => {
  const { user, isAuthenticated } = useAuth()
  const authUserId = user?.id

  useEffect(() => {
    if (!isAuthenticated || !authUserId) return

    const initSocket = async () => {
      const employee = await getEmployeeByUserId(authUserId)
      if (employee?.employee?.isActive) {
        registerUserSocket({ id: authUserId, role: 'employee' })
      }
    }

    initSocket()
    return () => disconnectSocket()
  }, [authUserId, isAuthenticated])
}
