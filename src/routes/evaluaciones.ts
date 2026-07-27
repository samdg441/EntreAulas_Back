import { Router } from 'express'
import { SupabaseDB } from '../config/supabase-only'
import { authenticateToken, requireRole } from '../middleware/auth'

const router = Router()

// GET /evaluaciones - Listar evaluaciones del estudiante
router.get('/', authenticateToken, requireRole(['estudiante']), async (req: any, res) => {
  try {
    const evaluaciones = await SupabaseDB.getEvaluationsByStudent(req.user.id)
    res.json(evaluaciones)
  } catch (error) {
    console.error('Error al obtener evaluaciones:', error)
    res.status(500).json({ error: 'Error interno del servidor' })
  }
})

// GET /evaluaciones/preguntas - Obtener preguntas de evaluación
router.get('/preguntas', authenticateToken, async (req, res) => {
  try {
    const preguntas = await SupabaseDB.getQuestionsWithCategories()
    res.json(preguntas)
  } catch (error) {
    console.error('Error al obtener preguntas:', error)
    res.status(500).json({ error: 'Error interno del servidor' })
  }
})

export default router


