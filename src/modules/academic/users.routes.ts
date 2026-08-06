import { Router } from 'express'
import { authenticateToken, requireRole } from '../../middleware/auth'
import { UsersController } from './users.controller'

const router = Router()

router.use(authenticateToken, requireRole(['admin']))

router.get('/', UsersController.listUsers)
router.get('/academic-structure', UsersController.getAcademicStructure)
router.get('/grupos-by-career/:careerId', UsersController.getGruposByCareer)
router.put('/:id', UsersController.updateUser)
router.delete('/:id', UsersController.deactivateUser)

export default router
