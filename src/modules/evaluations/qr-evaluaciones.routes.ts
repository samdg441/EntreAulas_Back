import { Router } from 'express'
import { authenticateToken, requireRole } from '../../middleware/auth'
import { RoleService } from '../auth/role.service'
import { sendMail } from '../../shared/adapters/mailer.adapter'
import { academicRepository } from '../academic/academic.repository'
import { qrRepository } from './qr.repository'
import { generarQrsBatch } from './qr-batch'
import { mapearRespuestaQr, resolverEvaluacionQr } from './qr-resolucion'
import {
  AppError,
  badRequest,
  forbidden,
  internal,
  notFound,
  sendError,
  unavailable,
} from '../../shared/errors'

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
    const user = req.user
    const isCoordinador = user?.tipo_usuario === 'coordinador' || user?.roles?.includes('coordinador')

    const { to, subject, message, grupoIds } = req.body || {}
    const email = String(to || '').trim()
    const emailRegex = /^[^@\s]{1,64}@[^@\s]{1,255}\.[^@\s]{1,63}$/
    if (!email || !emailRegex.test(email)) {
      throw badRequest('Correo de destino inválido.')
    }

    const mailSubject = String(subject || '').trim()
    if (!mailSubject) {
      throw badRequest('El asunto es requerido.')
    }

    if (!Array.isArray(grupoIds) || grupoIds.length === 0) {
      throw badRequest('Se requiere grupoIds (array de IDs de grupo).')
    }
    const ids = Array.from(new Set(grupoIds.map((id: any) => Number(id)).filter((n: number) => Number.isFinite(n))))
    if (ids.length === 0) {
      throw badRequest('grupoIds debe contener números válidos.')
    }

    let carreraId: number | null = null
    if (isCoordinador) {
      const coordinador = await RoleService.obtenerCoordinadorPorUsuario(user.id)
      if (!coordinador?.carrera_id) {
        throw forbidden('Coordinador sin carrera asignada o no encontrado.')
      }
      carreraId = Number(coordinador.carrera_id)
    }

    let rowsList: any[] = []
    try {
      rowsList = await qrRepository.listActivosParaShare(ids)
    } catch (rowsError: any) {
      throw internal('Error consultando QRs', rowsError?.message)
    }
    if (rowsList.length === 0) {
      throw notFound('No hay QRs activos para los grupos seleccionados.')
    }

    const filteredRows = carreraId == null
      ? rowsList
      : rowsList.filter((r: any) => {
          const curso = Array.isArray(r.curso) ? r.curso[0] : r.curso
          return Number(curso?.carrera_id) === carreraId
        })

    if (filteredRows.length === 0) {
      throw forbidden('Los grupos seleccionados no pertenecen a tu carrera.')
    }

    let appBaseUrl = String(process.env.FRONTEND_URL || process.env.VITE_PUBLIC_APP_URL || 'http://localhost:5173')
    while (appBaseUrl.endsWith('/')) {
      appBaseUrl = appBaseUrl.slice(0, -1)
    }

    const links = filteredRows.map((r: any) => {
      const curso = Array.isArray(r.curso) ? r.curso[0] : r.curso
      const grupo = Array.isArray(r.grupo) ? r.grupo[0] : r.grupo
      const profesor = Array.isArray(r.profesor) ? r.profesor[0] : r.profesor
      const usuario = Array.isArray(profesor?.usuario) ? profesor?.usuario[0] : profesor?.usuario
      const profesorNombre = `${String(usuario?.nombre || '')} ${String(usuario?.apellido || '')}`.trim() || 'Docente'
      return {
        grupoId: Number(r.grupo_id),
        url: `${appBaseUrl}/qr-evaluacion?token=${encodeURIComponent(String(r.token))}`,
        cursoNombre: String(curso?.nombre || 'Curso'),
        cursoCodigo: String(curso?.codigo || ''),
        grupoNumero: String(grupo?.numero_grupo ?? r.grupo_id),
        profesorNombre
      }
    })

    const textBody =
      `${String(message || '').trim()}\n\n` +
      links
        .map((l, idx) => `${idx + 1}. ${l.cursoNombre} (${l.cursoCodigo}) - Grupo ${l.grupoNumero} - ${l.profesorNombre}\n${l.url}`)
        .join('\n\n')

    const htmlItems = links
      .map(
        (l, idx) =>
          `<li style="margin-bottom:12px">
            <strong>${idx + 1}. ${l.cursoNombre} (${l.cursoCodigo})</strong><br/>
            Grupo: ${l.grupoNumero}<br/>
            Docente: ${l.profesorNombre}<br/>
            <a href="${l.url}" target="_blank" rel="noreferrer">${l.url}</a>
          </li>`
      )
      .join('')

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; color: #111827;">
        <p>${String(message || '').trim() || 'Compartimos los códigos QR de evaluación para los siguientes grupos:'}</p>
        <ol>${htmlItems}</ol>
      </div>
    `

    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS || !process.env.SMTP_FROM) {
      throw unavailable('Servicio de correo no configurado. Faltan variables SMTP en el backend.')
    }

    await sendMail({
      to: email,
      subject: mailSubject,
      text: textBody,
      html: htmlBody
    })

    res.json({
      message: 'Correo enviado correctamente',
      sentTo: email,
      totalLinks: links.length
    })
  } catch (error: any) {
    return sendError(
      res,
      error instanceof AppError
        ? error
        : internal('Error enviando el correo', error?.message || 'Error interno del servidor')
    )
  }
})

/**
 * GET /qr-evaluaciones/:token
 * Resuelve un token y devuelve { profesorId, materiaId/cursoId, grupoId, periodoId } o 404.
 */
router.get('/:token', async (req: any, res) => {
  try {
    const { token } = req.params
    if (!token) {
      const r = resolverEvaluacionQr({})
      if (!r.ok) throw new AppError(r.status, r.error)
    }

    let row: any = null
    let errorBd = false
    try {
      row = await qrRepository.findActivoByToken(token)
    } catch {
      errorBd = true
    }

    const resultado = resolverEvaluacionQr({
      token,
      errorBd,
      qr: row
        ? {
            activo: true,
            profesor_id: (row as { profesor_id?: unknown }).profesor_id,
            curso_id: (row as { curso_id?: unknown }).curso_id,
            grupo_id: (row as { grupo_id?: unknown }).grupo_id,
          }
        : null,
    })
    if (!resultado.ok) {
      throw new AppError(resultado.status, resultado.error)
    }

    res.json(mapearRespuestaQr(row as Record<string, unknown>))
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
    const { token } = req.params
    const user = req.user

    if (!token) {
      throw badRequest('Token requerido.')
    }

    if (!user || user.tipo_usuario !== 'estudiante') {
      throw forbidden('Solo los estudiantes pueden matricularse por QR.')
    }

    // Resolver estudiante por usuario autenticado
    const estudiante = await academicRepository.findEstudianteByUsuarioId(user.id)

    if (!estudiante) {
      throw notFound('No se encontró registro de estudiante para este usuario.')
    }

    // Resolver QR activo y grupo destino
    let qrRow: any = null
    try {
      qrRow = await qrRepository.findActivoGrupoByToken(token)
    } catch {
      throw internal('Error resolviendo el QR.')
    }

    if (!qrRow?.grupo_id) {
      throw notFound('QR inválido o expirado.')
    }

    const grupoId = Number(qrRow.grupo_id)

    // Buscar inscripción existente
    let inscExistente: any = null
    try {
      inscExistente = await academicRepository.findInscripcion(estudiante.id, grupoId)
    } catch {
      throw internal('Error validando inscripción existente.')
    }

    if (inscExistente?.id) {
      if (inscExistente.activa === true) {
        return res.json({
          enrolled: false,
          alreadyEnrolled: true,
          estudianteId: estudiante.id,
          grupoId
        })
      }

      // Intentar reactivar inscripción previa
      try {
        await academicRepository.reactivateInscripcion(inscExistente.id)
      } catch {
        throw internal('No se pudo reactivar la inscripción existente.')
      }
      return res.json({
        enrolled: true,
        reactivated: true,
        estudianteId: estudiante.id,
        grupoId
      })
    }

    // Crear inscripción nueva (fallback si el esquema no usa columna activa)
    try {
      await academicRepository.insertInscripcion(estudiante.id, grupoId)
    } catch {
      throw internal('No se pudo crear la inscripción automática.')
    }
    return res.status(201).json({
      enrolled: true,
      created: true,
      estudianteId: estudiante.id,
      grupoId
    })
  } catch (error) {
    return sendError(res, error)
  }
})

export default router
