import { Router } from 'express'
import { EvaluationsController } from './evaluations.controller'
import { authenticateToken, requireRole } from '../../middleware/auth'

const router = Router()

router.get(
  '/',
  authenticateToken,
  requireRole(['estudiante']),
  EvaluationsController.listStudentEvaluations
)

router.get('/preguntas', authenticateToken, EvaluationsController.listQuestionsSimple)

export default router
