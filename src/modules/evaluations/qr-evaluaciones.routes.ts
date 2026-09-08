import { Router } from 'express'
import { randomUUID } from 'crypto'
import { authenticateToken, requireRole } from '../../middleware/auth'
import { RoleService } from '../auth/role.service'
import { sendMail } from '../../shared/adapters/mailer.adapter'
import { academicRepository } from '../academic/academic.repository'
import { qrRepository } from './qr.repository'
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
    const user = req.user

    const { grupoIds } = req.body || {}
    if (!Array.isArray(grupoIds) || grupoIds.length === 0) {
      throw badRequest('Se requiere grupoIds (array de IDs de grupo).')
    }

    const ids = grupoIds.map((id: any) => Number(id)).filter((n: number) => Number.isFinite(n))
    if (ids.length === 0) {
      throw badRequest('grupoIds debe contener números válidos.')
    }

    const isCoordinador = user?.roles?.includes('coordinador') || user?.tipo_usuario === 'coordinador'
    let carreraId: number | null = null
    if (isCoordinador) {
      const coordinador = await RoleService.obtenerCoordinadorPorUsuario(user.id)
      if (!coordinador?.carrera_id) {
        throw forbidden('Coordinador sin carrera asignada o no encontrado.')
      }
      carreraId = Number(coordinador.carrera_id)
    }

    // Grupos con curso_id (+ posibles columnas de profesor/asignación según esquema)
    let gruposList: any[] = []
    try {
      gruposList = await academicRepository.listGruposByIdsFlexible(ids)
    } catch (gruposError: any) {
      throw internal('Error obteniendo grupos', gruposError?.message)
    }
    const grupoById = new Map(gruposList.map((g: any) => [g.id, g]))

    // Seguridad: si el request viene de un coordinador, solo permitir grupos de su carrera
    let allowedCursoIds: Set<number> | null = null
    if (carreraId != null && gruposList.length > 0) {
      const cursoIds = Array.from(new Set(gruposList.map((g: any) => Number(g.curso_id)).filter((n: number) => Number.isFinite(n))))
      let cursosOk: any[] = []
      try {
        cursosOk = await academicRepository.listCursosActivosInCareer(carreraId, cursoIds)
      } catch (cursosErr: any) {
        throw internal('Error verificando cursos', cursosErr?.message)
      }

      allowedCursoIds = new Set((cursosOk || []).map((c: any) => Number(c.id)))
    }

    // Asignaciones profesor por grupo (tabla preferida) con fallback a cursos_profesor
    let asignaciones: any[] = []
    try {
      asignaciones = await academicRepository.listAsignacionesActivasByGrupoIds(ids)
    } catch {
      try {
        asignaciones = await academicRepository.listAsignacionesByGrupoIds(ids)
      } catch (asigError: any) {
        throw internal('Error obteniendo asignaciones', asigError?.message)
      }
    }

    const asignacionByGrupoId = new Map<number, any>()
    ;(asignaciones || []).forEach((a: any) => {
      asignacionByGrupoId.set(Number(a.grupo_id), a)
    })

    // Idempotencia: si ya existe un QR activo para un grupo_id, reutilizar ese token.
    let existentes: any[] = []
    try {
      existentes = await qrRepository.listActivosByGrupoIds(ids)
    } catch (existentesErr: any) {
      throw internal('Error verificando QRs existentes', existentesErr?.message)
    }

    const existingByGrupoId = new Map<number, any>()
    ;(existentes || []).forEach((r: any) => {
      existingByGrupoId.set(Number(r.grupo_id), r)
    })

    const created: { grupoId: number; token: string }[] = []
    const skipped: { grupoId: number; reason: string }[] = []
    const periodoId = req.body?.periodo_id != null ? Number(req.body.periodo_id) : null

    for (const grupoId of ids) {
      const grupo = grupoById.get(grupoId)
      if (!grupo) continue

      if (allowedCursoIds) {
        const cursoIdGrupo = Number((grupo as any).curso_id)
        if (!allowedCursoIds.has(cursoIdGrupo)) {
          skipped.push({ grupoId, reason: 'El grupo no pertenece a tu carrera.' })
          continue
        }
      }

      const existing = existingByGrupoId.get(grupoId)
      if (existing?.token && existing?.profesor_id) {
        created.push({ grupoId, token: existing.token })
        continue
      }

      const asig = asignacionByGrupoId.get(grupoId)
      // Resolver profesorId: asignación por grupo > grupo.profesor_id > asignacion_profesor_id
      let profesorId = asig?.profesor_id ?? (grupo as any)?.profesor_id ?? null
      const cursoId = Number(grupo.curso_id ?? asig?.curso_id ?? 0)
      if (!cursoId) continue

      // Si el esquema tiene asignacion_profesor_id, intentar resolverlo
      if (!profesorId && (grupo as any)?.asignacion_profesor_id) {
        try {
          const asgRow = await academicRepository.findAsignacionByGrupo(grupoId)
          if (asgRow?.profesor_id) {
            profesorId = asgRow.profesor_id
          }
        } catch {
          // mismo comportamiento: si falla la resolución, se sigue sin profesorId
        }
      }

      if (!profesorId) {
        skipped.push({ grupoId, reason: 'No se pudo resolver profesor_id para este grupo (sin asignación).' })
        continue
      }

      const token = randomUUID()

      const row: any = {
        token,
        profesor_id: profesorId,
        curso_id: cursoId,
        grupo_id: grupoId,
        activo: true
      }
      if (periodoId != null && Number.isFinite(periodoId)) {
        row.periodo_id = periodoId
      }

      try {
        await qrRepository.insert(row)
      } catch {
        continue
      }
      created.push({ grupoId, token })
    }

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
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
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

    const appBaseUrl =
      String(process.env.FRONTEND_URL || process.env.VITE_PUBLIC_APP_URL || 'http://localhost:5173').replace(/\/+$/, '')

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
