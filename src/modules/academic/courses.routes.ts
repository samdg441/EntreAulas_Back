import { Router } from 'express'
import { authenticateToken } from '../../middleware/auth'
import { CoursesController } from './courses.controller'

const router = Router()

router.get('/by-career/:careerId', authenticateToken, CoursesController.getByCareer)

export default router
