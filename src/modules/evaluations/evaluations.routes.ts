import { Router } from 'express'
import { EvaluationsController } from './evaluations.controller'
import { authenticateToken, requireRole } from '../../middleware/auth'
import {
  badRequest,
  conflict,
  internal,
  notFound,
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

/** Encuestas del banco: cada una es una categoría que agrupa preguntas. */
router.get('/categories', async (_req, res) => {
  try {
    const data = await evaluationsRepository.listCategorias()
    res.json({ categories: data || [] })
  } catch (e) {
    return sendError(res, internal('Error al listar categorías'))
  }
})

function datosEncuesta(body: { nombre?: unknown; descripcion?: unknown; orden?: unknown }) {
  const nombre = String(body?.nombre ?? '').trim()
  if (!nombre) throw badRequest('El nombre de la encuesta es obligatorio.')
  const orden = Number(body?.orden)
  if (!Number.isInteger(orden) || orden < 1) throw badRequest('El orden de la encuesta debe ser un entero mayor que cero.')
  const descripcion = String(body?.descripcion ?? '').trim()
  return { nombre, descripcion: descripcion || null, orden }
}

function responderErrorEncuesta(res: Parameters<typeof sendError>[0], e: unknown) {
  const codigo = (e as { code?: string }).code
  if (codigo === '23505') return sendError(res, conflict('Ya existe una encuesta con ese nombre.'))
  return sendError(res, e)
}

router.post('/categories', requireRole(['admin', 'coordinador']), async (req, res) => {
  try {
    const creada = await evaluationsRepository.createCategoria(datosEncuesta(req.body))
    res.status(201).json({ category: creada })
  } catch (e) {
    return responderErrorEncuesta(res, e)
  }
})

router.put('/categories/:id', requireRole(['admin', 'coordinador']), async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id < 1) throw badRequest('La encuesta no es válida.')
    const actualizada = await evaluationsRepository.updateCategoria(id, datosEncuesta(req.body))
    if (!actualizada) throw notFound('La encuesta no existe.')
    res.json({ category: actualizada })
  } catch (e) {
    return responderErrorEncuesta(res, e)
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
