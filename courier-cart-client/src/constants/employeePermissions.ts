export type EmployeeModuleAccess = {
  dashboard?: {
    walletBalance?: boolean
  }
  warehouse?: {
    viewWarehouse?: boolean
    editWarehouse?: boolean
    createWarehouse?: boolean
  }
  wallet?: {
    viewWallet?: boolean
    rechargeWallet?: boolean
  }
  tools?: {
    shippingChargeRateCalculator?: boolean
  }
  returnOrders?: {
    viewReturnOrder?: boolean
    addReturnOrder?: boolean
  }
  orders?: {
    cancelOrders?: boolean
    exportOrders?: boolean
    exportCustomerDetails?: boolean
    viewCustomerDetails?: boolean
    changePaymentMode?: boolean
  }
  [key: string]: any
}

export type EmployeePermissionGroupKey =
  | 'dashboard'
  | 'warehouse'
  | 'wallet'
  | 'tools'
  | 'returnOrders'
  | 'orders'

export type EmployeePermissionDefinition = {
  key: string
  label: string
  description?: string
}

export const DEFAULT_EMPLOYEE_MODULE_ACCESS: Required<EmployeeModuleAccess> = {
  dashboard: {
    walletBalance: false,
  },
  warehouse: {
    viewWarehouse: false,
    editWarehouse: false,
    createWarehouse: false,
  },
  wallet: {
    viewWallet: false,
    rechargeWallet: false,
  },
  tools: {
    shippingChargeRateCalculator: false,
  },
  returnOrders: {
    viewReturnOrder: false,
    addReturnOrder: false,
  },
  orders: {
    cancelOrders: false,
    exportOrders: false,
    exportCustomerDetails: false,
    viewCustomerDetails: false,
    changePaymentMode: false,
  },
}

export const EMPLOYEE_PERMISSION_GROUPS: Array<{
  key: EmployeePermissionGroupKey
  label: string
  permissions: EmployeePermissionDefinition[]
}> = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    permissions: [{ key: 'walletBalance', label: 'Wallet Balance' }],
  },
  {
    key: 'warehouse',
    label: 'Warehouse',
    permissions: [
      { key: 'viewWarehouse', label: 'View Warehouse' },
      { key: 'editWarehouse', label: 'Edit Warehouse' },
      { key: 'createWarehouse', label: 'Create Warehouse' },
    ],
  },
  {
    key: 'wallet',
    label: 'Wallet',
    permissions: [
      { key: 'viewWallet', label: 'View Wallet' },
      { key: 'rechargeWallet', label: 'Recharge Wallet' },
    ],
  },
  {
    key: 'tools',
    label: 'Tools',
    permissions: [{ key: 'shippingChargeRateCalculator', label: 'Shipping Charge Rate Calculator' }],
  },
  {
    key: 'returnOrders',
    label: 'Return Order',
    permissions: [
      { key: 'viewReturnOrder', label: 'View Return Order' },
      { key: 'addReturnOrder', label: 'Add Return Order' },
    ],
  },
  {
    key: 'orders',
    label: 'Orders',
    permissions: [
      { key: 'cancelOrders', label: 'Cancel Orders' },
      { key: 'exportOrders', label: 'Export Orders' },
      { key: 'exportCustomerDetails', label: 'Export Customer Details' },
      { key: 'viewCustomerDetails', label: 'View Customer Details' },
      { key: 'changePaymentMode', label: 'Change Payment Mode' },
    ],
  },
]

const isPlainObject = (value: unknown): value is Record<string, any> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

export const mergeEmployeeModuleAccess = (
  moduleAccess?: EmployeeModuleAccess | null,
): Required<EmployeeModuleAccess> => ({
  dashboard: {
    ...DEFAULT_EMPLOYEE_MODULE_ACCESS.dashboard,
    ...(isPlainObject(moduleAccess?.dashboard) ? moduleAccess?.dashboard : {}),
  },
  warehouse: {
    ...DEFAULT_EMPLOYEE_MODULE_ACCESS.warehouse,
    ...(isPlainObject(moduleAccess?.warehouse) ? moduleAccess?.warehouse : {}),
  },
  wallet: {
    ...DEFAULT_EMPLOYEE_MODULE_ACCESS.wallet,
    ...(isPlainObject(moduleAccess?.wallet) ? moduleAccess?.wallet : {}),
  },
  tools: {
    ...DEFAULT_EMPLOYEE_MODULE_ACCESS.tools,
    ...(isPlainObject(moduleAccess?.tools) ? moduleAccess?.tools : {}),
  },
  returnOrders: {
    ...DEFAULT_EMPLOYEE_MODULE_ACCESS.returnOrders,
    ...(isPlainObject(moduleAccess?.returnOrders) ? moduleAccess?.returnOrders : {}),
  },
  orders: {
    ...DEFAULT_EMPLOYEE_MODULE_ACCESS.orders,
    ...(isPlainObject(moduleAccess?.orders) ? moduleAccess?.orders : {}),
  },
})

export const hasEmployeePermission = (
  moduleAccess: EmployeeModuleAccess | null | undefined,
  path: string,
) => {
  const merged = mergeEmployeeModuleAccess(moduleAccess)
  const value = path.split('.').reduce<unknown>((current, segment) => {
    if (!isPlainObject(current)) return undefined
    return current[segment]
  }, merged)

  return value === true
}
