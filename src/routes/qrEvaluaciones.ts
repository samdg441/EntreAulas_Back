import { Router } from 'express'
import { randomUUID } from 'crypto'
import { SupabaseDB } from '../config/supabase-only'
import { authenticateToken } from '../middleware/auth'
import { RoleService } from '../services/roleService'
import { sendMail } from '../mailer'

const router = Router()

/**
 * POST /qr-evaluaciones/batch
 * Body: { grupoIds: number[], period?: string, startDate?: string, endDate?: string }
 * Crea un registro en qr_evaluaciones por cada grupo (profesor y curso se resuelven desde asignaciones_profesor y grupos).
 * Solo coordinadores (o admin). Devuelve: { created: { grupoId, token }[] }
 */
router.post('/batch', authenticateToken, async (req: any, res) => {
  try {
    const user = req.user
    if (!user?.roles?.includes('coordinador') && user?.tipo_usuario !== 'coordinador' && user?.tipo_usuario !== 'admin') {
      return res.status(403).json({ error: 'Solo coordinadores o administradores pueden generar QRs en lote.' })
    }

    const { grupoIds } = req.body || {}
    if (!Array.isArray(grupoIds) || grupoIds.length === 0) {
      return res.status(400).json({ error: 'Se requiere grupoIds (array de IDs de grupo).' })
    }

    const ids = grupoIds.map((id: any) => Number(id)).filter((n: number) => Number.isFinite(n))
    if (ids.length === 0) {
      return res.status(400).json({ error: 'grupoIds debe contener números válidos.' })
    }

    const isCoordinador = user?.roles?.includes('coordinador') || user?.tipo_usuario === 'coordinador'
    let carreraId: number | null = null
    if (isCoordinador) {
      const coordinador = await RoleService.obtenerCoordinadorPorUsuario(user.id)
      if (!coordinador?.carrera_id) {
        return res.status(403).json({
          error: 'Coordinador sin carrera asignada o no encontrado.',
        })
      }
      carreraId = Number(coordinador.carrera_id)
    }

    // Grupos con curso_id (+ posibles columnas de profesor/asignación según esquema)
    const { data: grupos, error: gruposError } = await SupabaseDB.supabaseAdmin
      .from('grupos')
      .select('id, curso_id, profesor_id, asignacion_profesor_id')
      .in('id', ids)

    // Fallback si el esquema no tiene profesor_id / asignacion_profesor_id
    if (gruposError && (gruposError.code === '42703' || String(gruposError?.message || '').includes('column'))) {
      const respFallback = await SupabaseDB.supabaseAdmin
        .from('grupos')
        .select('id, curso_id')
        .in('id', ids)
      if (respFallback.error) {
        console.error('Error grupos en batch (fallback):', respFallback.error)
        return res.status(500).json({ error: 'Error obteniendo grupos', details: respFallback.error.message })
      }
      // @ts-ignore
      ;(respFallback as any).data && (gruposError as any) // noop, solo para mantener estructura mental
      // @ts-ignore
      ;(grupos as any) // noop
      // usaremos más abajo el resultado del fallback
      // (nota: para simplicidad, reasignamos con una variable)
      // eslint-disable-next-line no-inner-declarations
      const gruposListFallback = respFallback.data || []
      // Reemplazar el resultado original
      // @ts-ignore
      ;(req as any).__gruposListFallback = gruposListFallback
    } else if (gruposError) {
      console.error('Error grupos en batch:', gruposError)
      return res.status(500).json({ error: 'Error obteniendo grupos', details: gruposError.message })
    }

    // Tomar grupos desde fallback si aplica
    // @ts-ignore
    const gruposList = ((req as any).__gruposListFallback as any[]) || (grupos || [])
    const grupoById = new Map(gruposList.map((g: any) => [g.id, g]))

    // Seguridad: si el request viene de un coordinador, solo permitir grupos de su carrera
    let allowedCursoIds: Set<number> | null = null
    if (carreraId != null && gruposList.length > 0) {
      const cursoIds = Array.from(new Set(gruposList.map((g: any) => Number(g.curso_id)).filter((n: number) => Number.isFinite(n))))
      const { data: cursosOk, error: cursosErr } = await SupabaseDB.supabaseAdmin
        .from('cursos')
        .select('id')
        .eq('carrera_id', carreraId)
        .eq('activo', true)
        .in('id', cursoIds)

      if (cursosErr) {
        console.error('Error verificando cursos por carreraId:', cursosErr)
        return res.status(500).json({ error: 'Error verificando cursos', details: cursosErr.message })
      }

      allowedCursoIds = new Set((cursosOk || []).map((c: any) => Number(c.id)))
    }

    // Asignaciones profesor por grupo (tabla preferida) con fallback a cursos_profesor
    let asignaciones: any[] = []
    let asigError: any = null
    try {
      const respA = await SupabaseDB.supabaseAdmin
        .from('asignaciones_profesor')
        .select('id, grupo_id, profesor_id, curso_id')
        .in('grupo_id', ids)
        .eq('activa', true)
      asignaciones = respA.data || []
      asigError = respA.error || null
    } catch (e) {
      asigError = e
    }
    if (asigError) {
      console.warn('Fallo asignaciones_profesor en batch; intentando cursos_profesor. Detalle:', asigError)
      const respB = await SupabaseDB.supabaseAdmin
        .from('cursos_profesor')
        .select('id, grupo_id, profesor_id, curso_id')
        .in('grupo_id', ids)
      if (respB.error) {
        console.error('Error cursos_profesor en batch:', respB.error)
        return res.status(500).json({ error: 'Error obteniendo asignaciones', details: respB.error.message })
      }
      asignaciones = respB.data || []
    }

    const asignacionByGrupoId = new Map<number, any>()
    ;(asignaciones || []).forEach((a: any) => {
      asignacionByGrupoId.set(Number(a.grupo_id), a)
    })

    // Idempotencia: si ya existe un QR activo para un grupo_id, reutilizar ese token.
    const { data: existentes, error: existentesErr } = await SupabaseDB.supabaseAdmin
      .from('qr_evaluaciones')
      .select('grupo_id, token, profesor_id')
      .eq('activo', true)
      .in('grupo_id', ids)

    if (existentesErr) {
      console.error('Error buscando QRs existentes:', existentesErr)
      return res.status(500).json({ error: 'Error verificando QRs existentes', details: existentesErr.message })
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
        const { data: asgRow, error: asgErr } = await SupabaseDB.supabaseAdmin
          .from('asignaciones_profesor')
          .select('id, profesor_id')
          .eq('id', (grupo as any).asignacion_profesor_id)
          .maybeSingle()
        if (!asgErr && asgRow?.profesor_id) {
          profesorId = asgRow.profesor_id
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

      const { error: insertError } = await SupabaseDB.supabaseAdmin
        .from('qr_evaluaciones')
        .insert([row])

      if (insertError) {
        console.error('Error insert qr_evaluaciones para grupo', grupoId, insertError)
        continue
      }
      created.push({ grupoId, token })
    }

    res.status(201).json({ created, skipped })
  } catch (error) {
    console.error('Error POST /qr-evaluaciones/batch:', error)
    res.status(500).json({ error: 'Error interno del servidor' })
  }
})

/**
 * POST /qr-evaluaciones/share-email
 * Body: { to: string, subject: string, message?: string, grupoIds: number[] }
 * Envía por correo los links de QR de los grupos seleccionados.
 */
router.post('/share-email', authenticateToken, async (req: any, res) => {
  try {
    const user = req.user
    const isAdmin = user?.tipo_usuario === 'admin' || user?.roles?.includes('admin')
    const isCoordinador = user?.tipo_usuario === 'coordinador' || user?.roles?.includes('coordinador')
    if (!isAdmin && !isCoordinador) {
      return res.status(403).json({ error: 'Solo coordinadores o administradores pueden compartir QRs por correo.' })
    }

    const { to, subject, message, grupoIds } = req.body || {}
    const email = String(to || '').trim()
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!email || !emailRegex.test(email)) {
      return res.status(400).json({ error: 'Correo de destino inválido.' })
    }

    const mailSubject = String(subject || '').trim()
    if (!mailSubject) {
      return res.status(400).json({ error: 'El asunto es requerido.' })
    }

    if (!Array.isArray(grupoIds) || grupoIds.length === 0) {
      return res.status(400).json({ error: 'Se requiere grupoIds (array de IDs de grupo).' })
    }
    const ids = Array.from(new Set(grupoIds.map((id: any) => Number(id)).filter((n: number) => Number.isFinite(n))))
    if (ids.length === 0) {
      return res.status(400).json({ error: 'grupoIds debe contener números válidos.' })
    }

    let carreraId: number | null = null
    if (isCoordinador) {
      const coordinador = await RoleService.obtenerCoordinadorPorUsuario(user.id)
      if (!coordinador?.carrera_id) {
        return res.status(403).json({ error: 'Coordinador sin carrera asignada o no encontrado.' })
      }
      carreraId = Number(coordinador.carrera_id)
    }

    const { data: rows, error: rowsError } = await SupabaseDB.supabaseAdmin
      .from('qr_evaluaciones')
      .select(`
        grupo_id,
        token,
        curso_id,
        curso:cursos(id, nombre, codigo, carrera_id),
        grupo:grupos(id, numero_grupo),
        profesor:profesores(id, usuario:usuarios(nombre, apellido))
      `)
      .eq('activo', true)
      .in('grupo_id', ids)

    if (rowsError) {
      console.error('Error consultando QRs para share-email:', rowsError)
      return res.status(500).json({ error: 'Error consultando QRs', details: rowsError.message })
    }

    const rowsList = rows || []
    if (rowsList.length === 0) {
      return res.status(404).json({ error: 'No hay QRs activos para los grupos seleccionados.' })
    }

    const filteredRows = carreraId == null
      ? rowsList
      : rowsList.filter((r: any) => {
          const curso = Array.isArray(r.curso) ? r.curso[0] : r.curso
          return Number(curso?.carrera_id) === carreraId
        })

    if (filteredRows.length === 0) {
      return res.status(403).json({ error: 'Los grupos seleccionados no pertenecen a tu carrera.' })
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
      return res.status(503).json({
        error: 'Servicio de correo no configurado. Faltan variables SMTP en el backend.'
      })
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
    console.error('Error POST /qr-evaluaciones/share-email:', error)
    res.status(500).json({
      error: 'Error enviando el correo',
      details: error?.message || 'Error interno del servidor'
    })
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
      return res.status(400).json({ error: 'Token requerido.' })
    }

    const { data: row, error } = await SupabaseDB.supabaseAdmin
      .from('qr_evaluaciones')
      .select(`
        id,
        token,
        profesor_id,
        curso_id,
        grupo_id,
        periodo_id,
        profesor:profesores(
          id,
          usuario:usuarios(
            nombre,
            apellido
          )
        ),
        curso:cursos(
          id,
          nombre,
          codigo
        ),
        grupo:grupos(
          id,
          numero_grupo,
          horario,
          aula
        )
      `)
      .eq('token', token)
      .eq('activo', true)
      .maybeSingle()

    if (error) {
      console.error('Error GET qr_evaluaciones por token:', error)
      return res.status(500).json({ error: 'Error al resolver el token.' })
    }

    if (!row) {
      return res.status(404).json({ error: 'QR inválido o expirado.' })
    }

    // Supabase puede tipar relaciones anidadas como objeto o arreglo de un elemento
    const r = row as Record<string, unknown>
    const prof = r.profesor as Record<string, unknown> | Record<string, unknown>[] | null | undefined
    const profOne = Array.isArray(prof) ? prof[0] : prof
    const usu = profOne?.usuario as Record<string, unknown> | Record<string, unknown>[] | undefined
    const usuOne = Array.isArray(usu) ? usu[0] : usu
    const curso = r.curso as Record<string, unknown> | Record<string, unknown>[] | undefined
    const cursoOne = Array.isArray(curso) ? curso[0] : curso
    const grupo = r.grupo as Record<string, unknown> | Record<string, unknown>[] | undefined
    const grupoOne = Array.isArray(grupo) ? grupo[0] : grupo

    const profesorNombre =
      `${String(usuOne?.nombre ?? '')} ${String(usuOne?.apellido ?? '')}`.trim()
    res.json({
      profesorId: r.profesor_id,
      cursoId: r.curso_id,
      materiaId: r.curso_id,
      grupoId: r.grupo_id,
      periodoId: r.periodo_id ?? null,
      profesorNombre: profesorNombre || null,
      cursoNombre: (cursoOne?.nombre as string | undefined) ?? null,
      cursoCodigo: (cursoOne?.codigo as string | undefined) ?? null,
      grupoNumero: (grupoOne?.numero_grupo as string | number | undefined) ?? null,
      grupoHorario: (grupoOne?.horario as string | undefined) ?? null,
      grupoAula: (grupoOne?.aula as string | undefined) ?? null
    })
  } catch (error) {
    console.error('Error GET /qr-evaluaciones/:token:', error)
    res.status(500).json({ error: 'Error interno del servidor' })
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
      return res.status(400).json({ error: 'Token requerido.' })
    }

    if (!user || user.tipo_usuario !== 'estudiante') {
      return res.status(403).json({ error: 'Solo los estudiantes pueden matricularse por QR.' })
    }

    // Resolver estudiante por usuario autenticado
    const { data: estudiante, error: estudianteError } = await SupabaseDB.supabaseAdmin
      .from('estudiantes')
      .select('id')
      .eq('usuario_id', user.id)
      .single()

    if (estudianteError || !estudiante) {
      return res.status(404).json({ error: 'No se encontró registro de estudiante para este usuario.' })
    }

    // Resolver QR activo y grupo destino
    const { data: qrRow, error: qrError } = await SupabaseDB.supabaseAdmin
      .from('qr_evaluaciones')
      .select('id, token, grupo_id, activo')
      .eq('token', token)
      .eq('activo', true)
      .maybeSingle()

    if (qrError) {
      console.error('Error en auto-enroll (qr lookup):', qrError)
      return res.status(500).json({ error: 'Error resolviendo el QR.' })
    }

    if (!qrRow?.grupo_id) {
      return res.status(404).json({ error: 'QR inválido o expirado.' })
    }

    const grupoId = Number(qrRow.grupo_id)

    // Buscar inscripción existente
    const { data: inscExistente, error: inscExistenteError } = await SupabaseDB.supabaseAdmin
      .from('inscripciones')
      .select('id, activa')
      .eq('estudiante_id', estudiante.id)
      .eq('grupo_id', grupoId)
      .maybeSingle()

    if (inscExistenteError) {
      console.error('Error en auto-enroll (existing enrollment):', inscExistenteError)
      return res.status(500).json({ error: 'Error validando inscripción existente.' })
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
      const { error: reactivateError } = await SupabaseDB.supabaseAdmin
        .from('inscripciones')
        .update({ activa: true })
        .eq('id', inscExistente.id)

      if (reactivateError) {
        console.error('Error reactivando inscripción:', reactivateError)
        return res.status(500).json({ error: 'No se pudo reactivar la inscripción existente.' })
      }

      return res.json({
        enrolled: true,
        reactivated: true,
        estudianteId: estudiante.id,
        grupoId
      })
    }

    // Crear inscripción nueva (fallback si el esquema no usa columna activa)
    let insertError: any = null
    const insertPayload: any = {
      estudiante_id: estudiante.id,
      grupo_id: grupoId,
      activa: true
    }

    const respInsert = await SupabaseDB.supabaseAdmin
      .from('inscripciones')
      .insert([insertPayload])
      .select('id')
      .maybeSingle()

    insertError = respInsert.error

    if (insertError && (insertError.code === '42703' || String(insertError?.message || '').includes('activa'))) {
      const respInsertFallback = await SupabaseDB.supabaseAdmin
        .from('inscripciones')
        .insert([{ estudiante_id: estudiante.id, grupo_id: grupoId }])
        .select('id')
        .maybeSingle()
      insertError = respInsertFallback.error
    }

    if (insertError) {
      console.error('Error creando inscripción automática por QR:', insertError)
      return res.status(500).json({ error: 'No se pudo crear la inscripción automática.' })
    }

    return res.status(201).json({
      enrolled: true,
      created: true,
      estudianteId: estudiante.id,
      grupoId
    })
  } catch (error) {
    console.error('Error POST /qr-evaluaciones/:token/auto-enroll:', error)
    return res.status(500).json({ error: 'Error interno del servidor' })
  }
})

export default router
