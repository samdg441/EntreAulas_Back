import { calcularPromedio, esPeriodoValido, rangoFechasPeriodo, resumenMetricas } from './calificaciones'
import { analyticsRepository } from './analytics.repository'
import { teachersRepository } from '../academic/teachers.repository'
import { academicRepository } from '../academic/academic.repository'
import { badRequest, internal, notFound } from '../../shared/errors'

function filtroFechas(period: unknown): { gte?: string; lte?: string } {
  let dateFilter: { gte?: string; lte?: string } = {}
  if (period) {
    const rango = rangoFechasPeriodo(String(period))
    if (rango) dateFilter = { gte: rango.start, lte: rango.end }
  }
  return dateFilter
}

async function mapaGrupoYCurso(evals: any[], columnasGrupos = 'id, curso_id, numero_grupo') {
  const gruposIds = Array.from(new Set((evals || []).map((e: any) => e.grupo_id).filter(Boolean)))
  const grupos = await analyticsRepository.getGruposByIds(gruposIds, columnasGrupos)
  const grupoToCurso: any = {}
  ;(Array.isArray(grupos) ? grupos : []).forEach((g: any) => {
    grupoToCurso[g.id] = g.curso_id
  })
  const cursoIds = Array.from(
    new Set((Array.isArray(grupos) ? grupos : []).map((g: any) => g.curso_id).filter(Boolean))
  )
  let cursos: any[] = []
  try {
    cursos = await academicRepository.listCursosByIds(cursoIds, 'id, nombre, codigo')
  } catch {
    cursos = []
  }
  const cursoInfo: any = {}
  ;(Array.isArray(cursos) ? cursos : []).forEach((c: any) => {
    cursoInfo[c.id] = c
  })
  return { grupos: Array.isArray(grupos) ? grupos : [], grupoToCurso, cursoInfo }
}

function agruparEvaluacionesPorCurso(evals: any[], grupoToCurso: any, cursoInfo: any) {
  const evaluacionesPorCurso =
    evals?.reduce((acc: any, evaluacion: any) => {
      const cursoId = grupoToCurso[evaluacion.grupo_id]
      const cursoData = cursoInfo[cursoId] as any
      const cursoNombre = cursoData?.nombre || 'Curso desconocido'
      const cursoCodigo = cursoData?.codigo || 'N/A'
      const cursoKey = `${cursoId}-${cursoNombre}`
      if (!acc[cursoKey]) {
        acc[cursoKey] = {
          curso_id: cursoId,
          nombre: cursoNombre,
          codigo: cursoCodigo,
          total: 0,
          promedio: 0,
          evaluaciones: [],
        }
      }
      acc[cursoKey].total++
      acc[cursoKey].evaluaciones.push(evaluacion)
      return acc
    }, {} as any) || {}

  Object.values(evaluacionesPorCurso).forEach((curso: any) => {
    curso.promedio = Number(
      calcularPromedio(curso.evaluaciones.map((e: any) => e.calificacion_promedio)).toFixed(2)
    )
  })
  return evaluacionesPorCurso
}

function filtrarCarrerasSinTronco(carreras: any[]) {
  return (carreras || []).filter((c: any) => {
    const nombre = String(c.nombre || '').toLowerCase()
    if (nombre.includes('tronco común') || nombre.includes('tronco comun')) return false
    if (c.activa !== undefined && c.activa !== true) return false
    if (c.activo !== undefined && c.activo !== true) return false
    return true
  })
}

