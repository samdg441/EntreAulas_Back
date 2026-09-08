import { Router } from 'express'
import { authenticateToken, requireRole } from '../../middleware/auth'
import { AiService } from './ai.service'
import { teachersRepository } from '../academic/teachers.repository'
import { analyticsRepository } from '../analytics/analytics.repository'
import { partesPeriodo, rangoFechasPeriodo } from '../analytics/calificaciones'
import {
  badRequest,
  forbidden,
  sendError,
} from '../../shared/errors'

const router = Router()

// POST /api/ai/summarize
router.post('/summarize', authenticateToken, requireRole(['docente', 'profesor', 'coordinador', 'decano', 'admin']), async (req, res) => {
  try {
    const { texts } = req.body as { texts: string[] }
    if (!Array.isArray(texts) || texts.length === 0) {
      throw badRequest('Se requiere un array no vacío en "texts"')
    }
    const result = await AiService.summarizeOpenResponses(texts)
    res.json(result)
  } catch (error) {
    return sendError(res, error)
  }
})

async function fetchOpenTextsByFilters(filters: any): Promise<string[]> {
  if (!filters.profesor_id) {
    throw new Error('profesor_id es requerido')
  }

  // CRÍTICO: El profesor_id que recibimos es un usuario_id, necesitamos obtener el id real de profesores
  // Buscar en la tabla profesores donde usuario_id = filters.profesor_id

  const profesor = await teachersRepository.findActiveByUsuarioId(filters.profesor_id)
  if (!profesor) {
    throw new Error(`No se encontró profesor activo para usuario_id: ${filters.profesor_id}`)
  }

  const profesorIdReal = profesor.id

  // Usar exactamente la lógica del SQL que funciona:
  // SELECT ... FROM evaluaciones e INNER JOIN respuestas_evaluacion re ON re.evaluacion_id = e.id
  // WHERE e.carrera_id = X AND re.respuesta_texto IS NOT NULL ...

  // by-professor: SIEMPRE filtrar por profesor_id real (no por carrera)
  const evalOpts: {
    columns: string
    profesorId: string
    gte?: string
    lte?: string
    periodoId?: string | number
    grupoId?: string | number
  } = {
    columns: 'id',
    profesorId: profesorIdReal,
  }

  // IMPORTANTE: Aplicar filtros opcionales SOLO si se proporcionan
  // Si periodo_id no viene, buscar TODAS las evaluaciones de la carrera (como en el SQL que funciona)
  if (filters.periodo_gte && filters.periodo_lte) {
    evalOpts.gte = filters.periodo_gte
    evalOpts.lte = filters.periodo_lte
  } else if (filters.periodo_id !== undefined && filters.periodo_id !== null) {
    evalOpts.periodoId = filters.periodo_id
  }

  if (filters.grupo_id !== undefined && filters.grupo_id !== null) {
    evalOpts.grupoId = filters.grupo_id
  }

  const evaluaciones = await analyticsRepository.listEvaluaciones(evalOpts)

  const evaluacionIds = (evaluaciones || []).map((e: any) => e.id)

  if (evaluacionIds.length === 0) {
    return []
  }

  // Paso 3: Buscar respuestas usando los IDs de evaluaciones (simulando el INNER JOIN)
  const respuestas = await analyticsRepository.listRespuestasTextoByEvaluacionIds(evaluacionIds)

  // Paso 4: Aplicar filtros exactamente como el SQL:
  // - respuesta_texto IS NOT NULL (ya filtrado)
  // - TRIM(respuesta_texto) != ''
  // - LENGTH(TRIM(respuesta_texto)) >= 3
  const texts: string[] = []

  for (const r of respuestas || []) {
    const respuesta = r?.respuesta_texto

    if (respuesta) {
      const texto = String(respuesta).trim()

      // Aplicar los mismos filtros que el SQL:
      // TRIM(respuesta_texto) != '' Y LENGTH(TRIM(respuesta_texto)) >= 3
      if (texto.length > 0 && texto.length >= 3) {
        texts.push(texto)
      }
    }
  }

  return texts
}

