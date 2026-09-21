import { Router } from 'express'
import { authenticateToken, requireRole } from '../../middleware/auth'
import { coordinadorService } from './coordinador.service'
import { esCoordinador } from './coordinador-resumen'
import { forbidden, sendError } from '../../shared/errors'

const router = Router()

/**
 * GET /coordinador/cursos-con-profesor
 * Lista grupos/cursos de la carrera del coordinador con nombre del profesor.
 * Solo coordinadores. Devuelve: { id, cursoNombre, cursoCodigo, grupo, profesorNombre }
 * (id = grupo.id para usar en batch de QRs)
 */
router.get(
  '/cursos-con-profesor',
  authenticateToken,
  requireRole(['coordinador']),
  async (req: any, res) => {
    try {
      res.json(await coordinadorService.listCursosConProfesor(req.user.id))
    } catch (error: any) {
      return sendError(res, error)
    }
  }
)

/**
 * GET /coordinador/dashboard-summary
 * Resumen del dashboard del coordinador + listado paginado de docentes de su carrera.
 * Query:
 * - page: number (default 1)
 * - pageSize: number (default 8, max 50)
 * - search: string (opcional, filtra por nombre/apellido/email)
 */
router.get('/dashboard-summary', authenticateToken, async (req: any, res) => {
  try {
    if (!esCoordinador(req.user)) {
      throw forbidden('Solo coordinadores pueden acceder a esta información.')
    }
    res.json(await coordinadorService.getDashboardSummary(req.user.id, req.query || {}))
  } catch (error) {
    return sendError(res, error)
  }
})

/**
 * GET /coordinador/reports-overview
 * Reportes del coordinador para su carrera:
 * - cards de resumen
 * - distribución de calificaciones
 * - promedios por categoría
 * - tendencia por periodos recientes
 */
router.get('/reports-overview', authenticateToken, async (req: any, res) => {
  try {
    if (!esCoordinador(req.user)) {
      throw forbidden('Solo coordinadores pueden acceder a esta información.')
    }
    res.json(await coordinadorService.getReportsOverview(req.user.id, req.query?.period))
  } catch (error) {
    return sendError(res, error)
  }
})

/**
 * GET /coordinador/profesor-stats/:profesorId
 * Estadísticas de evaluación de un docente de la carrera del coordinador.
 */
router.get('/profesor-stats/:profesorId', authenticateToken, async (req: any, res) => {
  try {
    if (!esCoordinador(req.user)) {
      throw forbidden('Solo coordinadores pueden acceder a esta información.')
    }
    res.json(
      await coordinadorService.getProfesorStats(req.user.id, req.params.profesorId, req.query?.period)
    )
  } catch (error) {
    return sendError(res, error)
  }
})

export default router
