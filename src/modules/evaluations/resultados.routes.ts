import { Router } from 'express'
import { authenticateToken, requireRole } from '../../middleware/auth'
import { evaluationsService } from './evaluations.service'
import { filtrosConsultaResultados } from './resultados-filtros'
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
      const filters = filtrosConsultaResultados(req.user, req.query)
      const evaluaciones = await evaluationsService.getCompletedResults(filters)
      res.json(evaluaciones)
    } catch (error) {
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
      const filters = filtrosConsultaResultados(req.user, req.query)
      const estadisticas = await evaluationsService.getRatingStatistics(filters)
      res.json(estadisticas)
    } catch (error) {
      return sendError(res, error)
    }
  }
)

export default router
