import { useEffect } from 'react'
import { getEmployeeByUserId } from '../api/employee.service'
import { useAuth } from '../context/auth/AuthContext'
import { disconnectSocket, registerUserSocket } from './User/useUserOnline'

export const useEmployeeSocket = () => {
  const { user, isAuthenticated } = useAuth()
  const authUserId = user?.id
  const employeeRole = user?.employeeRole
  const employeeIsActive = user?.employeeIsActive

  useEffect(() => {
    if (!isAuthenticated || !authUserId || !employeeRole) return

    const initSocket = async () => {
      if (employeeIsActive) {
        registerUserSocket({ id: authUserId, role: 'employee' })
        return
      }

      try {
        const employee = await getEmployeeByUserId(authUserId)
        if (employee?.employee?.isActive) {
          registerUserSocket({ id: authUserId, role: 'employee' })
        }
      } catch (error) {
        console.warn('Skipping employee socket setup:', error)
      }
    }

    initSocket()
    return () => disconnectSocket()
  }, [authUserId, employeeIsActive, employeeRole, isAuthenticated])
}
