import express from 'express'
import {
  createPickupAddressHandler,
  exportPickupAddressesHandler,
  getPickupAddressesHandler,
  importPickupAddressesHandler,
  updatePickupAddressHandler,
} from '../controllers/pickupAddresses.controller'
import { requireEmployeeModuleAccess } from '../middlewares/requireEmployeeModuleAccess'
import { requireAuth } from '../middlewares/requireAuth'

const router = express.Router()

router.use(requireAuth)
router.post('/', requireEmployeeModuleAccess('warehouse.createWarehouse'), createPickupAddressHandler)
router.get('/', requireEmployeeModuleAccess('warehouse.viewWarehouse'), getPickupAddressesHandler)
router.patch('/:id', requireEmployeeModuleAccess('warehouse.editWarehouse'), updatePickupAddressHandler)
router.get('/export', requireEmployeeModuleAccess('warehouse.viewWarehouse'), exportPickupAddressesHandler)
router.post('/import', requireEmployeeModuleAccess('warehouse.createWarehouse'), importPickupAddressesHandler)

export default router
