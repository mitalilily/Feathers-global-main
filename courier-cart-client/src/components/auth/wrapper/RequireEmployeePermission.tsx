import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import useEmployeePermissions from '../../../hooks/User/useEmployeePermissions'

interface RequireEmployeePermissionProps {
  permission: string
  children: ReactNode
  fallbackPath?: string
}

export default function RequireEmployeePermission({
  permission,
  children,
  fallbackPath = '/home',
}: RequireEmployeePermissionProps) {
  const location = useLocation()
  const { canAccess } = useEmployeePermissions()

  if (!canAccess(permission)) {
    return <Navigate to={fallbackPath} replace state={{ from: location }} />
  }

  return <>{children}</>
}
