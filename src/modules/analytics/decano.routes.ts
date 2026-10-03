import { Router } from 'express'
import { authenticateToken } from '../../middleware/auth'
import { academicRepository } from '../academic/academic.repository'
import { coordinadorService } from './coordinador.service'
import { filtrarCarrerasSinTronco } from './teachers-analytics.service'
import { forbidden, internal, notFound, sendError } from '../../shared/errors'

const router = Router()

export function esDecano(user: { roles?: string[]; tipo_usuario?: string } | undefined): boolean {
  return Boolean(user?.roles?.includes('decano') || user?.tipo_usuario === 'decano')
}

/** Carreras del reporte: la pedida (si existe y está activa) o todas las activas sin tronco común. */
export async function carrerasDelReporte(careerId: unknown): Promise<number[]> {
  let carreras: any[]
  try {
    carreras = filtrarCarrerasSinTronco(await academicRepository.listCarreras('id, nombre, activa'))
  } catch (error) {
    throw internal('Error obteniendo carreras', error)
  }
  const ids = carreras.map((c: any) => Number(c.id))
  const pedido = String(careerId ?? '').trim()
  if (!pedido || pedido === 'all') return ids
  if (!ids.includes(Number(pedido))) throw notFound('Carrera no encontrada')
  return [Number(pedido)]
}

/**
 * GET /decano/reports-overview?period=AAAA-S&careerId=&courseId=&grupoId=
 * Mismo reporte del coordinador, para una carrera o para toda la facultad.
 */
router.get('/reports-overview', authenticateToken, async (req: any, res) => {
  try {
    if (!esDecano(req.user)) {
      throw forbidden('Solo el decano puede acceder a esta información.')
    }
    const carreraIds = await carrerasDelReporte(req.query?.careerId)
    res.json(
      await coordinadorService.reporteDeCarreras(carreraIds, req.query?.period, {
        courseId: req.query?.courseId,
        grupoId: req.query?.grupoId,
      })
    )
  } catch (error) {
    return sendError(res, error)
  }
})

export default router
