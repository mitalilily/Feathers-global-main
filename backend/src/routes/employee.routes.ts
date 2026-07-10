import { Router } from 'express'
import {
  createEmployee,
  deleteEmployee,
  getEmployee,
  getEmployeesByAdmin,
  toggleEmployeeStatusController,
  updateEmployee,
} from '../controllers/employee.controller'
import { requireNonEmployeeUser } from '../middlewares/requireEmployeeModuleAccess'
import { requireAuth } from '../middlewares/requireAuth'

const router = Router()

router.use(requireAuth, requireNonEmployeeUser)

router.get('/users', getEmployeesByAdmin)
router.get('/:id', getEmployee)
router.post('/create', createEmployee)
router.patch('/update/:id', updateEmployee)
router.delete('/delete/:id', deleteEmployee)
router.patch('/:id/toggle', toggleEmployeeStatusController)

export default router
