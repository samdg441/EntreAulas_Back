import { Router } from 'express'
import { authenticateToken, requireRole } from '../../middleware/auth'
import { qrRepository } from './qr.repository'
import { generarQrsBatch } from './qr-batch'
import { autoEnrollPorQr } from './qr-auto-enroll'
import { compartirQrsPorEmail, errorEnvioCorreo } from './qr-share-email'
import { mapearRespuestaQr, resolverEvaluacionQr } from './qr-resolucion'
import { AppError, sendError } from '../../shared/errors'

const router = Router()

/**
 * POST /qr-evaluaciones/batch
 * Body: { grupoIds: number[], period?: string, startDate?: string, endDate?: string }
 * Crea un registro en qr_evaluaciones por cada grupo (profesor y curso se resuelven desde asignaciones_profesor y grupos).
 * Solo coordinadores (o admin). Devuelve: { created: { grupoId, token }[] }
 */
router.post('/batch', authenticateToken, requireRole(['coordinador', 'admin']), async (req: any, res) => {
  try {
    const { created, skipped } = await generarQrsBatch(
      req.user,
      req.body?.grupoIds,
      req.body?.periodo_id
    )
    res.status(201).json({ created, skipped })
  } catch (error) {
    return sendError(res, error)
  }
})

/**
 * POST /qr-evaluaciones/share-email
 * Body: { to: string, subject: string, message?: string, grupoIds: number[] }
 * Envía por correo los links de QR de los grupos seleccionados.
 */
router.post('/share-email', authenticateToken, requireRole(['coordinador', 'admin']), async (req: any, res) => {
  try {
    const { email, totalLinks } = await compartirQrsPorEmail(req.user, req.body)
    res.json({
      message: 'Correo enviado correctamente',
      sentTo: email,
      totalLinks,
    })
  } catch (error) {
    return sendError(res, errorEnvioCorreo(error))
  }
})

/**
 * GET /qr-evaluaciones/:token
 * Resuelve un token y devuelve { profesorId, materiaId/cursoId, grupoId, periodoId } o 404.
 */
router.get('/:token', async (req: any, res) => {
  try {
    res.json(await responderEvaluacionQr(req.params.token))
  } catch (error) {
    return sendError(res, error)
  }
})

/**
 * POST /qr-evaluaciones/:token/auto-enroll
 * Requiere JWT de estudiante. Matricula al estudiante autenticado en el grupo del QR
 * si aún no tiene una inscripción activa.
 */
router.post('/:token/auto-enroll', authenticateToken, async (req: any, res) => {
  try {
    const result = await autoEnrollPorQr(req.params.token, req.user)
    return res.status(result.status).json(result.body)
  } catch (error) {
    return sendError(res, error)
  }
})

async function responderEvaluacionQr(token: string | undefined) {
  if (!token) {
    const r = resolverEvaluacionQr({})
    if (!r.ok) throw new AppError(r.status, r.error)
  }

  const { row, errorBd } = await cargarQrPorToken(token)
  const resultado = resolverEvaluacionQr({
    token,
    errorBd,
    qr: row
      ? {
          activo: true,
          profesor_id: row.profesor_id,
          curso_id: row.curso_id,
          grupo_id: row.grupo_id,
        }
      : null,
  })
  if (!resultado.ok) throw new AppError(resultado.status, resultado.error)
  return mapearRespuestaQr(row as Record<string, unknown>)
}

async function cargarQrPorToken(token: string | undefined) {
  try {
    const row = token ? await qrRepository.findActivoByToken(token) : null
    return { row, errorBd: false }
  } catch {
    return { row: null, errorBd: true }
  }
}

export default router