/** Estadísticas y reportes montados bajo /api/teachers (analytics). */
export class TeachersAnalyticsService {
  async getStats(profesorId: string) {
    const profesor = await teachersRepository.findActiveProfessor(profesorId)
    if (!profesor) {
      throw notFound('Profesor no encontrado')
    }

    let evaluaciones
    try {
      evaluaciones = await analyticsRepository.getEvaluacionesStats(profesorId)
    } catch (evaluacionesError) {
      throw internal('Error consultando evaluaciones', evaluacionesError)
    }

    const metricas = resumenMetricas(evaluaciones || [])
    const evalsArrayStats: any[] = Array.isArray(evaluaciones) ? (evaluaciones as any[]) : []
    const { grupoToCurso: grupoToCursoStats, cursoInfo: cursoInfoStats } = await mapaGrupoYCurso(
      evalsArrayStats
    )

    const cursosUnicos = new Set(
      evalsArrayStats.map((e: any) => grupoToCursoStats[e.grupo_id]).filter(Boolean)
    )
    const estudiantesUnicos = new Set(evaluaciones?.map((e) => e.estudiante_id) || [])
    const evaluacionesPorCurso = agruparEvaluacionesPorCurso(
      evalsArrayStats,
      grupoToCursoStats,
      cursoInfoStats
    )

    const evaluacionesRecientes =
      evalsArrayStats
        ?.sort((a, b) => new Date(b.fecha_creacion).getTime() - new Date(a.fecha_creacion).getTime())
        ?.slice(0, 5)
        ?.map((evaluacion) => {
          const cursoId = grupoToCursoStats[evaluacion.grupo_id]
          const cursoData = cursoInfoStats[cursoId] as any
          return {
            id: evaluacion.id,
            curso: cursoData?.nombre || 'Curso desconocido',
            codigo: cursoData?.codigo || 'N/A',
            grupo: '-',
            calificacion: evaluacion.calificacion_promedio,
            fecha: evaluacion.fecha_creacion,
          }
        }) || []

    return {
      totalEvaluaciones: metricas.totalEvaluaciones,
      calificacionPromedio: Number(metricas.calificacionPromedio.toFixed(2)),
      totalCursos: cursosUnicos.size,
      totalEstudiantes: estudiantesUnicos.size,
      evaluacionesPorCurso: Object.values(evaluacionesPorCurso),
      evaluacionesRecientes,
    }
  }

  async getHistorical(profesorId: string, period: unknown) {
    const profesorDebug = await teachersRepository.findProfessorById(profesorId)
    const profesor = profesorDebug

    if (!profesor) {
      let mockDateFilter: { gte?: string; lte?: string } = {}
      if (period) {
        const rango = rangoFechasPeriodo(String(period))
        if (rango) {
          mockDateFilter = { gte: rango.start, lte: rango.end }
        }
      }
      return {
        period: period || 'all',
        totalEvaluaciones: 0,
        calificacionPromedio: 0,
        totalCursos: 0,
        totalEstudiantes: 0,
        evaluacionesPorCurso: [],
        dateRange: period
          ? {
              start: mockDateFilter.gte,
              end: mockDateFilter.lte,
            }
          : null,
        isMockData: true,
        debug: {
          profesorId,
          debugResult: profesorDebug,
        },
      }
    }

    let dateFilter: { gte?: string; lte?: string } = {}
    if (period) {
      if (!esPeriodoValido(String(period))) {
        throw badRequest('Período inválido. Use YYYY-1 o YYYY-2.')
      }
      const rango = rangoFechasPeriodo(String(period))
      if (rango) {
        dateFilter = { gte: rango.start, lte: rango.end }
      }
    }

    let evaluaciones
    try {
      evaluaciones = await analyticsRepository.getEvaluacionesHistoricas(
        profesorId,
        dateFilter.gte || '2020-01-01',
        dateFilter.lte || '2030-12-31'
      )
    } catch (evaluacionesError) {
      throw internal('Error consultando evaluaciones históricas', evaluacionesError)
    }

    const metricasHist = resumenMetricas(evaluaciones || [])
    const estudiantesUnicos = new Set(evaluaciones?.map((e) => e.estudiante_id) || [])
    const { grupoToCurso: grupoIdToCursoId, cursoInfo: cursoIdToInfo } = await mapaGrupoYCurso(
      (evaluaciones as any[]) || []
    )
    const cursosUnicos = new Set(
      ((evaluaciones as any[]) || []).map((e: any) => grupoIdToCursoId[e.grupo_id]).filter(Boolean)
    )
    const evaluacionesPorCurso = agruparEvaluacionesPorCurso(
      evaluaciones || [],
      grupoIdToCursoId,
      cursoIdToInfo
    )

    return {
      period: period || 'all',
      totalEvaluaciones: metricasHist.totalEvaluaciones,
      calificacionPromedio: Number(metricasHist.calificacionPromedio.toFixed(2)),
      totalCursos: cursosUnicos.size,
      totalEstudiantes: estudiantesUnicos.size,
      evaluacionesPorCurso: Object.values(evaluacionesPorCurso),
      dateRange: period
        ? {
            start: dateFilter.gte,
            end: dateFilter.lte,
          }
        : null,
    }
  }

