import { Router } from 'express'
import { authenticateToken, requireRole } from '../../middleware/auth'
import { UsersController } from './users.controller'

const router = Router()

router.get('/', authenticateToken, requireRole(['admin']), UsersController.listUsers)

export default router
