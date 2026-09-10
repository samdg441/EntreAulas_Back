import { RoleService } from '../auth/role.service'
import { listGruposConProfesorByCareer } from '../academic/grupos-con-profesor.service'
import { teachersRepository } from '../academic/teachers.repository'
import { academicRepository } from '../academic/academic.repository'
import { analyticsRepository } from './analytics.repository'
import { armarResumenCoordinador, parsearPaginacion } from './coordinador-resumen'
import { partesPeriodo, rangoFechasPeriodoOTodo } from './calificaciones'
import { badRequest, internal, notFound } from '../../shared/errors'

const EVAL_COLUMNS =
  'id, profesor_id, calificacion_promedio, grupo_id, estudiante_id, fecha_creacion'

const REPORTE_VACIO = {
  summary: {
    totalEvaluaciones: 0,
    calificacionPromedio: 0,
    tasaRespuesta: 0,
    docentesEvaluados: 0,
    cursosEvaluados: 0,
    estudiantesRespondieron: 0,
  },
  categoryStats: [] as Array<{ categoriaId: string; nombre: string; promedio: number }>,
  reportRows: [] as unknown[],
  trend: [] as unknown[],
  distribution: [] as unknown[],
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

function promedioDeEvals(evals: any[]): number {
  if (!evals.length) return 0
  const suma = evals.reduce((sum: number, e: any) => sum + Number(e.calificacion_promedio || 0), 0)
  return Number((suma / evals.length).toFixed(2))
}

function nombreDocente(row: any, fallbackId?: string | number): string {
  const nombre = `${row?.usuario?.nombre || ''} ${row?.usuario?.apellido || ''}`.trim()
  if (nombre) return nombre
  const id = row?.id ?? fallbackId
  return id != null ? `Docente ${id}` : 'Docente'
}

function etiquetaCurso(row: any, fallbackId?: string | number): string {
  const id = row?.id ?? fallbackId
  return `${row?.codigo ? `${row.codigo} - ` : ''}${row?.nombre || `Curso ${id}`}`
}

async function resolverPeriodo(period: unknown) {
  const periodStr = String(period ?? '').trim()
  const partes = partesPeriodo(periodStr)
  const { start: dateStart, end: dateEnd } = rangoFechasPeriodoOTodo(periodStr)
  let periodId: number | null = null
  if (partes) {
    try {
      const periodRow = await analyticsRepository.findPeriodo(partes.year, partes.semester)
      periodId = periodRow?.id ? Number(periodRow.id) : null
    } catch {
      periodId = null
    }
  }
  return { period: periodStr, partes, dateStart, dateEnd, periodId }
}

async function listRespuestasPorEvaluaciones(evalIds: any[], conFallbackValor: boolean) {
  const rows: any[] = []
  for (const chunk of chunkArray(evalIds, 150)) {
    try {
      const data = await analyticsRepository.listRespuestasByEvaluacionIds(
        chunk,
        'evaluacion_id, pregunta_id, respuesta_rating'
      )
      rows.push(...(Array.isArray(data) ? data : []))
    } catch {
      if (!conFallbackValor) continue
      try {
        const fallback = await analyticsRepository.listRespuestasByEvaluacionIds(
          chunk,
          'evaluacion_id, pregunta_id, valor'
        )
        rows.push(...(Array.isArray(fallback) ? fallback : []))
      } catch {
        // same as original: ignore fallback errors
      }
    }
  }
  return rows
}

async function mapPreguntasYCategorias(preguntaIds: string[], dummyCategoriaSiVacio = false) {
  const questionRows: any[] = []
  for (const chunk of chunkArray(preguntaIds, 200)) {
    try {
      const data = await analyticsRepository.listPreguntasByIds(chunk, 'id, categoria_id')
      questionRows.push(...(Array.isArray(data) ? data : []))
    } catch {
      // original ignored errors
    }
  }
  const questionToCategory = new Map<string, string>()
  questionRows.forEach((q: any) => {
    if (q?.id == null || q?.categoria_id == null) return
    questionToCategory.set(String(q.id), String(q.categoria_id))
  })

  const categoryIds = Array.from(new Set(questionRows.map((q: any) => String(q.categoria_id)).filter(Boolean)))
  const idsParaCategoria = categoryIds.length ? categoryIds : dummyCategoriaSiVacio ? ['-1'] : []
  const categoryRows: any[] = []
  for (const chunk of chunkArray(idsParaCategoria, 200)) {
    try {
      const data = await analyticsRepository.listCategoriasByIds(chunk, 'id, nombre')
      categoryRows.push(...(Array.isArray(data) ? data : []))
    } catch {
      // original ignored errors
    }
  }
  const categoryNameById = new Map<string, string>()
  categoryRows.forEach((c: any) =>
    categoryNameById.set(String(c.id), String(c.nombre || `Categoría ${c.id}`))
  )
  return { questionToCategory, categoryNameById, questionRows }
}

async function nombresDocentesPorIds(ids: Array<string | number>) {
  let rows: any[] = []
  try {
    rows = await teachersRepository.listActiveWithUsuario(ids.length ? ids : ['-1'])
  } catch {
    rows = []
  }
  const byId = new Map<string, string>()
  ;(Array.isArray(rows) ? rows : []).forEach((t: any) => {
    byId.set(String(t.id), nombreDocente(t))
  })
  return byId
}

async function cursosPorIds(ids: Array<string | number>) {
  let rows: any[] = []
  try {
    rows = await academicRepository.listCursosByIds(ids, 'id, nombre, codigo')
  } catch {
    rows = []
  }
  return Array.isArray(rows) ? rows : []
}

async function gruposPorIds(ids: Array<string | number>) {
  if (!ids.length) return []
  try {
    const grupos = await analyticsRepository.getGruposByIds(ids, 'id, curso_id, numero_grupo')
    return Array.isArray(grupos) ? grupos : []
  } catch {
    return []
  }
}

function periodosTendencia(partes: { year: number; semester: number } | null): string[] {
  const minTrendYear = 2025
  const minTrendSemester = 1
  if (!partes) return ['2025-1', '2025-2', '2026-1', '2026-2']
  const trendPeriods: string[] = []
  let y = minTrendYear
  let s = minTrendSemester
  while (y < partes.year || (y === partes.year && s <= partes.semester)) {
    trendPeriods.push(`${y}-${s}`)
    if (s === 1) s = 2
    else {
      y += 1
      s = 1
    }
  }
  return trendPeriods
}

async function buildCategoryStats(evals: any[]) {
  if (!Array.isArray(evals) || !evals.length) {
    return [] as Array<{ categoriaId: string; nombre: string; promedio: number }>
  }
  const ids = evals.map((e: any) => e.id).filter(Boolean)
  if (!ids.length) return []

  const evaluacionToProfesor = new Map<string, string>()
  evals.forEach((e: any) => {
    evaluacionToProfesor.set(String(e.id), String(e.profesor_id || ''))
  })

  const respuestasArray = await listRespuestasPorEvaluaciones(ids, true)
  const preguntaIds = Array.from(new Set(respuestasArray.map((r: any) => String(r.pregunta_id)).filter(Boolean)))
  if (!preguntaIds.length) return []

  const { questionToCategory, categoryNameById } = await mapPreguntasYCategorias(preguntaIds, true)

  const teacherCategoryAcc = new Map<string, { sum: number; count: number }>()
  respuestasArray.forEach((r: any) => {
    const catId = questionToCategory.get(String(r.pregunta_id))
    if (!catId) return
    const profesorId = evaluacionToProfesor.get(String(r.evaluacion_id))
    if (!profesorId) return
    const rating = Number(r.respuesta_rating ?? r.valor ?? 0)
    if (!Number.isFinite(rating) || rating <= 0) return
    const key = `${profesorId}::${catId}`
    const prev = teacherCategoryAcc.get(key) || { sum: 0, count: 0 }
    prev.sum += rating
    prev.count += 1
    teacherCategoryAcc.set(key, prev)
  })

  const categoryTeacherMeans = new Map<string, { sumMeans: number; teachers: number }>()
  teacherCategoryAcc.forEach((values, key) => {
    const categoriaId = String(key.split('::')[1] || '')
    if (!categoriaId || values.count <= 0) return
    const teacherMean = values.sum / values.count
    const prev = categoryTeacherMeans.get(categoriaId) || { sumMeans: 0, teachers: 0 }
    prev.sumMeans += teacherMean
    prev.teachers += 1
    categoryTeacherMeans.set(categoriaId, prev)
  })

  return Array.from(categoryTeacherMeans.entries())
    .map(([categoriaId, values]) => ({
      categoriaId,
      nombre: categoryNameById.get(categoriaId) || `Categoría ${categoriaId}`,
      promedio: values.teachers > 0 ? Number((values.sumMeans / values.teachers).toFixed(2)) : 0,
    }))
    .filter((c) => c.promedio > 0)
    .sort((a, b) => b.promedio - a.promedio)
}

/** Orquesta dashboards y reportes del coordinador. Sin SQL directo. */
export class CoordinadorService {
  async carreraDelUsuario(usuarioId: string, conDetalle = true): Promise<number> {
    const coordinador = await RoleService.obtenerCoordinadorPorUsuario(usuarioId)
    if (!coordinador?.carrera_id) {
      if (conDetalle) {
        throw badRequest(
          'No se encontró carrera asociada al coordinador',
          'El coordinador debe tener una carrera asignada.'
        )
      }
      throw badRequest('No se encontró carrera asociada al coordinador')
    }
    return Number(coordinador.carrera_id)
  }

  async listCursosConProfesor(usuarioId: string) {
    const carreraId = await this.carreraDelUsuario(usuarioId)
    return listGruposConProfesorByCareer(carreraId)
  }

  async getDashboardSummary(
    usuarioId: string,
    query: { page?: unknown; pageSize?: unknown; search?: unknown }
  ) {
    const carreraId = await this.carreraDelUsuario(usuarioId)
    const { page, pageSize } = parsearPaginacion(query || {})
    const search = String(query?.search || '').trim().toLowerCase()

    let cursos: any[]
    try {
      cursos = await academicRepository.listCursosActivosByCareer(carreraId, 'id')
    } catch (cursosError: any) {
      throw internal('Error obteniendo cursos', cursosError.message)
    }

    const totalCursos = (cursos || []).length

    let profesoresList
    try {
      profesoresList = await teachersRepository.listActiveByCareer(carreraId)
    } catch (profesoresError) {
      throw internal('Error obteniendo profesores', (profesoresError as Error)?.message ?? profesoresError)
    }

    const profesorIds = profesoresList.map((p: any) => p.id).filter(Boolean)
    if (profesorIds.length === 0) {
      return armarResumenCoordinador({
        profesores: [],
        usuarios: [],
        evaluaciones: [],
        totalCursos,
        search,
        page,
        pageSize,
      })
    }

    const usuarioIds = profesoresList.map((p: any) => p.usuario_id).filter(Boolean)
    let usuarios
    try {
      usuarios = await analyticsRepository.getUsuariosByIds(usuarioIds)
    } catch (usuariosError) {
      throw internal('Error obteniendo usuarios', (usuariosError as Error)?.message ?? usuariosError)
    }

    let evaluaciones
    try {
      evaluaciones = await analyticsRepository.getCompletedByProfesorIds(profesorIds)
    } catch (evaluacionesError) {
      throw internal('Error obteniendo evaluaciones', (evaluacionesError as Error)?.message ?? evaluacionesError)
    }

    return armarResumenCoordinador({
      profesores: profesoresList,
      usuarios: usuarios || [],
      evaluaciones: evaluaciones || [],
      totalCursos,
      search,
      page,
      pageSize,
    })
  }

  async getReportsOverview(usuarioId: string, periodQuery: unknown) {
    const carreraId = await this.carreraDelUsuario(usuarioId)
    const { period, partes, dateStart, dateEnd, periodId } = await resolverPeriodo(periodQuery)

    let profesorIds
    try {
      profesorIds = await teachersRepository.listIdsByCareer(carreraId, true)
    } catch (profesoresError) {
      throw internal('Error obteniendo profesores', (profesoresError as Error)?.message ?? profesoresError)
    }

    if (profesorIds.length === 0) {
      profesorIds = await teachersRepository.listIdsByCareer(carreraId, false)
    }
    if (profesorIds.length === 0) {
      return REPORTE_VACIO
    }

    let evalsArray: any[] = []
    let filterSource: 'periodo_id' | 'fecha_creacion' | 'sin_filtro' = 'sin_filtro'

    if (periodId != null) {
      try {
        evalsArray = await analyticsRepository.listEvaluaciones({
          columns: EVAL_COLUMNS,
          profesorIds,
          completada: true,
          periodoId: periodId,
        })
      } catch (evalPeriodError: any) {
        throw internal('Error obteniendo evaluaciones por período', evalPeriodError.message)
      }
      filterSource = 'periodo_id'
    }

    if (evalsArray.length === 0) {
      try {
        evalsArray = await analyticsRepository.listEvaluaciones({
          columns: EVAL_COLUMNS,
          profesorIds,
          completada: true,
          gte: dateStart,
          lte: dateEnd,
        })
      } catch (evalDateError: any) {
        throw internal('Error obteniendo evaluaciones por fecha', evalDateError.message)
      }
      filterSource = 'fecha_creacion'
    }

    const totalEvaluaciones = evalsArray.length
    const calificacionPromedio = promedioDeEvals(evalsArray)
    const docentesEvaluados = new Set(evalsArray.map((e: any) => e.profesor_id).filter(Boolean)).size
    const estudiantesRespondieron = new Set(evalsArray.map((e: any) => e.estudiante_id).filter(Boolean)).size

    const gruposArray = await gruposPorIds(
      Array.from(new Set(evalsArray.map((e: any) => e.grupo_id).filter(Boolean)))
    )
    const cursosEvaluados = new Set(gruposArray.map((g: any) => g.curso_id).filter(Boolean)).size
    const groupToCourseId = new Map<number, number>()
    gruposArray.forEach((g: any) => {
      groupToCourseId.set(Number(g.id), Number(g.curso_id))
    })

    const buckets = [
      { name: '5 Estrellas', value: 0, color: '#10B981' },
      { name: '4 Estrellas', value: 0, color: '#3B82F6' },
      { name: '3 Estrellas', value: 0, color: '#F59E0B' },
      { name: '2 Estrellas', value: 0, color: '#EF4444' },
      { name: '1 Estrella', value: 0, color: '#6B7280' },
    ]
    evalsArray.forEach((e: any) => {
      const value = Number(e.calificacion_promedio || 0)
      if (!Number.isFinite(value) || value <= 0) return
      const rounded = Math.max(1, Math.min(5, Math.round(value)))
      buckets[5 - rounded].value += 1
    })
    const distribution = buckets.filter((b) => b.value > 0)

    const teacherAgg = new Map<string, { sum: number; count: number }>()
    evalsArray.forEach((e: any) => {
      const pid = String(e.profesor_id || '')
      const rating = Number(e.calificacion_promedio || 0)
      if (!pid || !Number.isFinite(rating) || rating <= 0) return
      const prev = teacherAgg.get(pid) || { sum: 0, count: 0 }
      prev.sum += rating
      prev.count += 1
      teacherAgg.set(pid, prev)
    })

    const teacherNameById = await nombresDocentesPorIds(Array.from(teacherAgg.keys()))
    const teacherAverages = Array.from(teacherAgg.entries())
      .map(([profesorId, values]) => ({
        profesorId,
        nombre: teacherNameById.get(profesorId) || `Docente ${profesorId}`,
        promedio: values.count > 0 ? Number((values.sum / values.count).toFixed(2)) : 0,
        totalEvaluaciones: values.count,
      }))
      .filter((t) => t.promedio > 0)
      .sort((a, b) => b.promedio - a.promedio)

    const courseRows = await cursosPorIds(
      Array.from(new Set(gruposArray.map((g: any) => g.curso_id).filter(Boolean)))
    )
    const courseNameById = new Map<number, string>()
    courseRows.forEach((c: any) => {
      courseNameById.set(Number(c.id), etiquetaCurso(c))
    })

    const courseAgg = new Map<number, { sum: number; count: number }>()
    evalsArray.forEach((e: any) => {
      const courseId = groupToCourseId.get(Number(e.grupo_id || 0))
      const rating = Number(e.calificacion_promedio || 0)
      if (!courseId || !Number.isFinite(rating) || rating <= 0) return
      const prev = courseAgg.get(courseId) || { sum: 0, count: 0 }
      prev.sum += rating
      prev.count += 1
      courseAgg.set(courseId, prev)
    })

    const courseAverages = Array.from(courseAgg.entries())
      .map(([cursoId, values]) => ({
        cursoId,
        nombre: courseNameById.get(cursoId) || `Curso ${cursoId}`,
        promedio: values.count > 0 ? Number((values.sum / values.count).toFixed(2)) : 0,
        totalEvaluaciones: values.count,
      }))
      .filter((c) => c.promedio > 0)
      .sort((a, b) => b.promedio - a.promedio)

    let evalsForReportRows = Array.isArray(evalsArray) ? [...evalsArray] : []
    if (evalsForReportRows.length === 0) {
      try {
        const allCareerEvals = await analyticsRepository.listEvaluaciones({
          columns: EVAL_COLUMNS,
          profesorIds,
          completada: true,
        })
        evalsForReportRows = Array.isArray(allCareerEvals) ? allCareerEvals : []
      } catch {
        evalsForReportRows = []
      }
    }
    if (evalsForReportRows.length === 0) {
      let assignedGroups: any[] = []
      try {
        const asignaciones = await academicRepository.listAsignacionesByProfesorIds(profesorIds)
        assignedGroups = (asignaciones || []).filter((a: any) => a.activa !== false)
      } catch {
        assignedGroups = []
      }

      const seenAssignments = new Set<string>()
      const syntheticRows: any[] = []
      ;(Array.isArray(assignedGroups) ? assignedGroups : []).forEach((a: any) => {
        const profesorId = String(a?.profesor_id || '')
        const grupoId = Number(a?.grupo_id || 0)
        if (!profesorId || !grupoId) return
        const key = `${profesorId}::${grupoId}`
        if (seenAssignments.has(key)) return
        seenAssignments.add(key)
        syntheticRows.push({
          id: null,
          profesor_id: profesorId,
          grupo_id: grupoId,
          estudiante_id: null,
          calificacion_promedio: null,
        })
      })
      evalsForReportRows = syntheticRows
    }

    const exportGroupsArray = await gruposPorIds(
      Array.from(new Set(evalsForReportRows.map((e: any) => Number(e.grupo_id)).filter(Boolean)))
    )
    const exportGroupById = new Map<number, any>()
    exportGroupsArray.forEach((g: any) => exportGroupById.set(Number(g.id), g))

    const exportCourseRows = await cursosPorIds(
      Array.from(new Set(exportGroupsArray.map((g: any) => Number(g.curso_id)).filter(Boolean)))
    )
    const exportCourseNameById = new Map<number, string>()
    exportCourseRows.forEach((c: any) => {
      exportCourseNameById.set(Number(c.id), etiquetaCurso(c))
    })

    const teacherNameByIdForExport = await nombresDocentesPorIds(
      Array.from(new Set(evalsForReportRows.map((e: any) => String(e.profesor_id)).filter(Boolean)))
    )

    let enrollments: any[] = []
    try {
      enrollments = await academicRepository.listInscripcionesByGrupoIds(
        Array.from(new Set(evalsForReportRows.map((e: any) => Number(e.grupo_id)).filter(Boolean))),
        'id, grupo_id'
      )
    } catch {
      enrollments = []
    }
    const enrolledByGroup = new Map<number, number>()
    ;(Array.isArray(enrollments) ? enrollments : []).forEach((i: any) => {
      const gid = Number(i.grupo_id)
      enrolledByGroup.set(gid, (enrolledByGroup.get(gid) || 0) + 1)
    })

    const keyFor = (profesorId: string, grupoId: number) => `${profesorId}::${grupoId}`
    const rowAgg = new Map<
      string,
      {
        profesorId: string
        grupoId: number
        cursoNombre: string
        grupo: string
        estudiantes: number
        evaluadoresSet: Set<string>
        sumPromedio: number
        countPromedio: number
      }
    >()
    evalsForReportRows.forEach((e: any) => {
      const profesorId = String(e.profesor_id || '')
      const grupoId = Number(e.grupo_id || 0)
      if (!profesorId || !grupoId) return
      const group = exportGroupById.get(grupoId)
      const cursoNombre =
        exportCourseNameById.get(Number(group?.curso_id)) || `Curso ${group?.curso_id || ''}`.trim()
      const key = keyFor(profesorId, grupoId)
      const prev = rowAgg.get(key) || {
        profesorId,
        grupoId,
        cursoNombre,
        grupo: String(group?.numero_grupo ?? grupoId),
        estudiantes: Number(enrolledByGroup.get(grupoId) || 0),
        evaluadoresSet: new Set<string>(),
        sumPromedio: 0,
        countPromedio: 0,
      }
      if (e?.estudiante_id) prev.evaluadoresSet.add(String(e.estudiante_id))
      const p = Number(e.calificacion_promedio || 0)
      if (Number.isFinite(p) && p > 0) {
        prev.sumPromedio += p
        prev.countPromedio += 1
      }
      rowAgg.set(key, prev)
    })

    const responseRows = await listRespuestasPorEvaluaciones(
      evalsForReportRows.map((e: any) => e.id).filter(Boolean),
      true
    )

    const evalToKey = new Map<string, string>()
    evalsForReportRows.forEach((e: any) => {
      const profesorId = String(e.profesor_id || '')
      const grupoId = Number(e.grupo_id || 0)
      if (!profesorId || !grupoId) return
      evalToKey.set(String(e.id), keyFor(profesorId, grupoId))
    })

    const { questionToCategory, categoryNameById } = await mapPreguntasYCategorias(
      Array.from(new Set(responseRows.map((r: any) => String(r.pregunta_id)).filter(Boolean)))
    )

    const catAggByRow = new Map<string, Map<string, { sum: number; count: number }>>()
    responseRows.forEach((r: any) => {
      const rowKey = evalToKey.get(String(r.evaluacion_id))
      if (!rowKey) return
      const catId = questionToCategory.get(String(r.pregunta_id))
      if (!catId) return
      const rating = Number(r.respuesta_rating ?? r.valor ?? 0)
      if (!Number.isFinite(rating) || rating <= 0) return
      const byCat = catAggByRow.get(rowKey) || new Map<string, { sum: number; count: number }>()
      const prev = byCat.get(catId) || { sum: 0, count: 0 }
      prev.sum += rating
      prev.count += 1
      byCat.set(catId, prev)
      catAggByRow.set(rowKey, byCat)
    })

    const reportRows = Array.from(rowAgg.entries())
      .map(([key, base]) => {
        const row: any = {
          DOCENTE: teacherNameByIdForExport.get(base.profesorId) || `Docente ${base.profesorId}`,
          ASIGNATURA: base.cursoNombre,
          GRUPO: base.grupo,
          ESTUDIANTES: base.estudiantes,
          ESTUDIANTES_EVALUADORES: base.evaluadoresSet.size,
        }
        const byCat = catAggByRow.get(key) || new Map<string, { sum: number; count: number }>()
        byCat.forEach((values, catId) => {
          const catName = (categoryNameById.get(catId) || `Categoria_${catId}`).toUpperCase().replace(/\s+/g, '_')
          row[catName] = values.count > 0 ? Number((values.sum / values.count).toFixed(2)) : null
        })
        row.PROMEDIO = base.countPromedio > 0 ? Number((base.sumPromedio / base.countPromedio).toFixed(2)) : null
        return row
      })
      .sort((a, b) => {
        const byTeacher = String(a.DOCENTE).localeCompare(String(b.DOCENTE), 'es')
        if (byTeacher !== 0) return byTeacher
        const byCourse = String(a.ASIGNATURA).localeCompare(String(b.ASIGNATURA), 'es')
        if (byCourse !== 0) return byCourse
        return String(a.GRUPO).localeCompare(String(b.GRUPO), 'es')
      })

    let categoryStats = await buildCategoryStats(evalsArray)
    if (categoryStats.length === 0) {
      let allCareerEvaluations: any[] = []
      try {
        allCareerEvaluations = await analyticsRepository.listEvaluaciones({
          columns: 'id, profesor_id',
          profesorIds,
          completada: true,
        })
      } catch {
        allCareerEvaluations = []
      }
      categoryStats = await buildCategoryStats(Array.isArray(allCareerEvaluations) ? allCareerEvaluations : [])
    }

    const trend = await Promise.all(
      periodosTendencia(partes).map(async (p) => {
        const window = rangoFechasPeriodoOTodo(p)
        let arr: any[] = []
        try {
          arr = await analyticsRepository.listEvaluaciones({
            columns: 'calificacion_promedio',
            profesorIds,
            completada: true,
            gte: window.start,
            lte: window.end,
          })
        } catch {
          arr = []
        }
        return { period: p, rating: promedioDeEvals(arr), totalEvaluations: arr.length }
      })
    )

    return {
      summary: {
        totalEvaluaciones,
        calificacionPromedio,
        tasaRespuesta: 0,
        docentesEvaluados,
        cursosEvaluados,
        estudiantesRespondieron,
      },
      categoryStats,
      teacherAverages,
      courseAverages,
      reportRows,
      debug:
        process.env.NODE_ENV === 'development'
          ? {
              period,
              periodId,
              filterSource,
              evaluacionesCount: evalsArray.length,
            }
          : undefined,
      trend,
      distribution,
    }
  }

  async getProfesorStats(usuarioId: string, profesorIdParam: string, periodQuery: unknown) {
    const carreraId = await this.carreraDelUsuario(usuarioId, false)
    const profesorId = String(profesorIdParam)
    const { dateStart, dateEnd, periodId } = await resolverPeriodo(periodQuery)

    let profesor: any
    try {
      const rows = await teachersRepository.listActiveWithUsuario([profesorId])
      profesor =
        (rows || []).find(
          (p: any) => String(p.id) === String(profesorId) && Number(p.carrera_id) === carreraId
        ) || null
    } catch (profesorError: any) {
      throw internal('Error obteniendo docente', profesorError.message)
    }
    if (!profesor) {
      throw notFound('Docente no encontrado en la carrera del coordinador')
    }

    let evalsArray: any[] = []
    if (periodId != null) {
      try {
        const data = await analyticsRepository.listEvaluaciones({
          columns: EVAL_COLUMNS,
          profesorId,
          completada: true,
          periodoId: periodId,
        })
        evalsArray = Array.isArray(data) ? data : []
      } catch (error: any) {
        throw internal('Error obteniendo evaluaciones', error.message)
      }
    }

    if (evalsArray.length === 0) {
      try {
        const data = await analyticsRepository.listEvaluaciones({
          columns: EVAL_COLUMNS,
          profesorId,
          completada: true,
          gte: dateStart,
          lte: dateEnd,
        })
        evalsArray = Array.isArray(data) ? data : []
      } catch (error: any) {
        throw internal('Error obteniendo evaluaciones por fecha', error.message)
      }
    }

    const totalEvaluaciones = evalsArray.length
    const promedio = promedioDeEvals(evalsArray)
    const estudiantesEvaluadores = new Set(evalsArray.map((e: any) => e.estudiante_id).filter(Boolean)).size

    const grupos = await gruposPorIds(
      Array.from(new Set(evalsArray.map((e: any) => e.grupo_id).filter(Boolean)))
    )
    const grupoToCurso = new Map<number, any>()
    grupos.forEach((g: any) => grupoToCurso.set(Number(g.id), g))

    const cursos = await cursosPorIds(Array.from(new Set(grupos.map((g: any) => g.curso_id).filter(Boolean))))
    const cursoById = new Map<number, any>()
    cursos.forEach((c: any) => cursoById.set(Number(c.id), c))

    const courseAgg = new Map<number, { sum: number; count: number; nombre: string; codigo: string }>()
    evalsArray.forEach((e: any) => {
      const grupo = grupoToCurso.get(Number(e.grupo_id))
      const curso = cursoById.get(Number(grupo?.curso_id))
      const cursoId = Number(curso?.id || grupo?.curso_id || 0)
      const rating = Number(e.calificacion_promedio || 0)
      if (!cursoId || !Number.isFinite(rating) || rating <= 0) return
      const prev = courseAgg.get(cursoId) || {
        sum: 0,
        count: 0,
        nombre: curso?.nombre || `Curso ${cursoId}`,
        codigo: curso?.codigo || '',
      }
      prev.sum += rating
      prev.count += 1
      courseAgg.set(cursoId, prev)
    })
    const courses = Array.from(courseAgg.entries()).map(([cursoId, values]) => ({
      cursoId,
      nombre: values.nombre,
      codigo: values.codigo,
      totalEvaluaciones: values.count,
      promedio: values.count > 0 ? Number((values.sum / values.count).toFixed(2)) : 0,
    }))

    const responses = await listRespuestasPorEvaluaciones(
      evalsArray.map((e: any) => e.id).filter(Boolean),
      false
    )
    const { questionToCategory, categoryNameById } = await mapPreguntasYCategorias(
      Array.from(new Set(responses.map((r: any) => String(r.pregunta_id)).filter(Boolean)))
    )

    const catAgg = new Map<string, { sum: number; count: number }>()
    responses.forEach((r: any) => {
      const catId = questionToCategory.get(String(r.pregunta_id))
      if (!catId) return
      const rating = Number(r.respuesta_rating ?? 0)
      if (!Number.isFinite(rating) || rating <= 0) return
      const prev = catAgg.get(catId) || { sum: 0, count: 0 }
      prev.sum += rating
      prev.count += 1
      catAgg.set(catId, prev)
    })
    const categoriesStats = Array.from(catAgg.entries()).map(([categoriaId, values]) => ({
      categoriaId,
      nombre: categoryNameById.get(categoriaId) || `Categoría ${categoriaId}`,
      promedio: values.count > 0 ? Number((values.sum / values.count).toFixed(2)) : 0,
    }))

    return {
      profesor: {
        id: profesor.id,
        nombre: `${profesor?.usuario?.nombre || ''} ${profesor?.usuario?.apellido || ''}`.trim(),
        email: profesor?.usuario?.email || '',
      },
      summary: {
        totalEvaluaciones,
        promedio,
        estudiantesEvaluadores,
        totalCursos: courses.length,
      },
      courses,
      categories: categoriesStats,
    }
  }
}

export const coordinadorService = new CoordinadorService()