  async getCourseRating(professorId: string, courseId: string) {
    let evaluaciones: any[]
    try {
      try {
        evaluaciones = await analyticsRepository.listEvaluaciones({
          columns: 'id, grupo_id, curso_id',
          profesorId: professorId,
          completada: true,
        })
      } catch {
        evaluaciones = await analyticsRepository.listEvaluaciones({
          columns: 'id, grupo_id',
          profesorId: professorId,
          completada: true,
        })
      }
    } catch {
      throw internal('Error obteniendo evaluaciones')
    }

    const gruposCourseRating = await analyticsRepository.getGruposByIds(
      Array.from(new Set((evaluaciones || []).map((e: any) => e.grupo_id).filter(Boolean))),
      'id, curso_id'
    )
    const grupoToCursoRating: any = {}
    ;(Array.isArray(gruposCourseRating) ? gruposCourseRating : []).forEach((g: any) => {
      grupoToCursoRating[g.id] = g.curso_id
    })
    evaluaciones = (evaluaciones || []).filter(
      (e: any) => String(e.curso_id ?? grupoToCursoRating[e.grupo_id]) === String(courseId)
    )

    if (!evaluaciones || evaluaciones.length === 0) {
      return {
        promedio: null,
        total_respuestas: 0,
        mensaje: 'No hay evaluaciones completadas para este curso',
      }
    }

    let sumaTotal = 0
    let cantidadRespuestas = 0
    const evaluacionIdsRating = evaluaciones.map((e: any) => e.id).filter(Boolean)
    let respuestasRating: any[] = []
    try {
      respuestasRating = await analyticsRepository.listRespuestasByEvaluacionIds(
        evaluacionIdsRating,
        'evaluacion_id, pregunta_id, respuesta_rating, respuesta_texto'
      )
    } catch {
      respuestasRating = []
    }
    const preguntaIdsRating = Array.from(
      new Set(respuestasRating.map((r: any) => r.pregunta_id).filter(Boolean))
    )
    let preguntasRating: any[] = []
    try {
      preguntasRating = await analyticsRepository.listPreguntasByIds(preguntaIdsRating, 'id, tipo_pregunta')
    } catch {
      try {
        preguntasRating = await analyticsRepository.listPreguntasByIds(preguntaIdsRating, 'id')
      } catch {
        preguntasRating = []
      }
    }
    const preguntaTipo: any = {}
    ;(Array.isArray(preguntasRating) ? preguntasRating : []).forEach((p: any) => {
      preguntaTipo[p.id] = p.tipo_pregunta
    })
    respuestasRating.forEach((respuesta: any) => {
      const tipo = preguntaTipo[respuesta.pregunta_id]
      const valorRaw = respuesta.respuesta ?? respuesta.respuesta_rating ?? respuesta.respuesta_texto
      if ((tipo === 'likert' || tipo == null) && !isNaN(parseInt(valorRaw))) {
        sumaTotal += parseInt(valorRaw)
        cantidadRespuestas++
      }
    })

    const promedio = cantidadRespuestas > 0 ? (sumaTotal / cantidadRespuestas).toFixed(2) : null
    return {
      promedio: promedio ? parseFloat(promedio) : null,
      total_respuestas: cantidadRespuestas,
      total_evaluaciones: evaluaciones.length,
    }
  }

