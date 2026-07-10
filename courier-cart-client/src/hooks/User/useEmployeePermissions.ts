import { useAuth } from '../../context/auth/AuthContext'
import {
  hasEmployeePermission,
  mergeEmployeeModuleAccess,
  type EmployeeModuleAccess,
} from '../../constants/employeePermissions'

export const useEmployeePermissions = () => {
  const { user } = useAuth()

  const isEmployee = user.role === 'employee'
  const moduleAccess = mergeEmployeeModuleAccess(user.moduleAccess as EmployeeModuleAccess | null)

  const allowForNonEmployees = (value: boolean | undefined) =>
    isEmployee ? value === true : true

  const canAccess = (path: string) =>
    isEmployee
      ? hasEmployeePermission(moduleAccess, path)
      : true

  return {
    isEmployee,
    employeeRole: user.employeeRole ?? null,
    employeeIsActive: user.employeeIsActive ?? null,
    moduleAccess,
    canAccess,
    canViewDashboardWalletBalance: canAccess('dashboard.walletBalance'),
    canViewWarehouse: canAccess('warehouse.viewWarehouse'),
    canEditWarehouse: canAccess('warehouse.editWarehouse'),
    canCreateWarehouse: canAccess('warehouse.createWarehouse'),
    canViewWallet: canAccess('wallet.viewWallet'),
    canRechargeWallet: canAccess('wallet.rechargeWallet'),
    canUseRateCalculator: canAccess('tools.shippingChargeRateCalculator'),
    canViewReturnOrders: canAccess('returnOrders.viewReturnOrder'),
    canAddReturnOrders: canAccess('returnOrders.addReturnOrder'),
    canCancelOrders: allowForNonEmployees(moduleAccess.orders.cancelOrders),
    canExportOrders: allowForNonEmployees(moduleAccess.orders.exportOrders),
    canExportCustomerDetails: allowForNonEmployees(moduleAccess.orders.exportCustomerDetails),
    canViewCustomerDetails: allowForNonEmployees(moduleAccess.orders.viewCustomerDetails),
    canChangePaymentMode: allowForNonEmployees(moduleAccess.orders.changePaymentMode),
  }
}

export default useEmployeePermissions