async function fetchRatingsByFilters(filters: any): Promise<number[]> {
  if (!filters.profesor_id) {
    throw new Error('profesor_id es requerido')
  }

  const profesor = await teachersRepository.findActiveByUsuarioId(filters.profesor_id)
  if (!profesor) {
    throw new Error(`No se encontró profesor activo para usuario_id: ${filters.profesor_id}`)
  }

  const evalOpts: {
    columns: string
    profesorId: string
    gte?: string
    lte?: string
    periodoId?: string | number
    grupoId?: string | number
  } = {
    columns: 'id',
    profesorId: profesor.id,
  }

  if (filters.periodo_gte && filters.periodo_lte) {
    evalOpts.gte = filters.periodo_gte
    evalOpts.lte = filters.periodo_lte
  } else if (filters.periodo_id !== undefined && filters.periodo_id !== null) {
    evalOpts.periodoId = filters.periodo_id
  }
  if (filters.grupo_id !== undefined && filters.grupo_id !== null) {
    evalOpts.grupoId = filters.grupo_id
  }

  const evaluaciones = await analyticsRepository.listEvaluaciones(evalOpts)

  const evaluacionIds = (evaluaciones || []).map((e: any) => e.id)
  if (evaluacionIds.length === 0) return []

  const respuestas = await analyticsRepository.listRespuestasByEvaluacionIds(
    evaluacionIds,
    'respuesta_rating'
  )
  return (respuestas || [])
    .map((r: any) => Number(r.respuesta_rating))
    .filter((n: number) => Number.isFinite(n) && n >= 1 && n <= 5)
}

// GET /api/ai/summarize/by-professor?profesor_id=...&periodo_id=... (puede ser número o formato YYYY-X)
router.get('/summarize/by-professor', authenticateToken, requireRole(['docente', 'profesor', 'coordinador', 'decano', 'admin']), async (req: any, res) => {
  try {
    const { profesor_id, periodo_id, grupo_id } = req.query

    if (!profesor_id) {
      throw badRequest('profesor_id es requerido')
    }

    const filters: any = { profesor_id: String(profesor_id) }

    // Si periodo_id es formato YYYY-X, aplicar rango de fechas para robustez.
    // También se intenta resolver periodo_id numérico para compatibilidad.
    if (periodo_id) {
      const partes = partesPeriodo(periodo_id)
      if (partes) {
        const rango = rangoFechasPeriodo(String(periodo_id))
        if (rango) {
          filters.periodo_gte = rango.start
          filters.periodo_lte = rango.end
        }
        try {
          const periodos = await analyticsRepository.findPeriodo(partes.year, partes.semester)
          if (periodos?.id) {
            filters.periodo_id = periodos.id
          }
        } catch {
          // original ignored periodo errors
        }
      } else if (!String(periodo_id).includes('-')) {
        filters.periodo_id = Number(periodo_id)
      }
    }
    if (grupo_id) filters.grupo_id = Number(grupo_id)

    // Profesores solo pueden consultarse a sí mismos
    if (req.user?.tipo_usuario === 'profesor' && req.user.id !== String(profesor_id)) {
      throw forbidden('No autorizado')
    }

    // Obtener profesor_id real y carrera_id para el SQL de debug
    const profesor = await teachersRepository.findActiveByUsuarioId(String(profesor_id))
    const profesorIdReal = profesor?.id
    const carreraId = profesor?.carrera_id || null

    const texts = await fetchOpenTextsByFilters(filters)

    if (texts.length === 0) {
      const ratings = await fetchRatingsByFilters(filters)
      if (ratings.length > 0) {
        const quantitative = AiService.summarizeFromRatings(ratings, 'profesor')
        return res.json({
          textsCount: 0,
          ratingsCount: ratings.length,
          analysisSource: 'quantitative_fallback',
          ...quantitative
        })
      }

      // Generar SQL para mostrar al usuario usando carrera_id en lugar de profesor_id
      let sqlWhere = `WHERE
  e.carrera_id = ${carreraId}`
      if (filters.periodo_gte && filters.periodo_lte) {
        sqlWhere += `\n  AND e.fecha_creacion BETWEEN '${filters.periodo_gte}' AND '${filters.periodo_lte}'`
      } else if (filters.periodo_id) {
        sqlWhere += `\n  AND e.periodo_id = ${filters.periodo_id}`
      }

      const sqlCommand = `SELECT
  e.id AS evaluacion_id,
  e.carrera_id,
  e.profesor_id,
  re.id AS respuesta_id,
  re.respuesta_texto,
  re.respuesta_rating
FROM evaluaciones e
INNER JOIN respuestas_evaluacion re
  ON re.evaluacion_id = e.id
${sqlWhere}
  AND re.respuesta_texto IS NOT NULL
  AND TRIM(re.respuesta_texto) != ''
  AND LENGTH(TRIM(re.respuesta_texto)) >= 3
ORDER BY e.id, re.id;`
      return res.json({
        textsCount: 0,
        summary: 'No se encontraron respuestas abiertas para este profesor en el período seleccionado. Verifica en Supabase ejecutando el SQL que aparece en la consola del servidor.',
        topics: [],
        sqlCommand: process.env.NODE_ENV === 'development' ? sqlCommand : undefined
      })
    }

    const result = await AiService.summarizeOpenResponses(texts, 'profesor')

    res.json({ textsCount: texts.length, ...result })
  } catch (error: any) {
    return sendError(res, error)
  }
})