  async getCareerResultsAll() {
    let carreras: any[]
    try {
      carreras = await academicRepository.listCarreras('id, nombre, codigo, activo, activa')
    } catch (carrerasError) {
      try {
        carreras = await academicRepository.listCarreras('id, nombre, codigo, activa')
      } catch {
        throw internal('Error obteniendo carreras', carrerasError)
      }
    }
    carreras = filtrarCarrerasSinTronco(carreras)

    let evaluacionesGenerales: any[]
    try {
      evaluacionesGenerales = await analyticsRepository.listEvaluaciones({
        columns: 'id, calificacion_promedio, fecha_creacion, grupo_id',
      })
    } catch (evalError) {
      throw internal('Error obteniendo evaluaciones', evalError)
    }

    const resultadosPorCarrera = carreras.map((carrera) => {
      const evaluacionesCarrera: any[] = []
      const calificaciones = evaluacionesCarrera
        .map((evaluacion) => evaluacion.calificacion_promedio)
        .filter((c) => c !== null)
      const promedioCarrera =
        calificaciones.length > 0
          ? calificaciones.reduce((sum, cal) => sum + cal, 0) / calificaciones.length
          : 0
      return {
        carrera_id: carrera.id,
        carrera_nombre: carrera.nombre,
        carrera_codigo: carrera.codigo,
        total_evaluaciones: evaluacionesCarrera.length,
        calificacion_promedio: promedioCarrera,
        profesores_evaluados: 0,
        ultima_evaluacion:
          evaluacionesCarrera.length > 0
            ? Math.max(
                ...evaluacionesCarrera.map((evaluacion) => new Date(evaluacion.fecha_creacion).getTime())
              )
            : null,
      }
    })

    const totalEvaluaciones = evaluacionesGenerales?.length || 0
    const calificacionesGenerales =
      evaluacionesGenerales?.map((evaluacion) => evaluacion.calificacion_promedio).filter((c) => c !== null) ||
      []
    const promedioGeneral =
      calificacionesGenerales.length > 0
        ? calificacionesGenerales.reduce((sum, cal) => sum + cal, 0) / calificacionesGenerales.length
        : 0

    return {
      periodo: '2025-2',
      estadisticas_generales: {
        total_carreras: carreras.length,
        total_evaluaciones: totalEvaluaciones,
        promedio_general: promedioGeneral,
        carreras_con_evaluaciones: resultadosPorCarrera.filter((r) => r.total_evaluaciones > 0).length,
      },
      resultados_por_carrera: resultadosPorCarrera,
      fecha_generacion: new Date().toISOString(),
    }
  }

