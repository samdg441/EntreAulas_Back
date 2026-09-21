import { Router } from 'express'
import { EvaluationsController } from './evaluations.controller'
import { authenticateToken, requireRole } from '../../middleware/auth'
import {
  internal,
  sendError,
} from '../../shared/errors'
import { evaluationsRepository } from './evaluations.repository'

const router = Router()

router.use(authenticateToken)

router.get('/questions/career/:carreraId?', EvaluationsController.getQuestionsByCareer)
router.get('/questions', EvaluationsController.getAllQuestions)
router.get(
  '/questions/category/:categoriaId/career/:carreraId?',
  EvaluationsController.getQuestionsByCategoryAndCareer
)

/** Categorías de pregunta (para armar encuestas). */
router.get('/categories', async (_req, res) => {
  try {
    const data = await evaluationsRepository.listCategorias()
    res.json({ categories: data || [] })
  } catch (e) {
    return sendError(res, internal('Error al listar categorías'))
  }
})

/** Crear / editar / desactivar preguntas: admin (y coordinador opcional). */
router.post(
  '/questions',
  requireRole(['admin', 'coordinador']),
  EvaluationsController.createQuestion
)
router.put(
  '/questions/:id',
  requireRole(['admin', 'coordinador']),
  EvaluationsController.updateQuestion
)
router.delete(
  '/questions/:id',
  requireRole(['admin', 'coordinador']),
  EvaluationsController.deactivateQuestion
)

export default router
