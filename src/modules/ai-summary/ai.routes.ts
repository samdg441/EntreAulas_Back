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

type EvalFilterOpts = {
  columns: string
  profesorId: string
  gte?: string
  lte?: string
  periodoId?: string | number
  grupoId?: string | number
}

function hasValue(value: unknown) {
  return value !== undefined && value !== null
}

function applyPeriodoToEvalOpts(evalOpts: EvalFilterOpts, filters: any) {
  if (filters.periodo_gte && filters.periodo_lte) {
    evalOpts.gte = filters.periodo_gte
    evalOpts.lte = filters.periodo_lte
    return
  }
  if (!hasValue(filters.periodo_id)) return
  evalOpts.periodoId = filters.periodo_id
}

function applyGrupoToEvalOpts(evalOpts: EvalFilterOpts, filters: any) {
  if (!hasValue(filters.grupo_id)) return
  evalOpts.grupoId = filters.grupo_id
}

function buildEvalOpts(profesorId: string, filters: any): EvalFilterOpts {
  const evalOpts: EvalFilterOpts = { columns: 'id', profesorId }
  applyPeriodoToEvalOpts(evalOpts, filters)
  applyGrupoToEvalOpts(evalOpts, filters)
  return evalOpts
}

function asPrimitiveString(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'bigint') {
    return `${value}`
  }
  return null
}

async function requireActiveProfesor(usuarioId: unknown) {
  const id = asPrimitiveString(usuarioId)
  if (!id) {
    throw new Error('profesor_id es requerido')
  }
  const profesor = await teachersRepository.findActiveByUsuarioId(id)
  if (!profesor) {
    throw new Error(`No se encontró profesor activo para usuario_id: ${id}`)
  }
  return profesor
}

async function fetchEvaluacionIdsByFilters(filters: any): Promise<string[]> {
  const profesor = await requireActiveProfesor(filters.profesor_id)
  const evaluaciones = await analyticsRepository.listEvaluaciones(
    buildEvalOpts(profesor.id, filters),
  )
  return (evaluaciones || []).map((e: any) => e.id)
}

function textoAbiertoValido(respuesta: unknown): string | null {
  if (typeof respuesta !== 'string') return null
  const texto = respuesta.trim()
  if (texto.length < 3) return null
  return texto
}

function extractValidOpenTexts(respuestas: Array<{ respuesta_texto?: unknown }> | null): string[] {
  const texts: string[] = []
  for (const row of respuestas || []) {
    const texto = textoAbiertoValido(row?.respuesta_texto)
    if (!texto) continue
    texts.push(texto)
  }
  return texts
}

async function fetchOpenTextsByFilters(filters: any): Promise<string[]> {
  const evaluacionIds = await fetchEvaluacionIdsByFilters(filters)
  if (evaluacionIds.length === 0) return []
  const respuestas = await analyticsRepository.listRespuestasTextoByEvaluacionIds(evaluacionIds)
  return extractValidOpenTexts(respuestas)
}

async function fetchRatingsByFilters(filters: any): Promise<number[]> {
  const evaluacionIds = await fetchEvaluacionIdsByFilters(filters)
  if (evaluacionIds.length === 0) return []
  const respuestas = await analyticsRepository.listRespuestasByEvaluacionIds(
    evaluacionIds,
    'respuesta_rating',
  )
  return (respuestas || [])
    .map((r: any) => Number(r.respuesta_rating))
    .filter((n: number) => Number.isFinite(n) && n >= 1 && n <= 5)
}

function requireQueryProfesorId(profesorId: unknown): string {
  const id = asPrimitiveString(profesorId)
  if (!id) {
    throw badRequest('profesor_id es requerido')
  }
  return id
}

function assertProfessorSelfAccess(
  user: { tipo_usuario?: string; id?: string } | undefined,
  profesorId: string,
) {
  if (user?.tipo_usuario !== 'profesor') return
  if (user.id === profesorId) return
  throw forbidden('No autorizado')
}

