import { Router } from 'express'
import { authenticateToken, requireRole } from '../../middleware/auth'
import { evaluationsService } from './evaluations.service'
import {
  sendError,
} from '../../shared/errors'


const router = Router()

router.get(
  '/',
  authenticateToken,
  requireRole(['profesor', 'coordinador', 'admin']),
  async (req: any, res) => {
    try {
      const { periodo_id, grupo_id } = req.query
      const filters: Record<string, unknown> = {}

      if (req.user.tipo_usuario === 'profesor') {
        filters.profesor_id = req.user.id
      }
      if (periodo_id) filters.periodo_id = parseInt(periodo_id as string)
      if (grupo_id) filters.grupo_id = parseInt(grupo_id as string)

      const evaluaciones = await evaluationsService.getCompletedResults(filters)
      res.json(evaluaciones)
    } catch (error) {
      console.error('Error al obtener resultados:', error)
      return sendError(res, error)
    }
  }
)

router.get(
  '/estadisticas',
  authenticateToken,
  requireRole(['profesor', 'coordinador', 'admin']),
  async (req: any, res) => {
    try {
      const { periodo_id, grupo_id } = req.query
      const filters: Record<string, unknown> = {}

      if (req.user.tipo_usuario === 'profesor') {
        filters.profesor_id = req.user.id
      }
      if (periodo_id) filters.periodo_id = parseInt(periodo_id as string)
      if (grupo_id) filters.grupo_id = parseInt(grupo_id as string)

      const estadisticas = await evaluationsService.getRatingStatistics(filters)
      res.json(estadisticas)
    } catch (error) {
      console.error('Error al obtener estadísticas:', error)
      return sendError(res, error)
    }
  }
)

export default router