  async getCareerResultsByCareer(careerId: string) {
    let carrera: any
    try {
      carrera = await academicRepository.getCarreraById(careerId)
    } catch (carreraError) {
      throw notFound('Carrera no encontrada', carreraError)
    }
    if (!carrera) {
      throw notFound('Carrera no encontrada')
    }

    let profesores: any[]
    try {
      profesores = await teachersRepository.listByCareerDetailed(careerId)
    } catch (profesoresError) {
      throw internal('Error obteniendo profesores', profesoresError)
    }

    let evaluaciones: any[]
    try {
      evaluaciones = await analyticsRepository.listEvaluaciones({
        columns: 'id, calificacion_promedio, fecha_creacion, comentarios, profesor_id, grupo_id',
      })
    } catch (evaluacionesError) {
      throw internal('Error obteniendo evaluaciones', evaluacionesError)
    }
    const grupoIdsCareer = Array.from(new Set((evaluaciones || []).map((e: any) => e.grupo_id).filter(Boolean)))
    let gruposCareer: any[] = []
    try {
      gruposCareer = await analyticsRepository.getGruposByIds(grupoIdsCareer, 'id, curso_id')
    } catch {
      gruposCareer = []
    }
    const cursoIdsCareer = Array.from(new Set((gruposCareer || []).map((g: any) => g.curso_id).filter(Boolean)))
    let cursosCareer: any[] = []
    try {
      cursosCareer = await academicRepository.listCursosByIds(cursoIdsCareer, 'id, carrera_id')
    } catch {
      cursosCareer = []
    }
    const cursosDeCarrera = new Set(
      (cursosCareer || [])
        .filter((c: any) => String(c.carrera_id) === String(careerId))
        .map((c: any) => c.id)
    )
    const gruposDeCarrera = new Set(
      (gruposCareer || []).filter((g: any) => cursosDeCarrera.has(g.curso_id)).map((g: any) => g.id)
    )
    evaluaciones = (evaluaciones || []).filter((e: any) => gruposDeCarrera.has(e.grupo_id))

    const profesoresConResultados = profesores.map((profesor) => {
      const evaluacionesProfesor =
        evaluaciones?.filter((evaluacion) => evaluacion.profesor_id === profesor.id) || []
      const calificaciones = evaluacionesProfesor
        .map((evaluacion) => evaluacion.calificacion_promedio)
        .filter((c) => c !== null)
      const promedioProfesor =
        calificaciones.length > 0
          ? calificaciones.reduce((sum, cal) => sum + cal, 0) / calificaciones.length
          : 0
      const cursosEvaluados: any[] = []
      return {
        profesor_id: profesor.id,
        profesor_nombre: 'Profesor',
        profesor_email: 'email@ejemplo.com',
        total_evaluaciones: evaluacionesProfesor.length,
        calificacion_promedio: promedioProfesor,
        cursos_evaluados: cursosEvaluados,
        ultima_evaluacion:
          evaluacionesProfesor.length > 0
            ? Math.max(
                ...evaluacionesProfesor.map((evaluacion) => new Date(evaluacion.fecha_creacion).getTime())
              )
            : null,
      }
    })

    const totalEvaluaciones = evaluaciones?.length || 0
    const calificacionesGenerales =
      evaluaciones?.map((evaluacion) => evaluacion.calificacion_promedio).filter((c) => c !== null) || []
    const promedioGeneral =
      calificacionesGenerales.length > 0
        ? calificacionesGenerales.reduce((sum, cal) => sum + cal, 0) / calificacionesGenerales.length
        : 0

    return {
      carrera: {
        id: carrera.id,
        nombre: carrera.nombre,
        codigo: carrera.codigo,
        descripcion: carrera.descripcion,
        activa: carrera.activa,
      },
      periodo: '2025-2',
      estadisticas_carrera: {
        total_profesores: profesores.length,
        profesores_evaluados: profesoresConResultados.filter((p) => p.total_evaluaciones > 0).length,
        total_evaluaciones: totalEvaluaciones,
        promedio_general: promedioGeneral,
        cursos_evaluados: 0,
      },
      profesores: profesoresConResultados,
      fecha_generacion: new Date().toISOString(),
    }
  }

  async getStudentStats(usuarioId: string) {
    const estudiante = await academicRepository.findEstudianteByUsuarioId(usuarioId)
    if (!estudiante) {
      return {
        evaluacionesCompletadas: 0,
        evaluacionesPendientes: 0,
        materiasMatriculadas: 0,
        promedioGeneral: 0,
        progresoGeneral: 0,
      }
    }

    let evaluacionesCompletadas: any[] = []
    try {
      evaluacionesCompletadas = await analyticsRepository.listEvaluaciones({
        columns: 'id, calificacion_promedio',
        estudianteId: estudiante.id,
        completada: true,
      })
    } catch {
      evaluacionesCompletadas = []
    }

    let materiasMatriculadas: any[] = []
    try {
      materiasMatriculadas = await academicRepository.listInscripcionesActivas(estudiante.id)
    } catch {
      materiasMatriculadas = []
    }

    const promedioGeneral =
      evaluacionesCompletadas && evaluacionesCompletadas.length > 0
        ? evaluacionesCompletadas.reduce((sum, e) => sum + (e.calificacion_promedio || 0), 0) /
          evaluacionesCompletadas.length
        : 0

    const materiasMatriculadasCount = materiasMatriculadas?.length || 0
    const evaluacionesCompletadasCount = evaluacionesCompletadas?.length || 0
    const evaluacionesPendientesCount = materiasMatriculadasCount - evaluacionesCompletadasCount

    return {
      evaluacionesCompletadas: evaluacionesCompletadasCount,
      evaluacionesPendientes: Math.max(0, evaluacionesPendientesCount),
      materiasMatriculadas: materiasMatriculadasCount,
      promedioGeneral: Number(promedioGeneral.toFixed(2)),
      progresoGeneral:
        materiasMatriculadasCount > 0
          ? Math.round((evaluacionesCompletadasCount / materiasMatriculadasCount) * 100)
          : 0,
    }
  }