// GET /api/ai/summarize/by-career?periodo_id=... (para coordinadores)
// Lógica:
// 1. Obtener carrera_id del coordinador
// 2. Obtener profesores activos de esa carrera
// 3. Filtrar evaluaciones por esos profesores (opcionalmente por período)
// 4. Obtener respuestas_evaluacion con respuesta_texto válido
router.get('/summarize/by-career', authenticateToken, requireRole(['coordinador', 'decano', 'admin']), async (req: any, res) => {
  try {
    const { periodo_id } = req.query as any
    const { RoleService } = await import('../auth/role.service')

    // Paso 1: Obtener carrera_id del coordinador
    const coordinadorInfo = await RoleService.obtenerCoordinadorPorUsuario(req.user.id)

    if (!coordinadorInfo || !coordinadorInfo.carrera_id) {
      throw badRequest('No se encontró información de carrera para el coordinador', 'El usuario no está asociado a una carrera como coordinador')
    }

    const carreraId = coordinadorInfo.carrera_id

    // Paso 2: Convertir periodo_id si viene en formato YYYY-X
    let periodoIdNum: number | undefined = undefined
    let periodoDateRange: { gte: string; lte: string } | null = null
    if (periodo_id) {
      const partes = partesPeriodo(periodo_id)
      if (partes) {
        const rango = rangoFechasPeriodo(String(periodo_id))
        if (rango) {
          periodoDateRange = { gte: rango.start, lte: rango.end }
        }
        try {
          const periodos = await analyticsRepository.findPeriodo(partes.year, partes.semester)
          if (periodos?.id) {
            periodoIdNum = periodos.id
          }
        } catch {
          // original ignored periodo errors
        }
      } else if (!String(periodo_id).includes('-')) {
        periodoIdNum = Number(periodo_id)
      }
    }

    // Paso 3: profesores activos de la carrera
    let profesores: any[]
    try {
      profesores = await teachersRepository.listActiveByCareer(carreraId)
    } catch (profError) {
      throw profError
    }

    const profesorIds = (profesores || []).map((p: any) => p.id).filter(Boolean)
    const profesorNombreById = new Map<string, string>()
    const usuarioIds = (profesores || []).map((p: any) => p.usuario_id).filter(Boolean)
    let usuarios: any[] = []
    try {
      usuarios = await analyticsRepository.getUsuariosByIds(usuarioIds)
    } catch {
      usuarios = []
    }
    const usuarioById = new Map((usuarios || []).map((u: any) => [String(u.id), u]))
    ;(profesores || []).forEach((p: any) => {
      const u = usuarioById.get(String(p.usuario_id))
      const nombre = `${u?.nombre || ''} ${u?.apellido || ''}`.trim() || `Docente ${p.id}`
      profesorNombreById.set(String(p.id), nombre)
    })
    if (profesorIds.length === 0) {
      return res.json({
        textsCount: 0,
        summary: 'No se encontraron profesores activos en esta carrera.',
        topics: []
      })
    }

    // Paso 4: evaluaciones de esos profesores
    let evalsArray: any[] = []
    try {
      const evaluaciones = await analyticsRepository.listEvaluaciones({
        columns: 'id, profesor_id, calificacion_promedio',
        profesorIds,
        completada: true,
        ...(periodoIdNum ? { periodoId: periodoIdNum } : {}),
      })
      evalsArray = Array.isArray(evaluaciones) ? evaluaciones : []
    } catch (evalError) {
      throw evalError
    }

    // Fallback: si vino periodo_id pero no hay evaluaciones, intentar por fecha_creacion
    // porque en algunos datos históricos periodo_id viene nulo/inconsistente.
    if (evalsArray.length === 0 && periodoDateRange) {
      try {
        const evalsByDate = await analyticsRepository.listEvaluaciones({
          columns: 'id, profesor_id, calificacion_promedio',
          profesorIds,
          completada: true,
          gte: periodoDateRange.gte,
          lte: periodoDateRange.lte,
        })
        evalsArray = Array.isArray(evalsByDate) ? evalsByDate : []
      } catch {
        // original ignored evalByDateError
      }
    }

    const evaluacionIds = evalsArray.map((e: any) => e.id).filter(Boolean)
    if (evaluacionIds.length === 0) {
      return res.json({
        textsCount: 0,
        summary: 'No se encontraron evaluaciones para esta carrera en el período seleccionado.',
        topics: []
      })
    }

    // Paso 5: respuestas abiertas válidas (en lotes para evitar Bad Request por query grande)
    const chunkArray = <T,>(arr: T[], size: number): T[][] => {
      const out: T[][] = []
      for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
      return out
    }

    let respuestas: any[] = []
    for (const chunk of chunkArray(evaluacionIds, 150)) {
      const chunkData = await analyticsRepository.listRespuestasTextoByEvaluacionIds(chunk)
      respuestas.push(...(Array.isArray(chunkData) ? chunkData : []))
    }

    const evalToProfesor = new Map<string, string>()
    ;(evalsArray || []).forEach((e: any) => {
      evalToProfesor.set(String(e.id), String(e.profesor_id || ''))
    })

    const normalizeText = (text: string): string =>
      String(text || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')

    const acosoKeywords = [
      'acoso', 'hostigamiento', 'abus', 'maltrato', 'intimidacion',
      'inapropiado', 'violencia', 'amenaza', 'miedo', 'temor',
      'humillacion', 'tocamiento', 'agresion', 'insinuacion'
    ].map(normalizeText)

    const acosoPorProfesor = new Map<string, { count: number; ejemplos: string[] }>()
    const texts: string[] = respuestas
      .map((r: any) => String(r.respuesta_texto || '').trim())
      .filter((texto: string) => texto.length >= 3)

    ;(respuestas || []).forEach((r: any) => {
      const texto = String(r?.respuesta_texto || '').trim()
      if (texto.length < 3) return
      const low = normalizeText(texto)
      const hasAcoso = acosoKeywords.some((k) => low.includes(k))
      if (!hasAcoso) return
      const profesorId = evalToProfesor.get(String(r?.evaluacion_id || ''))
      if (!profesorId) return
      const prev = acosoPorProfesor.get(profesorId) || { count: 0, ejemplos: [] }
      prev.count += 1
      if (prev.ejemplos.length < 2) prev.ejemplos.push(texto.slice(0, 160))
      acosoPorProfesor.set(profesorId, prev)
    })

    const acosoProfesores = Array.from(acosoPorProfesor.entries())
      .map(([profesorId, data]) => ({
        profesorId,
        nombre: profesorNombreById.get(profesorId) || `Docente ${profesorId}`,
        menciones: data.count,
        ejemplos: data.ejemplos
      }))
      .sort((a, b) => b.menciones - a.menciones)

    if (texts.length === 0) {
      const ratings = evalsArray
        .map((e: any) => Number(e.calificacion_promedio))
        .filter((n: number) => Number.isFinite(n) && n >= 1 && n <= 5)

      if (ratings.length > 0) {
        const perTeacherAcc = new Map<string, { sum: number; count: number }>()
        ;(evalsArray || []).forEach((e: any) => {
          const pid = String(e.profesor_id || '')
          const r = Number(e.calificacion_promedio || 0)
          if (!pid || !Number.isFinite(r) || r <= 0) return
          const prev = perTeacherAcc.get(pid) || { sum: 0, count: 0 }
          prev.sum += r
          prev.count += 1
          perTeacherAcc.set(pid, prev)
        })

        const lowPerformers = Array.from(perTeacherAcc.entries())
          .map(([profesorId, data]) => ({
            profesorId,
            nombre: profesorNombreById.get(profesorId) || `Docente ${profesorId}`,
            promedio: data.count > 0 ? Number((data.sum / data.count).toFixed(2)) : 0
          }))
          .filter((p) => p.promedio > 0 && p.promedio < 4.0)
          .sort((a, b) => a.promedio - b.promedio)

        const quantitative = AiService.summarizeFromRatings(ratings, 'coordinador')
        const alertaBajoDesempeno = lowPerformers.length > 0
          ? ` Alerta: se detectaron ${lowPerformers.length} docentes con promedio menor a 4.0; se recomienda revisión y acompañamiento académico.`
          : ' No se detectaron docentes con promedio menor a 4.0 en el período consultado.'
        return res.json({
          textsCount: 0,
          ratingsCount: ratings.length,
          lowPerformersCount: lowPerformers.length,
          lowPerformers,
          acosoProfesores,
          analysisSource: 'quantitative_fallback',
          summary: `${quantitative.summary}${alertaBajoDesempeno}`,
          topics: [
            ...(quantitative.topics || []),
            lowPerformers.length > 0 ? 'docentes bajo 4.0' : 'sin alertas bajo 4.0'
          ]
        })
      }

      const sqlCommand = `SELECT
  re.id AS respuesta_id,
  re.evaluacion_id,
  re.respuesta_texto
FROM respuestas_evaluacion re
WHERE re.evaluacion_id IN (
  SELECT e.id
  FROM evaluaciones e
  WHERE e.profesor_id IN (
    SELECT p.id FROM profesores p WHERE p.carrera_id = ${carreraId} AND p.activo = true
  )
  ${periodoIdNum ? `AND e.periodo_id = ${periodoIdNum}` : ''}
  AND e.completada = true
)
AND re.respuesta_texto IS NOT NULL
AND TRIM(re.respuesta_texto) <> ''
AND LENGTH(TRIM(re.respuesta_texto)) >= 3
ORDER BY re.evaluacion_id, re.id;`
      return res.json({
        textsCount: 0,
        summary: 'No se encontraron respuestas abiertas válidas para esta carrera.',
        topics: [],
        sqlCommand: process.env.NODE_ENV === 'development' ? sqlCommand : undefined
      })
    }

    // Paso 6: Generar resumen IA con contexto de coordinador (habla en general de todos los profesores)

    const result = await AiService.summarizeOpenResponses(texts, 'coordinador')

    res.json({ textsCount: texts.length, acosoProfesores, ...result })
  } catch (error: any) {
    return sendError(res, error)
  }
})

// GET /api/ai/summarize/by-faculty?periodo_id=... (para decanos)
// Lógica simplificada: usar la vista SQL directamente
// La vista ya tiene todos los JOINs y filtros aplicados, solo necesitamos filtrar por periodo_id
router.get('/summarize/by-faculty', authenticateToken, requireRole(['decano', 'admin']), async (req: any, res) => {
  try {
    const { periodo_id } = req.query as any

    // Paso 1: Convertir periodo_id si viene en formato YYYY-X
    let periodoIdNum: number | undefined = undefined
    if (periodo_id) {
      const partes = partesPeriodo(periodo_id)
      if (partes) {
        try {
          const periodos = await analyticsRepository.findPeriodo(partes.year, partes.semester)
          if (periodos?.id) {
            periodoIdNum = periodos.id
          }
        } catch {
          // original ignored periodo errors
        }
      } else if (!String(periodo_id).includes('-')) {
        periodoIdNum = Number(periodo_id)
      }
    }

    // Paso 2: Consultar directamente respuestas_evaluacion (igual que tu SQL)
    // Si hay período, obtener evaluacion_ids primero y filtrar
    let evaluacionIds: string[] | undefined = undefined

    if (periodoIdNum) {
      try {
        const evaluaciones = await analyticsRepository.listEvaluaciones({
          columns: 'id',
          periodoId: periodoIdNum,
        })
        evaluacionIds = (evaluaciones || []).map((e: any) => e.id)
      } catch {
        evaluacionIds = []
      }
    }

    // Consultar respuestas_evaluacion directamente (como tu SQL)
    let respuestas: any[] = []
    if (evaluacionIds && evaluacionIds.length > 0) {
      respuestas = await analyticsRepository.listRespuestasTextoByEvaluacionIds(evaluacionIds)
    } else {
      const allEvals = await analyticsRepository.listEvaluaciones({ columns: 'id' })
      const allIds = (allEvals || []).map((e: any) => e.id)
      const chunkArray = <T,>(arr: T[], size: number): T[][] => {
        const out: T[][] = []
        for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
        return out
      }
      for (const chunk of chunkArray(allIds, 150)) {
        const chunkData = await analyticsRepository.listRespuestasTextoByEvaluacionIds(chunk)
        respuestas.push(...(Array.isArray(chunkData) ? chunkData : []))
      }
    }

    // Paso 3: Aplicar filtros de texto exactamente como tu SQL:
    // TRIM(respuesta_texto) <> '' AND LENGTH(TRIM(respuesta_texto)) > 3
    const texts: string[] = (respuestas || [])
      .map((r: any) => String(r.respuesta_texto || '').trim())
      .filter((texto: string) => texto.length > 0 && texto.length > 3)

    if (texts.length === 0) {
      let sqlWhere = `WHERE
  respuesta_texto IS NOT NULL
  AND TRIM(respuesta_texto) <> ''
  AND LENGTH(TRIM(respuesta_texto)) > 3`

      if (periodoIdNum) {
        sqlWhere += `\n  AND evaluacion_id IN (SELECT id FROM evaluaciones WHERE periodo_id = ${periodoIdNum})`
      }

      const sqlCommand = `SELECT
  id AS respuesta_id,
  evaluacion_id,
  pregunta_id,
  respuesta_texto,
  respuesta_rating
FROM respuestas_evaluacion
${sqlWhere}
ORDER BY evaluacion_id, id;`
      return res.json({
        textsCount: 0,
        summary: 'No se encontraron respuestas abiertas válidas para la facultad en el período seleccionado.',
        topics: [],
        sqlCommand: process.env.NODE_ENV === 'development' ? sqlCommand : undefined
      })
    }

    // Paso 4: Enviar textos directamente a la IA

    const result = await AiService.summarizeOpenResponses(texts, 'decano')

    res.json({ textsCount: texts.length, ...result })
  } catch (error: any) {
    return sendError(res, error)
  }
})

export default router