async function applyNamedPeriodo(
  filters: { periodo_gte?: string; periodo_lte?: string; periodo_id?: number },
  periodoId: unknown,
  partes: { year: number; semester: number },
) {
  const label = asPrimitiveString(periodoId)
  const rango = label ? rangoFechasPeriodo(label) : null
  if (rango) {
    filters.periodo_gte = rango.start
    filters.periodo_lte = rango.end
  }
  try {
    const periodos = await analyticsRepository.findPeriodo(partes.year, partes.semester)
    if (periodos?.id) filters.periodo_id = periodos.id
  } catch {
    // original ignored periodo errors
  }
}

async function applyPeriodoToFilters(
  filters: { periodo_gte?: string; periodo_lte?: string; periodo_id?: number },
  periodoId: unknown,
) {
  if (!periodoId) return
  const partes = partesPeriodo(periodoId)
  if (partes) {
    await applyNamedPeriodo(filters, periodoId, partes)
    return
  }
  const raw = asPrimitiveString(periodoId)
  if (!raw || raw.includes('-')) return
  filters.periodo_id = Number(raw)
}

function applyGrupoToFilters(filters: { grupo_id?: number }, grupoId: unknown) {
  const raw = asPrimitiveString(grupoId)
  if (!raw) return
  filters.grupo_id = Number(raw)
}

function periodoSqlClause(filters: {
  periodo_gte?: string
  periodo_lte?: string
  periodo_id?: unknown
}) {
  if (filters.periodo_gte && filters.periodo_lte) {
    return `\n  AND e.fecha_creacion BETWEEN '${filters.periodo_gte}' AND '${filters.periodo_lte}'`
  }
  const periodoId = asPrimitiveString(filters.periodo_id)
  if (!periodoId) return ''
  return `\n  AND e.periodo_id = ${periodoId}`
}