  async getTeacherStats(teacherId: string) {
    const profesor = await teachersRepository.findProfessorById(teacherId)
    if (!profesor) {
      throw notFound('Profesor no encontrado')
    }

    let evaluacionesCompletadas
    try {
      evaluacionesCompletadas = await analyticsRepository.getCompletedForTeacherStats(profesor.id)
    } catch (completadasError) {
      throw internal(
        'Error obteniendo evaluaciones completadas',
        (completadasError as Error)?.message ?? completadasError
      )
    }

    const evaluacionesArray = Array.isArray(evaluacionesCompletadas) ? evaluacionesCompletadas : []
    const grupoIds = Array.from(new Set(evaluacionesArray.map((e: any) => e.grupo_id).filter(Boolean)))

    let gruposEvaluados
    try {
      gruposEvaluados = await analyticsRepository.getGruposByIds(grupoIds, 'id, curso_id')
    } catch (gruposError) {
      throw internal(
        'Error obteniendo grupos de evaluaciones',
        (gruposError as Error)?.message ?? gruposError
      )
    }

    const grupoToCurso = new Map<any, any>()
    ;(gruposEvaluados || []).forEach((g: any) => {
      grupoToCurso.set(g.id, g.curso_id)
    })

    const cursoIdsFromEvals = Array.from(
      new Set((gruposEvaluados || []).map((g: any) => g.curso_id).filter(Boolean))
    )

    let asignacionesActivas: any[]
    try {
      const asignaciones = await academicRepository.listAsignacionesByProfesorIds([profesor.id])
      asignacionesActivas = (asignaciones || []).filter((a: any) => a.activa !== false)
    } catch (cursosError: any) {
      throw internal('Error obteniendo cursos del profesor', cursosError.message)
    }

    const cursosActivosSet = new Set((asignacionesActivas || []).map((a: any) => a.curso_id).filter(Boolean))
    const gruposActivosSet = new Set((asignacionesActivas || []).map((a: any) => a.grupo_id).filter(Boolean))
    const cursoIdsToFetch = Array.from(new Set([...cursoIdsFromEvals, ...Array.from(cursosActivosSet)]))

    let cursosInfo: any[]
    try {
      cursosInfo = await academicRepository.listCursosByIds(cursoIdsToFetch, 'id, nombre, codigo')
    } catch (cursosInfoError: any) {
      throw internal('Error obteniendo información de cursos', cursosInfoError.message)
    }

    const cursoById = new Map<any, any>()
    ;(cursosInfo || []).forEach((c: any) => cursoById.set(c.id, c))

    const promedioGeneral =
      evaluacionesArray.length > 0
        ? evaluacionesArray.reduce((sum: number, e: any) => sum + (e.calificacion_promedio || 0), 0) /
          evaluacionesArray.length
        : 0

    const perCourseAccumulator = new Map<any, { total: number; sum: number }>()
    evaluacionesArray.forEach((e: any) => {
      const cursoId = grupoToCurso.get(e.grupo_id)
      if (!cursoId) return
      const current = perCourseAccumulator.get(cursoId) || { total: 0, sum: 0 }
      current.total += 1
      current.sum += Number(e.calificacion_promedio || 0)
      perCourseAccumulator.set(cursoId, current)
    })

    const evaluacionesPorCurso = cursoIdsToFetch
      .map((cursoId: any) => {
        const curso = cursoById.get(cursoId)
        const values = perCourseAccumulator.get(cursoId) || { total: 0, sum: 0 }
        return {
          curso_id: cursoId,
          nombre: curso?.nombre || 'Curso',
          codigo: curso?.codigo || 'N/A',
          total: values.total,
          encuestasRespondidas: values.total,
          promedio: values.total > 0 ? Number((values.sum / values.total).toFixed(2)) : 0,
        }
      })
      .sort((a, b) => b.total - a.total)

    const cursosImpartidos = Math.max(cursosActivosSet.size, evaluacionesPorCurso.length)

    return {
      calificacionPromedio: Number(promedioGeneral.toFixed(2)),
      totalEvaluaciones: evaluacionesArray.length,
      cursosImpartidos,
      totalGruposImpartidos: gruposActivosSet.size,
      evaluacionesPorCurso,
    }
  }

