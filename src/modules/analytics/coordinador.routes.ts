import { Router } from 'express'
import { authenticateToken, requireRole } from '../../middleware/auth'
import { coordinadorService } from './coordinador.service'
import { esCoordinador } from './coordinador-resumen'
import { forbidden, sendError } from '../../shared/errors'
import { auditoriaService } from './auditoria.service'

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
    const reporte = await coordinadorService.getReportsOverview(req.user.id, req.query?.period, {
      courseId: req.query?.courseId,
      grupoId: req.query?.grupoId,
    })
    void auditoriaService.registrarComoUsuario(req.user, {
      accion: 'consultar_reportes',
      entidad: 'reporte',
      entidadId: req.query?.period ? String(req.query.period) : null,
      detalle: `Reporte general del periodo ${req.query?.period || 'todos'}`,
    })
    res.json(reporte)
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
    const stats = await coordinadorService.getProfesorStats(req.user.id, req.params.profesorId, req.query?.period)
    void auditoriaService.registrarComoUsuario(req.user, {
      accion: 'consultar_docente',
      entidad: 'profesor',
      entidadId: String(req.params.profesorId),
      detalle: `Estadísticas del docente ${req.params.profesorId}, periodo ${req.query?.period || 'todos'}`,
    })
    res.json(stats)
  } catch (error) {
    return sendError(res, error)
  }
})

/**
 * GET /coordinador/auditoria
 * Registro de acciones de la carrera del coordinador. Query: page, pageSize (máx. 50),
 * accion (programar_encuesta | generar_qr | consultar_reportes | consultar_docente | todas),
 * desde y hasta (AAAA-MM-DD), search.
 */
router.get('/auditoria', authenticateToken, requireRole(['coordinador']), async (req: any, res) => {
  try {
    res.json(await auditoriaService.listar(req.user.id, req.query || {}))
  } catch (error) {
    return sendError(res, error)
  }
})

export default router
