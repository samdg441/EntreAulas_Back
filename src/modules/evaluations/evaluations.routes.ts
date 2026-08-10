import { Router } from 'express'
import { EvaluationsController } from './evaluations.controller'
import { authenticateToken, requireRole } from '../../middleware/auth'
import { supabaseAdmin } from '../../config/supabase-only'

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
    const { data, error } = await supabaseAdmin
      .from('categorias_pregunta')
      .select('id, nombre, descripcion, orden')
      .order('orden', { ascending: true })
    if (error) throw error
    res.json({ categories: data || [] })
  } catch (e) {
    console.error('GET /api/evaluations/categories:', e)
    res.status(500).json({ error: 'Error al listar categorías' })
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