  async getPeriodStats(usuarioId: string, period: unknown) {
    const profesor = await teachersRepository.findByUsuarioId(usuarioId)
    if (!profesor) {
      throw notFound('Profesor no encontrado')
    }

    const dateFilter = filtroFechas(period)
    let evaluaciones
    try {
      evaluaciones = await analyticsRepository.getCompletedInPeriod(
        profesor.id,
        dateFilter.gte || '2020-01-01',
        dateFilter.lte || '2030-12-31',
        'id, calificacion_promedio, fecha_creacion, grupo_id'
      )
    } catch (evaluacionesError) {
      throw internal('Error consultando evaluaciones del período', evaluacionesError)
    }

    const totalEvaluaciones = evaluaciones?.length || 0
    const calificacionPromedio =
      totalEvaluaciones > 0
        ? ((evaluaciones as any[]) || []).reduce(
            (sum: number, e: any) => sum + (e.calificacion_promedio || 0),
            0
          ) / totalEvaluaciones
        : 0

    const evalsArray: any[] = Array.isArray(evaluaciones) ? (evaluaciones as any[]) : []
    const { grupoToCurso, cursoInfo: periodCursoMap } = await mapaGrupoYCurso(evalsArray, 'id, curso_id')

    const evaluacionesPorCursoMap: any = {}
    evalsArray.forEach((e: any) => {
      const cursoId = grupoToCurso[e.grupo_id]
      const nombre = periodCursoMap[cursoId]?.nombre || 'Curso'
      const key = `${cursoId}-${nombre}`
      if (!evaluacionesPorCursoMap[key]) {
        evaluacionesPorCursoMap[key] = {
          curso_id: cursoId,
          nombre,
          codigo: periodCursoMap[cursoId]?.codigo || 'N/A',
          total: 0,
          promedio: 0,
          _sum: 0,
        }
      }
      evaluacionesPorCursoMap[key].total += 1
      evaluacionesPorCursoMap[key]._sum += e.calificacion_promedio || 0
    })

    const evaluacionesPorCurso: any[] = []
    for (const key in evaluacionesPorCursoMap) {
      const c = evaluacionesPorCursoMap[key]
      evaluacionesPorCurso.push({
        curso_id: c.curso_id,
        nombre: c.nombre,
        codigo: c.codigo,
        total: c.total,
        promedio: c.total > 0 ? Number((c._sum / c.total).toFixed(2)) : 0,
      })
    }

    let cursosImpartidos: any[] = []
    try {
      const asignaciones = await academicRepository.listAsignacionesByProfesorIds([profesor.id])
      cursosImpartidos = (asignaciones || []).filter((a: any) => a.activa === true)
    } catch {
      cursosImpartidos = []
    }

    return {
      totalEvaluaciones,
      calificacionPromedio: Number(calificacionPromedio.toFixed(2)),
      totalCursos: cursosImpartidos?.length || 0,
      evaluacionesPorCurso,
      period: period || 'all',
    }
  }