function emptyProfessorSql(carreraId: unknown, filters: {
  periodo_gte?: string
  periodo_lte?: string
  periodo_id?: unknown
}) {
  const carrera = asPrimitiveString(carreraId) ?? 'null'
  const sqlWhere = `WHERE
  e.carrera_id = ${carrera}${periodoSqlClause(filters)}`
  return `SELECT
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
}

async function emptyProfessorPayload(profesorId: string, filters: {
  periodo_gte?: string
  periodo_lte?: string
  periodo_id?: unknown
}) {
  const profesor = await teachersRepository.findActiveByUsuarioId(profesorId)
  const sqlCommand =
    process.env.NODE_ENV === 'development'
      ? emptyProfessorSql(profesor?.carrera_id ?? null, filters)
      : undefined
  return {
    textsCount: 0,
    summary:
      'No se encontraron respuestas abiertas para este profesor en el período seleccionado. Verifica en Supabase ejecutando el SQL que aparece en la consola del servidor.',
    topics: [] as string[],
    sqlCommand,
  }
}

async function professorSummaryPayload(filters: {
  profesor_id: string
  periodo_gte?: string
  periodo_lte?: string
  periodo_id?: number
  grupo_id?: number
}) {
  const texts = await fetchOpenTextsByFilters(filters)
  if (texts.length > 0) {
    const result = await AiService.summarizeOpenResponses(texts, 'profesor')
    return { textsCount: texts.length, ...result }
  }

  const ratings = await fetchRatingsByFilters(filters)
  if (ratings.length > 0) {
    const quantitative = AiService.summarizeFromRatings(ratings, 'profesor')
    return {
      textsCount: 0,
      ratingsCount: ratings.length,
      analysisSource: 'quantitative_fallback',
      ...quantitative,
    }
  }

  return emptyProfessorPayload(filters.profesor_id, filters)
}

async function buildProfessorFilters(query: {
  profesor_id?: unknown
  periodo_id?: unknown
  grupo_id?: unknown
}) {
  const profesorId = requireQueryProfesorId(query.profesor_id)
  const filters: {
    profesor_id: string
    periodo_gte?: string
    periodo_lte?: string
    periodo_id?: number
    grupo_id?: number
  } = { profesor_id: profesorId }
  await applyPeriodoToFilters(filters, query.periodo_id)
  applyGrupoToFilters(filters, query.grupo_id)
  return filters
}

// GET /api/ai/summarize/by-professor?profesor_id=...&periodo_id=... (puede ser número o formato YYYY-X)
router.get('/summarize/by-professor', authenticateToken, requireRole(['docente', 'profesor', 'coordinador', 'decano', 'admin']), async (req: any, res) => {
  try {
    const filters = await buildProfessorFilters(req.query)
    assertProfessorSelfAccess(req.user, filters.profesor_id)
    res.json(await professorSummaryPayload(filters))
  } catch (error: any) {
    return sendError(res, error)
  }
})

async function requireCarreraIdCoordinador(usuarioId: unknown) {
  const { RoleService } = await import('../auth/role.service')
  const id = asPrimitiveString(usuarioId)
  const coordinadorInfo = id ? await RoleService.obtenerCoordinadorPorUsuario(id) : null
  if (!coordinadorInfo?.carrera_id) {
    throw badRequest(
      'No se encontró información de carrera para el coordinador',
      'El usuario no está asociado a una carrera como coordinador',
    )
  }
  return coordinadorInfo.carrera_id
}

function docenteNombre(usuario: { nombre?: unknown; apellido?: unknown } | undefined, profesorId: string) {
  const nombre = asPrimitiveString(usuario?.nombre) ?? ''
  const apellido = asPrimitiveString(usuario?.apellido) ?? ''
  return `${nombre} ${apellido}`.trim() || `Docente ${profesorId}`
}

async function mapNombresProfesores(profesores: any[]) {
  const usuarioIds = profesores.map((p) => p.usuario_id).filter(Boolean)
  let usuarios: any[] = []
  try {
    usuarios = await analyticsRepository.getUsuariosByIds(usuarioIds)
  } catch {
    usuarios = []
  }
  const usuarioById = new Map(
    (usuarios || []).map((u: any) => [asPrimitiveString(u.id) ?? '', u]),
  )
  const profesorNombreById = new Map<string, string>()
  for (const p of profesores) {
    const pid = asPrimitiveString(p.id)
    if (!pid) continue
    const uid = asPrimitiveString(p.usuario_id) ?? ''
    const usuario = usuarioById.get(uid) ?? p.usuario
    profesorNombreById.set(pid, docenteNombre(usuario, pid))
  }
  return profesorNombreById
}

async function listEvaluacionesCarrera(
  profesorIds: any[],
  periodo: { periodo_id?: number; periodo_gte?: string; periodo_lte?: string },
) {
  const evaluaciones = await analyticsRepository.listEvaluaciones({
    columns: 'id, profesor_id, calificacion_promedio',
    profesorIds,
    completada: true,
    ...(periodo.periodo_id ? { periodoId: periodo.periodo_id } : {}),
  })
  const evalsArray = Array.isArray(evaluaciones) ? evaluaciones : []
  if (evalsArray.length > 0 || !periodo.periodo_gte || !periodo.periodo_lte) {
    return evalsArray
  }
  try {
    const evalsByDate = await analyticsRepository.listEvaluaciones({
      columns: 'id, profesor_id, calificacion_promedio',
      profesorIds,
      completada: true,
      gte: periodo.periodo_gte,
      lte: periodo.periodo_lte,
    })
    return Array.isArray(evalsByDate) ? evalsByDate : []
  } catch {
    return []
  }
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

async function fetchRespuestasTextoEnLotes(evaluacionIds: any[]) {
  const respuestas: any[] = []
  for (const chunk of chunkArray(evaluacionIds, 150)) {
    const chunkData = await analyticsRepository.listRespuestasTextoByEvaluacionIds(chunk)
    respuestas.push(...(Array.isArray(chunkData) ? chunkData : []))
  }
  return respuestas
}

function normalizeText(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
}

const ACOSO_KEYWORDS = [
  'acoso',
  'hostigamiento',
  'abus',
  'maltrato',
  'intimidacion',
  'inapropiado',
  'violencia',
  'amenaza',
  'miedo',
  'temor',
  'humillacion',
  'tocamiento',
  'agresion',
  'insinuacion',
].map(normalizeText)

function collectAcosoProfesores(
  respuestas: any[],
  evalsArray: any[],
  profesorNombreById: Map<string, string>,
) {
  const evalToProfesor = new Map<string, string>()
  for (const e of evalsArray) {
    const eid = asPrimitiveString(e.id)
    if (!eid) continue
    evalToProfesor.set(eid, asPrimitiveString(e.profesor_id) ?? '')
  }

  const acosoPorProfesor = new Map<string, { count: number; ejemplos: string[] }>()
  for (const r of respuestas) {
    const texto = textoAbiertoValido(r?.respuesta_texto)
    if (!texto) continue
    if (!ACOSO_KEYWORDS.some((k) => normalizeText(texto).includes(k))) continue
    const profesorId = evalToProfesor.get(asPrimitiveString(r?.evaluacion_id) ?? '')
    if (!profesorId) continue
    const prev = acosoPorProfesor.get(profesorId) ?? { count: 0, ejemplos: [] }
    prev.count += 1
    if (prev.ejemplos.length < 2) prev.ejemplos.push(texto.slice(0, 160))
    acosoPorProfesor.set(profesorId, prev)
  }

  return Array.from(acosoPorProfesor.entries())
    .map(([profesorId, data]) => ({
      profesorId,
      nombre: profesorNombreById.get(profesorId) || `Docente ${profesorId}`,
      menciones: data.count,
      ejemplos: data.ejemplos,
    }))
    .sort((a, b) => b.menciones - a.menciones)
}

function lowPerformersFromEvals(evalsArray: any[], profesorNombreById: Map<string, string>) {
  const perTeacherAcc = new Map<string, { sum: number; count: number }>()
  for (const e of evalsArray) {
    const pid = asPrimitiveString(e.profesor_id)
    const rating = Number(e.calificacion_promedio ?? 0)
    if (!pid || !Number.isFinite(rating) || rating <= 0) continue
    const prev = perTeacherAcc.get(pid) ?? { sum: 0, count: 0 }
    prev.sum += rating
    prev.count += 1
    perTeacherAcc.set(pid, prev)
  }
  return Array.from(perTeacherAcc.entries())
    .map(([profesorId, data]) => ({
      profesorId,
      nombre: profesorNombreById.get(profesorId) || `Docente ${profesorId}`,
      promedio: data.count > 0 ? Number((data.sum / data.count).toFixed(2)) : 0,
    }))
    .filter((p) => p.promedio > 0 && p.promedio < 4.0)
    .sort((a, b) => a.promedio - b.promedio)
}

function careerQuantitativePayload(
  ratings: number[],
  evalsArray: any[],
  profesorNombreById: Map<string, string>,
  acosoProfesores: unknown[],
) {
  const lowPerformers = lowPerformersFromEvals(evalsArray, profesorNombreById)
  const quantitative = AiService.summarizeFromRatings(ratings, 'coordinador')
  const alertaBajoDesempeno =
    lowPerformers.length > 0
      ? ` Alerta: se detectaron ${lowPerformers.length} docentes con promedio menor a 4.0; se recomienda revisión y acompañamiento académico.`
      : ' No se detectaron docentes con promedio menor a 4.0 en el período consultado.'
  return {
    textsCount: 0,
    ratingsCount: ratings.length,
    lowPerformersCount: lowPerformers.length,
    lowPerformers,
    acosoProfesores,
    analysisSource: 'quantitative_fallback',
    summary: `${quantitative.summary}${alertaBajoDesempeno}`,
    topics: [
      ...(quantitative.topics || []),
      lowPerformers.length > 0 ? 'docentes bajo 4.0' : 'sin alertas bajo 4.0',
    ],
  }
}

function emptyCareerSql(carreraId: unknown, periodoId?: number) {
  const carrera = asPrimitiveString(carreraId) ?? 'null'
  const periodo = asPrimitiveString(periodoId)
  const periodoClause = periodo ? `AND e.periodo_id = ${periodo}` : ''
  return `SELECT
  re.id AS respuesta_id,
  re.evaluacion_id,
  re.respuesta_texto
FROM respuestas_evaluacion re
WHERE re.evaluacion_id IN (
  SELECT e.id
  FROM evaluaciones e
  WHERE e.profesor_id IN (
    SELECT p.id FROM profesores p WHERE p.carrera_id = ${carrera} AND p.activo = true
  )
  ${periodoClause}
  AND e.completada = true
)
AND re.respuesta_texto IS NOT NULL
AND TRIM(re.respuesta_texto) <> ''
AND LENGTH(TRIM(re.respuesta_texto)) >= 3
ORDER BY re.evaluacion_id, re.id;`
}

async function careerSummaryPayload(usuarioId: unknown, periodoId: unknown) {
  const carreraId = await requireCarreraIdCoordinador(usuarioId)
  const periodo: { periodo_id?: number; periodo_gte?: string; periodo_lte?: string } = {}
  await applyPeriodoToFilters(periodo, periodoId)

  const profesores = (await teachersRepository.listActiveByCareer(carreraId)) || []
  const profesorIds = profesores.map((p: any) => p.id).filter(Boolean)
  if (profesorIds.length === 0) {
    return {
      textsCount: 0,
      summary: 'No se encontraron profesores activos en esta carrera.',
      topics: [] as string[],
    }
  }

  const profesorNombreById = await mapNombresProfesores(profesores)
  const evalsArray = await listEvaluacionesCarrera(profesorIds, periodo)
  const evaluacionIds = evalsArray.map((e: any) => e.id).filter(Boolean)
  if (evaluacionIds.length === 0) {
    return {
      textsCount: 0,
      summary: 'No se encontraron evaluaciones para esta carrera en el período seleccionado.',
      topics: [] as string[],
    }
  }

  const respuestas = await fetchRespuestasTextoEnLotes(evaluacionIds)
  const texts = extractValidOpenTexts(respuestas)
  const acosoProfesores = collectAcosoProfesores(respuestas, evalsArray, profesorNombreById)
  if (texts.length > 0) {
    const result = await AiService.summarizeOpenResponses(texts, 'coordinador')
    return { textsCount: texts.length, acosoProfesores, ...result }
  }

  const ratings = evalsArray
    .map((e: any) => Number(e.calificacion_promedio))
    .filter((n: number) => Number.isFinite(n) && n >= 1 && n <= 5)
  if (ratings.length > 0) {
    return careerQuantitativePayload(ratings, evalsArray, profesorNombreById, acosoProfesores)
  }

  return {
    textsCount: 0,
    summary: 'No se encontraron respuestas abiertas válidas para esta carrera.',
    topics: [] as string[],
    sqlCommand:
      process.env.NODE_ENV === 'development'
        ? emptyCareerSql(carreraId, periodo.periodo_id)
        : undefined,
  }
}

// GET /api/ai/summarize/by-career?periodo_id=... (para coordinadores)
router.get('/summarize/by-career', authenticateToken, requireRole(['coordinador', 'decano', 'admin']), async (req: any, res) => {
  try {
    res.json(await careerSummaryPayload(req.user?.id, req.query?.periodo_id))
  } catch (error: any) {
    return sendError(res, error)
  }
})

function parseNumericPeriodoId(periodoId: unknown): number | undefined {
  const raw = asPrimitiveString(periodoId)
  if (!raw || raw.includes('-')) return undefined
  return Number(raw)
}

async function findPeriodoNumericId(partes: { year: number; semester: number }) {
  try {
    const periodos = await analyticsRepository.findPeriodo(partes.year, partes.semester)
    return periodos?.id
  } catch {
    return undefined
  }
}

async function resolveFacultyPeriodoId(periodoId: unknown): Promise<number | undefined> {
  if (!periodoId) return undefined
  const partes = partesPeriodo(periodoId)
  if (partes) return findPeriodoNumericId(partes)
  return parseNumericPeriodoId(periodoId)
}

async function facultyEvaluacionIds(periodoIdNum?: number): Promise<string[] | undefined> {
  if (!periodoIdNum) return undefined
  try {
    const evaluaciones = await analyticsRepository.listEvaluaciones({
      columns: 'id',
      periodoId: periodoIdNum,
    })
    return (evaluaciones || []).map((e: any) => e.id)
  } catch {
    return []
  }
}

async function facultyRespuestas(evaluacionIds?: string[]) {
  if (evaluacionIds?.length) {
    return analyticsRepository.listRespuestasTextoByEvaluacionIds(evaluacionIds)
  }
  const allEvals = await analyticsRepository.listEvaluaciones({ columns: 'id' })
  return fetchRespuestasTextoEnLotes((allEvals || []).map((e: any) => e.id))
}

function extractFacultyOpenTexts(respuestas: Array<{ respuesta_texto?: unknown }> | null) {
  const texts: string[] = []
  for (const row of respuestas || []) {
    const texto = asPrimitiveString(row?.respuesta_texto)?.trim()
    if (!texto || texto.length <= 3) continue
    texts.push(texto)
  }
  return texts
}

function facultyPeriodoSqlClause(periodoIdNum?: number) {
  if (!periodoIdNum) return ''
  return `\n  AND evaluacion_id IN (SELECT id FROM evaluaciones WHERE periodo_id = ${periodoIdNum})`
}

function emptyFacultySql(periodoIdNum?: number) {
  const sqlWhere = `WHERE
  respuesta_texto IS NOT NULL
  AND TRIM(respuesta_texto) <> ''
  AND LENGTH(TRIM(respuesta_texto)) > 3${facultyPeriodoSqlClause(periodoIdNum)}`
  return `SELECT
  id AS respuesta_id,
  evaluacion_id,
  pregunta_id,
  respuesta_texto,
  respuesta_rating
FROM respuestas_evaluacion
${sqlWhere}
ORDER BY evaluacion_id, id;`
}

function emptyFacultyPayload(periodoIdNum?: number) {
  return {
    textsCount: 0,
    summary: 'No se encontraron respuestas abiertas válidas para la facultad en el período seleccionado.',
    topics: [] as string[],
    sqlCommand:
      process.env.NODE_ENV === 'development' ? emptyFacultySql(periodoIdNum) : undefined,
  }
}

async function facultySummaryPayload(periodoId: unknown) {
  const periodoIdNum = await resolveFacultyPeriodoId(periodoId)
  const texts = extractFacultyOpenTexts(
    await facultyRespuestas(await facultyEvaluacionIds(periodoIdNum)),
  )
  if (texts.length === 0) return emptyFacultyPayload(periodoIdNum)
  const result = await AiService.summarizeOpenResponses(texts, 'decano')
  return { textsCount: texts.length, ...result }
}

// GET /api/ai/summarize/by-faculty?periodo_id=... (para decanos)
router.get('/summarize/by-faculty', authenticateToken, requireRole(['decano', 'admin']), async (req: any, res) => {
  try {
    res.json(await facultySummaryPayload(req.query?.periodo_id))
  } catch (error: any) {
    return sendError(res, error)
  }
})

export {
  hasValue,
  applyPeriodoToEvalOpts,
  applyGrupoToEvalOpts,
  buildEvalOpts,
  asPrimitiveString,
  textoAbiertoValido,
  extractValidOpenTexts,
  requireQueryProfesorId,
  assertProfessorSelfAccess,
  applyPeriodoToFilters,
  applyGrupoToFilters,
  periodoSqlClause,
  emptyProfessorSql,
  chunkArray,
  normalizeText,
  collectAcosoProfesores,
  lowPerformersFromEvals,
  careerQuantitativePayload,
  emptyCareerSql,
  docenteNombre,
  buildProfessorFilters,
  extractFacultyOpenTexts,
  emptyFacultySql,
}

export default router