  async getPeriodCategoryStats(usuarioId: string, period: unknown, courseId: unknown) {
    const profesor = await teachersRepository.findByUsuarioId(usuarioId)
    if (!profesor) {
      throw notFound('Profesor no encontrado')
    }

    const dateFilter = filtroFechas(period)
    let evaluaciones
    try {
      evaluaciones = await analyticsRepository.getCompletedInPeriod(
        profesor.id,
        dateFilter.gte || '2020-01-01',
        dateFilter.lte || '2030-12-31'
      )
    } catch (evalError) {
      throw internal('Error obteniendo evaluaciones', evalError)
    }

    let evalsArray: any[] = Array.isArray(evaluaciones) ? (evaluaciones as any[]) : []
    if (courseId && evalsArray.length > 0) {
      const grupoIds = Array.from(new Set(evalsArray.map((e: any) => e.grupo_id).filter(Boolean)))
      const grupos = await analyticsRepository.getGruposByIds(grupoIds, 'id, curso_id')
      const grupoToCurso: any = {}
      ;(Array.isArray(grupos) ? grupos : []).forEach((g: any) => {
        grupoToCurso[g.id] = g.curso_id
      })
      evalsArray = evalsArray.filter((e: any) => String(grupoToCurso[e.grupo_id]) === String(courseId))
    }

    const evaluacionIds = Array.from(new Set(evalsArray.map((e: any) => e.id)))
    if (evaluacionIds.length === 0) return []

    let respuestas: any[] = []
    try {
      respuestas = await analyticsRepository.listRespuestasByEvaluacionIds(
        evaluacionIds,
        'evaluacion_id, pregunta_id, respuesta_rating'
      )
    } catch {
      try {
        respuestas = await analyticsRepository.listRespuestasByEvaluacionIds(
          evaluacionIds,
          'evaluacion_id, pregunta_id, valor'
        )
      } catch (fallbackError) {
        throw internal('Error obteniendo respuestas', fallbackError)
      }
    }

    const preguntaIds = Array.from(new Set(((respuestas as any[]) || []).map((r: any) => r.pregunta_id)))
    if (preguntaIds.length === 0) return []

    let catPreg: any[]
    try {
      catPreg = await analyticsRepository.listPreguntasByIds(preguntaIds, 'id, categoria_id')
    } catch (catPregError) {
      throw internal('Error obteniendo categorías de preguntas', catPregError)
    }
    const preguntaToCategoria: any = {}
    ;(Array.isArray(catPreg) ? catPreg : []).forEach((cp: any) => {
      preguntaToCategoria[cp.id] = cp.categoria_id
    })

    const categoriaIds = Array.from(
      new Set(((catPreg as any[]) || []).map((cp: any) => cp.categoria_id).filter(Boolean))
    )
    let categorias: any[] = []
    try {
      categorias = await analyticsRepository.listCategoriasByIds(categoriaIds, 'id, nombre')
    } catch {
      categorias = []
    }
    const categoriaInfo: any = {}
    ;(Array.isArray(categorias) ? categorias : []).forEach((c: any) => {
      categoriaInfo[c.id] = c.nombre
    })

    const acumulado: any = {}
    ;(Array.isArray(respuestas) ? (respuestas as any[]) : []).forEach((r: any) => {
      const catId = preguntaToCategoria[r.pregunta_id]
      if (!catId) return
      if (!acumulado[catId]) acumulado[catId] = { sum: 0, count: 0 }
      const rating = Number(r.respuesta_rating ?? r.valor ?? 0)
      if (!Number.isFinite(rating) || rating <= 0) return
      acumulado[catId].sum += rating
      acumulado[catId].count += 1
    })

    return Object.keys(acumulado).map((catId: any) => ({
      categoriaId: Number(catId),
      nombre: categoriaInfo[catId] || `Categoría ${catId}`,
      promedio:
        acumulado[catId].count > 0 ? Number((acumulado[catId].sum / acumulado[catId].count).toFixed(2)) : 0,
    }))
  }
}

export const teachersAnalyticsService = new TeachersAnalyticsService()
