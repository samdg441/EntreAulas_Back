import { Router } from 'express'
import { z } from 'zod'
import { authenticateToken } from '../../middleware/auth'
import jwt from 'jsonwebtoken'
import { calcularPromedio, esPeriodoValido, rangoFechasPeriodo, resumenMetricas } from './calificaciones'
import { analyticsRepository } from './analytics.repository'
import { teachersRepository } from '../academic/teachers.repository'
import { academicRepository } from '../academic/academic.repository'
import {
  badRequest,
  forbidden,
  internal,
  notFound,
  sendError,
} from '../../shared/errors'

const router = Router()

// GET /teachers - Obtener profesores con sus cursos
router.get('/:profesorId/stats', authenticateToken, async (req: any, res) => {
  try {
    const { profesorId } = req.params
    const user = req.user

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
    const totalEvaluaciones = metricas.totalEvaluaciones
    const calificacionPromedio = metricas.calificacionPromedio

    // Mapear grupo -> curso y obtener info de curso
    const evalsArrayStats: any[] = Array.isArray(evaluaciones) ? (evaluaciones as any[]) : []
    const gruposIdsStats = Array.from(new Set(evalsArrayStats.map((e: any) => e.grupo_id).filter(Boolean)))
    const gruposStats = await analyticsRepository.getGruposByIds(gruposIdsStats)
    const grupoToCursoStats: any = {}
    ;(Array.isArray(gruposStats) ? gruposStats : []).forEach((g: any) => { grupoToCursoStats[g.id] = g.curso_id })

    const cursoIdsStats = Array.from(new Set(((Array.isArray(gruposStats) ? gruposStats : []).map((g: any) => g.curso_id)).filter(Boolean)))
    let cursosStats: any[] = []
    try {
      cursosStats = await academicRepository.listCursosByIds(cursoIdsStats, 'id, nombre, codigo')
    } catch {
      cursosStats = []
    }
    const cursoInfoStats: any = {}
    ;(Array.isArray(cursosStats) ? cursosStats : []).forEach((c: any) => { cursoInfoStats[c.id] = c })

    // Obtener cursos únicos evaluados
    const cursosUnicos = new Set(evalsArrayStats.map((e: any) => grupoToCursoStats[e.grupo_id]).filter(Boolean))
    const totalCursos = cursosUnicos.size

    // Obtener estudiantes únicos que han evaluado
    const estudiantesUnicos = new Set(evaluaciones?.map(e => e.estudiante_id) || [])
    const totalEstudiantes = estudiantesUnicos.size

    // Obtener evaluaciones por curso
    const evaluacionesPorCurso = evalsArrayStats?.reduce((acc: any, evaluacion: any) => {
      const cursoId = grupoToCursoStats[evaluacion.grupo_id]
      const cursoData = cursoInfoStats[cursoId] as any
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
          evaluaciones: []
        }
      }
      acc[cursoKey].total++
      acc[cursoKey].evaluaciones.push(evaluacion)
      return acc
    }, {} as any) || {}

    // Calcular promedios por curso
    Object.values(evaluacionesPorCurso).forEach((curso: any) => {
      curso.promedio = Number(
        calcularPromedio(curso.evaluaciones.map((e: any) => e.calificacion_promedio)).toFixed(2)
      )
    })

    // Obtener evaluaciones recientes (últimas 5)
    const evaluacionesRecientes = evalsArrayStats
      ?.sort((a, b) => new Date(b.fecha_creacion).getTime() - new Date(a.fecha_creacion).getTime())
      ?.slice(0, 5)
      ?.map(evaluacion => {
        const cursoId = grupoToCursoStats[evaluacion.grupo_id]
        const cursoData = cursoInfoStats[cursoId] as any
        return {
          id: evaluacion.id,
          curso: cursoData?.nombre || 'Curso desconocido',
          codigo: cursoData?.codigo || 'N/A',
          grupo: '-',
          calificacion: evaluacion.calificacion_promedio,
          fecha: evaluacion.fecha_creacion
        }
      }) || []

    const stats = {
      totalEvaluaciones,
      calificacionPromedio: Number(calificacionPromedio.toFixed(2)),
      totalCursos,
      totalEstudiantes,
      evaluacionesPorCurso: Object.values(evaluacionesPorCurso),
      evaluacionesRecientes
    }

    res.json(stats)
  } catch (error) {
    return sendError(res, error)
  }
})

// GET /teachers/:profesorId/stats/historical - Obtener estadísticas históricas del profesor

router.get('/:profesorId/stats/historical', authenticateToken, async (req: any, res) => {
  try {
    const { profesorId } = req.params
    const { period } = req.query // Ejemplo: ?period=2023-1, 2023-2, 2024-1, etc.
    const user = req.user

    const profesorDebug = await teachersRepository.findProfessorById(profesorId)
    const profesor = profesorDebug

    if (!profesor) {
      // Construir filtro de fecha para los datos mock
      let mockDateFilter: { gte?: string; lte?: string } = {}
      if (period) {
        const rango = rangoFechasPeriodo(String(period))
        if (rango) {
          mockDateFilter = { gte: rango.start, lte: rango.end }
        }
      }

      // Retornar datos de ejemplo si el profesor no existe
      const mockHistoricalStats = {
        period: period || 'all',
        totalEvaluaciones: 0,
        calificacionPromedio: 0,
        totalCursos: 0,
        totalEstudiantes: 0,
        evaluacionesPorCurso: [],
        dateRange: period ? {
          start: mockDateFilter.gte,
          end: mockDateFilter.lte
        } : null,
        isMockData: true,
        debug: {
          profesorId,
          debugResult: profesorDebug,
        }
      };
      return res.json(mockHistoricalStats);
    }

    // Construir filtro de fecha basado en el período
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

    // Obtener evaluaciones del profesor con filtro de período
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

    // Calcular estadísticas históricas
    const metricasHist = resumenMetricas(evaluaciones || [])
    const totalEvaluaciones = metricasHist.totalEvaluaciones
    const calificacionPromedio = metricasHist.calificacionPromedio

    // Obtener estudiantes únicos que han evaluado en este período
    const estudiantesUnicos = new Set(evaluaciones?.map(e => e.estudiante_id) || [])
    const totalEstudiantes = estudiantesUnicos.size

    // Obtener evaluaciones por curso para este período
    // Mapear grupo_id -> curso_id y luego curso info
    const gruposIds = Array.from(new Set(((evaluaciones as any[]) || []).map((e: any) => e.grupo_id).filter(Boolean)))
    const gruposInfo = await analyticsRepository.getGruposByIds(gruposIds)

    const grupoIdToCursoId: any = {}
    ;(Array.isArray(gruposInfo) ? gruposInfo : []).forEach((g: any) => { grupoIdToCursoId[g.id] = g.curso_id })

    const cursoIds = Array.from(new Set(((Array.isArray(gruposInfo) ? gruposInfo : []).map((g: any) => g.curso_id)).filter(Boolean)))
    let cursosInfo: any[] = []
    try {
      cursosInfo = await academicRepository.listCursosByIds(cursoIds, 'id, nombre, codigo')
    } catch {
      cursosInfo = []
    }

    const cursoIdToInfo: any = {}
    ;(cursosInfo || []).forEach((c: any) => { cursoIdToInfo[c.id] = c })

    // Cursos únicos una vez construido el mapa
    const cursosUnicos = new Set(((evaluaciones as any[]) || []).map((e: any) => grupoIdToCursoId[e.grupo_id]).filter(Boolean))
    const totalCursos = cursosUnicos.size

    const evaluacionesPorCurso = evaluaciones?.reduce((acc, evaluacion) => {
      const cursoId = grupoIdToCursoId[evaluacion.grupo_id]
      const cursoData = cursoIdToInfo[cursoId] as any
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
          evaluaciones: []
        }
      }
      acc[cursoKey].total++
      acc[cursoKey].evaluaciones.push(evaluacion)
      return acc
    }, {} as any) || {}

    // Calcular promedios por curso
    Object.values(evaluacionesPorCurso).forEach((curso: any) => {
      curso.promedio = Number(
        calcularPromedio(curso.evaluaciones.map((e: any) => e.calificacion_promedio)).toFixed(2)
      )
    })

    const historicalStats = {
      period: period || 'all',
      totalEvaluaciones,
      calificacionPromedio: Number(calificacionPromedio.toFixed(2)),
      totalCursos,
      totalEstudiantes,
      evaluacionesPorCurso: Object.values(evaluacionesPorCurso),
      dateRange: period ? {
        start: dateFilter.gte,
        end: dateFilter.lte
      } : null
    }

    res.json(historicalStats)
  } catch (error) {
    return sendError(res, error)
  }
})

// ID de profesor: en muchas BD es entero (serial); en otras puede ser UUID.
const teacherIdSchema = z.union([
  z.string().uuid('ID de profesor inválido'),
  z
    .string()
    .regex(/^\d+$/, 'ID de profesor inválido')
    .refine((s) => parseInt(s, 10) > 0, 'ID de profesor inválido'),
])

// Schema de validación para evaluaciones
const evaluationSchema = z.object({
  teacherId: teacherIdSchema,
  courseId: z.union([
    z.string().uuid('ID de curso inválido (UUID)'),
    z.string().transform(val => parseInt(val, 10)).pipe(z.number().int().positive('ID de curso inválido (número)'))
  ]),
  groupId: z.string().optional(),
  answers: z.array(z.object({
    questionId: z.number().int().positive('ID de pregunta inválido'),
    rating: z.number().int().min(1).max(5).nullable().optional(),
    textAnswer: z.string().nullable().optional(),
    selectedOption: z.string().nullable().optional()
  })).min(1, 'Debe haber al menos una respuesta'),
  overallRating: z.number().min(1).max(5, 'Calificación promedio debe estar entre 1 y 5'),
  comments: z.string().optional()
})

// POST /teachers/evaluations - Guardar evaluación de un profesor

router.get('/course-rating/:professorId/:courseId', async (req, res) => {
  try {
    const { professorId, courseId } = req.params

    // Buscar evaluaciones del profesor en el curso específico
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
    evaluaciones = (evaluaciones || []).filter((e: any) =>
      String(e.curso_id ?? grupoToCursoRating[e.grupo_id]) === String(courseId)
    )

    if (!evaluaciones || evaluaciones.length === 0) {
      return res.json({
        promedio: null,
        total_respuestas: 0,
        mensaje: 'No hay evaluaciones completadas para este curso'
      })
    }

    // Calcular promedio de respuestas numéricas (Likert scale)
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
    const preguntaIdsRating = Array.from(new Set(respuestasRating.map((r: any) => r.pregunta_id).filter(Boolean)))
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

    res.json({
      promedio: promedio ? parseFloat(promedio) : null,
      total_respuestas: cantidadRespuestas,
      total_evaluaciones: evaluaciones.length
    })
  } catch (error) {
    return sendError(res, error)
  }
})

// GET /teachers/careers - Obtener carreras disponibles (para coordinadores)

router.get('/career-results/all', authenticateToken, async (req: any, res) => {
  try {
    const user = req.user

    // Verificar que el usuario sea decano
    if (!user.roles?.includes('decano')) {
      throw forbidden('Acceso denegado. Solo decanos pueden acceder a estos resultados.')
    }

    // Obtener todas las carreras activas (excluyendo tronco común)
    let carreras: any[]
    try {
      carreras = await academicRepository.listCarreras('id, nombre, codigo, activo, activa')
    } catch (carrerasError) {
      try {
        carreras = await academicRepository.listCarreras('id, nombre, codigo, activa')
      } catch (fallbackError) {
        throw internal('Error obteniendo carreras', carrerasError)
      }
    }
    carreras = (carreras || []).filter((c: any) => {
      const nombre = String(c.nombre || '').toLowerCase()
      if (nombre.includes('tronco común') || nombre.includes('tronco comun')) return false
      if (c.activa !== undefined && c.activa !== true) return false
      if (c.activo !== undefined && c.activo !== true) return false
      return true
    })

    // Obtener estadísticas generales de evaluaciones
    let evaluacionesGenerales: any[]
    try {
      evaluacionesGenerales = await analyticsRepository.listEvaluaciones({
        columns: 'id, calificacion_promedio, fecha_creacion, grupo_id',
      })
    } catch (evalError) {
      throw internal('Error obteniendo evaluaciones', evalError)
    }

    // Procesar datos por carrera
    const resultadosPorCarrera = carreras.map(carrera => {
      // TODO: Corregir consulta SQL para evitar errores de TypeScript
      const evaluacionesCarrera: any[] = [] // evaluacionesGenerales?.filter(evaluacion =>
        // evaluacion.grupos?.cursos?.carrera_id === carrera.id
      // ) || []

      const calificaciones = evaluacionesCarrera.map(evaluacion => evaluacion.calificacion_promedio).filter(c => c !== null)
      const promedioCarrera = calificaciones.length > 0
        ? calificaciones.reduce((sum, cal) => sum + cal, 0) / calificaciones.length
        : 0
      return {
        carrera_id: carrera.id,
        carrera_nombre: carrera.nombre,
        carrera_codigo: carrera.codigo,
        total_evaluaciones: evaluacionesCarrera.length,
        calificacion_promedio: promedioCarrera,
        profesores_evaluados: 0, // TODO: Corregir consulta SQL
        ultima_evaluacion: evaluacionesCarrera.length > 0
          ? Math.max(...evaluacionesCarrera.map(evaluacion => new Date(evaluacion.fecha_creacion).getTime()))
          : null
      }
    })

    // Estadísticas generales
    const totalEvaluaciones = evaluacionesGenerales?.length || 0
    const calificacionesGenerales = evaluacionesGenerales?.map(evaluacion => evaluacion.calificacion_promedio).filter(c => c !== null) || []
    const promedioGeneral = calificacionesGenerales.length > 0
      ? calificacionesGenerales.reduce((sum, cal) => sum + cal, 0) / calificacionesGenerales.length
      : 0

    const resultado = {
      periodo: '2025-2', // TODO: Hacer dinámico
      estadisticas_generales: {
        total_carreras: carreras.length,
        total_evaluaciones: totalEvaluaciones,
        promedio_general: promedioGeneral,
        carreras_con_evaluaciones: resultadosPorCarrera.filter(r => r.total_evaluaciones > 0).length
      },
      resultados_por_carrera: resultadosPorCarrera,
      fecha_generacion: new Date().toISOString()
    }

    res.json(resultado)
  } catch (error) {
    return sendError(res, error)
  }
})

// GET /teachers/career-results/:careerId - Obtener resultados para una carrera específica

router.get('/career-results/:careerId', authenticateToken, async (req: any, res) => {
  try {
    const user = req.user
    const { careerId } = req.params

    // Verificar que el usuario sea decano
    if (!user.roles?.includes('decano')) {
      throw forbidden('Acceso denegado. Solo decanos pueden acceder a estos resultados.')
    }

    // Obtener información de la carrera
    let carrera: any
    try {
      carrera = await academicRepository.getCarreraById(careerId)
    } catch (carreraError) {
      throw notFound('Carrera no encontrada', carreraError)
    }

    if (!carrera) {
      throw notFound('Carrera no encontrada')
    }

    // Obtener profesores de la carrera
    let profesores: any[]
    try {
      profesores = await teachersRepository.listByCareerDetailed(careerId)
    } catch (profesoresError) {
      throw internal('Error obteniendo profesores', profesoresError)
    }

    // Obtener evaluaciones de la carrera
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
      (gruposCareer || [])
        .filter((g: any) => cursosDeCarrera.has(g.curso_id))
        .map((g: any) => g.id)
    )
    evaluaciones = (evaluaciones || []).filter((e: any) => gruposDeCarrera.has(e.grupo_id))

    // Procesar datos por profesor
    const profesoresConResultados = profesores.map(profesor => {
      const evaluacionesProfesor = evaluaciones?.filter(evaluacion =>
        evaluacion.profesor_id === profesor.id
      ) || []

      const calificaciones = evaluacionesProfesor.map(evaluacion => evaluacion.calificacion_promedio).filter(c => c !== null)
      const promedioProfesor = calificaciones.length > 0
        ? calificaciones.reduce((sum, cal) => sum + cal, 0) / calificaciones.length
        : 0

      // TODO: Corregir consulta SQL para evitar errores de TypeScript
      const cursosEvaluados: any[] = [] // evaluacionesProfesor.map(evaluacion => ({
        // curso_id: evaluacion.grupos?.cursos?.id,
        // curso_nombre: evaluacion.grupos?.cursos?.nombre,
        // curso_codigo: evaluacion.grupos?.cursos?.codigo,
        // calificacion: evaluacion.calificacion_promedio,
        // fecha_evaluacion: evaluacion.fecha_creacion
      // }))
      return {
        profesor_id: profesor.id,
        profesor_nombre: 'Profesor', // TODO: Corregir consulta SQL
        profesor_email: 'email@ejemplo.com', // TODO: Corregir consulta SQL
        total_evaluaciones: evaluacionesProfesor.length,
        calificacion_promedio: promedioProfesor,
        cursos_evaluados: cursosEvaluados,
        ultima_evaluacion: evaluacionesProfesor.length > 0
          ? Math.max(...evaluacionesProfesor.map(evaluacion => new Date(evaluacion.fecha_creacion).getTime()))
          : null
      }
    })

    // Estadísticas de la carrera
    const totalEvaluaciones = evaluaciones?.length || 0
    const calificacionesGenerales = evaluaciones?.map(evaluacion => evaluacion.calificacion_promedio).filter(c => c !== null) || []
    const promedioGeneral = calificacionesGenerales.length > 0
      ? calificacionesGenerales.reduce((sum, cal) => sum + cal, 0) / calificacionesGenerales.length
      : 0

    const resultado = {
      carrera: {
        id: carrera.id,
        nombre: carrera.nombre,
        codigo: carrera.codigo,
        descripcion: carrera.descripcion,
        activa: carrera.activa
      },
      periodo: '2025-2', // TODO: Hacer dinámico
      estadisticas_carrera: {
        total_profesores: profesores.length,
        profesores_evaluados: profesoresConResultados.filter(p => p.total_evaluaciones > 0).length,
        total_evaluaciones: totalEvaluaciones,
        promedio_general: promedioGeneral,
        cursos_evaluados: 0 // TODO: Corregir consulta SQL
      },
      profesores: profesoresConResultados,
      fecha_generacion: new Date().toISOString()
    }

    res.json(resultado)
  } catch (error) {
    return sendError(res, error)
  }
})

// GET /teachers/student-stats - Obtener estadísticas del estudiante

router.get('/student-stats', authenticateToken, async (req: any, res) => {
  try {
    const user = req.user

    // Verificar que el usuario es un estudiante
    if (user.tipo_usuario !== 'estudiante') {
      throw forbidden('Solo los estudiantes pueden acceder a estas estadísticas')
    }

    // Obtener el ID del estudiante (si no existe, devolver datos en cero para que el dashboard cargue)
    const estudiante = await academicRepository.findEstudianteByUsuarioId(user.id)

    if (!estudiante) {
      return res.json({
        evaluacionesCompletadas: 0,
        evaluacionesPendientes: 0,
        materiasMatriculadas: 0,
        promedioGeneral: 0,
        progresoGeneral: 0
      });
    }

    // Obtener evaluaciones completadas
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

    // Obtener materias matriculadas (grupos donde está inscrito)
    let materiasMatriculadas: any[] = []
    try {
      materiasMatriculadas = await academicRepository.listInscripcionesActivas(estudiante.id)
    } catch {
      materiasMatriculadas = []
    }

    // Calcular promedio general
    const promedioGeneral = evaluacionesCompletadas && evaluacionesCompletadas.length > 0
      ? evaluacionesCompletadas.reduce((sum, e) => sum + (e.calificacion_promedio || 0), 0) / evaluacionesCompletadas.length
      : 0

    // Calcular estadísticas según la lógica correcta:
    // 1. Materias matriculadas = contar inscripciones activas
    // 2. Evaluaciones completadas = contar evaluaciones completadas
    // 3. Evaluaciones pendientes = materias matriculadas - evaluaciones completadas
    const materiasMatriculadasCount = materiasMatriculadas?.length || 0
    const evaluacionesCompletadasCount = evaluacionesCompletadas?.length || 0
    const evaluacionesPendientesCount = materiasMatriculadasCount - evaluacionesCompletadasCount

    const stats = {
      evaluacionesCompletadas: evaluacionesCompletadasCount,
      evaluacionesPendientes: Math.max(0, evaluacionesPendientesCount), // No puede ser negativo
      materiasMatriculadas: materiasMatriculadasCount,
      promedioGeneral: Number(promedioGeneral.toFixed(2)),
      progresoGeneral: materiasMatriculadasCount > 0
        ? Math.round((evaluacionesCompletadasCount / materiasMatriculadasCount) * 100)
        : 0
    }

    res.json(stats)
  } catch (error) {
    return sendError(res, error)
  }
})

// GET /teachers/student-enrolled-subjects - Obtener materias matriculadas del estudiante

router.get('/teacher-stats/:teacherId', authenticateToken, async (req: any, res) => {
  try {
    const user = req.user
    const { teacherId } = req.params

    // Verificar que el usuario es un profesor
    if (user.tipo_usuario !== 'profesor') {
      throw forbidden('Solo los profesores pueden acceder a estas estadísticas')
    }

    // Obtener el ID del profesor
    const profesor = await teachersRepository.findProfessorById(teacherId)
    if (!profesor) {
      throw notFound('Profesor no encontrado')
    }

    let evaluacionesCompletadas
    try {
      evaluacionesCompletadas = await analyticsRepository.getCompletedForTeacherStats(profesor.id)
    } catch (completadasError) {
      throw internal('Error obteniendo evaluaciones completadas', (completadasError as Error)?.message ?? completadasError)
    }

    const evaluacionesArray = Array.isArray(evaluacionesCompletadas) ? evaluacionesCompletadas : []
    const grupoIds = Array.from(new Set(evaluacionesArray.map((e: any) => e.grupo_id).filter(Boolean)))

    // Resolver curso por cada grupo evaluado para agrupar correctamente por curso
    let gruposEvaluados
    try {
      gruposEvaluados = await analyticsRepository.getGruposByIds(grupoIds, 'id, curso_id')
    } catch (gruposError) {
      throw internal('Error obteniendo grupos de evaluaciones', (gruposError as Error)?.message ?? gruposError)
    }

    const grupoToCurso = new Map<any, any>()
    ;(gruposEvaluados || []).forEach((g: any) => {
      grupoToCurso.set(g.id, g.curso_id)
    })

    const cursoIdsFromEvals = Array.from(
      new Set((gruposEvaluados || []).map((g: any) => g.curso_id).filter(Boolean))
    )

    // Obtener cursos activos impartidos por el profesor para la card de cursos
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

    // Calcular promedio general
    const promedioGeneral = evaluacionesArray.length > 0
      ? evaluacionesArray.reduce((sum: number, e: any) => sum + (e.calificacion_promedio || 0), 0) / evaluacionesArray.length
      : 0

    // Agrupar evaluaciones por curso de forma real
    const perCourseAccumulator = new Map<any, { total: number; sum: number }>()
    evaluacionesArray.forEach((e: any) => {
      const cursoId = grupoToCurso.get(e.grupo_id)
      if (!cursoId) return
      const current = perCourseAccumulator.get(cursoId) || { total: 0, sum: 0 }
      current.total += 1
      current.sum += Number(e.calificacion_promedio || 0)
      perCourseAccumulator.set(cursoId, current)
    })

    // Incluir TODOS los cursos del docente (asignados + evaluados),
    // para que en frontend se puedan seleccionar aunque tengan 0 encuestas.
    const evaluacionesPorCurso = cursoIdsToFetch.map((cursoId: any) => {
      const curso = cursoById.get(cursoId)
      const values = perCourseAccumulator.get(cursoId) || { total: 0, sum: 0 }
      return {
        curso_id: cursoId,
        nombre: curso?.nombre || 'Curso',
        codigo: curso?.codigo || 'N/A',
        total: values.total,
        encuestasRespondidas: values.total,
        promedio: values.total > 0 ? Number((values.sum / values.total).toFixed(2)) : 0
      }
    })
    .sort((a, b) => b.total - a.total)

    // Conteo robusto: prioriza asignaciones activas, pero usa evaluaciones como respaldo si faltan relaciones
    const cursosImpartidos = Math.max(cursosActivosSet.size, evaluacionesPorCurso.length)
    const totalGruposImpartidos = gruposActivosSet.size

    const stats = {
      calificacionPromedio: Number(promedioGeneral.toFixed(2)),
      totalEvaluaciones: evaluacionesArray.length,
      cursosImpartidos,
      totalGruposImpartidos,
      evaluacionesPorCurso: evaluacionesPorCurso
    }

    res.json(stats)
  } catch (error) {
    return sendError(res, error)
  }
})

// GET /teachers/teacher-courses - Obtener cursos del profesor

router.get('/period-stats', authenticateToken, async (req: any, res) => {
  try {
    const user = req.user
    const { period } = req.query

    if (user.tipo_usuario !== 'profesor') {
      throw forbidden('Solo los profesores pueden acceder a estas estadísticas')
    }

    // Obtener ID del profesor por usuario autenticado
    const profesor = await teachersRepository.findByUsuarioId(user.id)
    if (!profesor) {
      throw notFound('Profesor no encontrado')
    }

    // Rango de fechas del período
    let dateFilter: { gte?: string; lte?: string } = {}
    if (period) {
      const rango = rangoFechasPeriodo(String(period))
      if (rango) dateFilter = { gte: rango.start, lte: rango.end }
    }

    // Evaluaciones del período para este profesor
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
    const calificacionPromedio = totalEvaluaciones > 0
      ? ((evaluaciones as any[]) || []).reduce((sum: number, e: any) => sum + (e.calificacion_promedio || 0), 0) / totalEvaluaciones
      : 0

    // Obtener info de cursos via grupos
    const evalsArray: any[] = Array.isArray(evaluaciones) ? (evaluaciones as any[]) : []
    const gruposIds = Array.from(new Set(evalsArray.map((e: any) => e.grupo_id).filter(Boolean)))
    const periodGrupos = await analyticsRepository.getGruposByIds(gruposIds, 'id, curso_id')
    const grupoToCurso: any = {}
    ;(Array.isArray(periodGrupos) ? periodGrupos : []).forEach((g: any) => { grupoToCurso[g.id] = g.curso_id })

    const periodCursoIds = Array.from(new Set(((Array.isArray(periodGrupos) ? periodGrupos : []).map((g: any) => g.curso_id)).filter(Boolean)))
    let periodCursos: any[] = []
    try {
      periodCursos = await academicRepository.listCursosByIds(periodCursoIds, 'id, nombre, codigo')
    } catch {
      periodCursos = []
    }
    const periodCursoMap: any = {}
    const periodCursosArray: any[] = Array.isArray(periodCursos) ? periodCursos as any[] : []
    periodCursosArray.forEach((c: any) => { periodCursoMap[c.id] = c })

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
      evaluacionesPorCursoMap[key]._sum += (e.calificacion_promedio || 0)
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

    // Cursos impartidos activos (no necesariamente filtrados por periodo)
    let cursosImpartidos: any[] = []
    try {
      const asignaciones = await academicRepository.listAsignacionesByProfesorIds([profesor.id])
      cursosImpartidos = (asignaciones || []).filter((a: any) => a.activa === true)
    } catch {
      cursosImpartidos = []
    }

    const stats = {
      totalEvaluaciones,
      calificacionPromedio: Number(calificacionPromedio.toFixed(2)),
      totalCursos: cursosImpartidos?.length || 0,
      evaluacionesPorCurso,
      period: period || 'all'
    }
    return res.json(stats)
  } catch (error) {
    return sendError(res, error)
  }
})

// GET /teachers/period-category-stats?period=YYYY-X&courseId=NN
// Promedios por categoría a partir de respuestas_evaluacion

router.get('/period-category-stats', authenticateToken, async (req: any, res) => {
  try {
    const user = req.user
    const { period, courseId } = req.query

    if (user.tipo_usuario !== 'profesor') {
      throw forbidden('Solo los profesores pueden acceder a estas estadísticas')
    }

    // 1) Profesor
    const profesor = await teachersRepository.findByUsuarioId(user.id)
    if (!profesor) {
      throw notFound('Profesor no encontrado')
    }

    // 2) Rango de fechas del período
    let dateFilter: { gte?: string; lte?: string } = {}
    if (period) {
      const rango = rangoFechasPeriodo(String(period))
      if (rango) dateFilter = { gte: rango.start, lte: rango.end }
    }

    // 3) Evaluaciones del período del profesor
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

    let evalsArray: any[] = Array.isArray(evaluaciones) ? evaluaciones as any[] : []

    // 3.1) Si viene courseId, filtrar las evaluaciones por curso vía grupo_id -> grupos.curso_id
    if (courseId && evalsArray.length > 0) {
      const grupoIds = Array.from(new Set(evalsArray.map((e: any) => e.grupo_id).filter(Boolean)))
      const grupos = await analyticsRepository.getGruposByIds(grupoIds, 'id, curso_id')
      const grupoToCurso: any = {}
      ;(Array.isArray(grupos) ? grupos : []).forEach((g: any) => { grupoToCurso[g.id] = g.curso_id })
      evalsArray = evalsArray.filter((e: any) => String(grupoToCurso[e.grupo_id]) === String(courseId))
    }

    const evaluacionIds = Array.from(new Set(evalsArray.map((e: any) => e.id)))
    if (evaluacionIds.length === 0) {
      return res.json([])
    }

    // 4) Respuestas por evaluación (rating por pregunta)
    // Compatibilidad: prioriza respuesta_rating y, si falla por esquema antiguo, intenta con valor.
    let respuestas: any[] = []
    {
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
    }

    const preguntaIds = Array.from(new Set(((respuestas as any[]) || []).map((r: any) => r.pregunta_id)))
    if (preguntaIds.length === 0) {
      return res.json([])
    }

    // 5) Mapeo pregunta -> categoria_id
    let catPreg: any[]
    try {
      catPreg = await analyticsRepository.listPreguntasByIds(preguntaIds, 'id, categoria_id')
    } catch (catPregError) {
      throw internal('Error obteniendo categorías de preguntas', catPregError)
    }
    const preguntaToCategoria: any = {}
    ;(Array.isArray(catPreg) ? catPreg : []).forEach((cp: any) => { preguntaToCategoria[cp.id] = cp.categoria_id })

    // 6) Info de categorías
    const categoriaIds = Array.from(new Set(((catPreg as any[]) || []).map((cp: any) => cp.categoria_id).filter(Boolean)))
    let categorias: any[] = []
    try {
      categorias = await analyticsRepository.listCategoriasByIds(categoriaIds, 'id, nombre')
    } catch {
      categorias = []
    }
    const categoriaInfo: any = {}
    ;(Array.isArray(categorias) ? categorias : []).forEach((c: any) => { categoriaInfo[c.id] = c.nombre })

    // 7) Agregar promedios por categoría
    const acumulado: any = {}
    ;(Array.isArray(respuestas) ? respuestas as any[] : []).forEach((r: any) => {
      const catId = preguntaToCategoria[r.pregunta_id]
      if (!catId) return
      if (!acumulado[catId]) acumulado[catId] = { sum: 0, count: 0 }
      const rating = Number(r.respuesta_rating ?? r.valor ?? 0)
      if (!Number.isFinite(rating) || rating <= 0) return
      acumulado[catId].sum += rating
      acumulado[catId].count += 1
    })

    const result = Object.keys(acumulado).map((catId: any) => ({
      categoriaId: Number(catId),
      nombre: categoriaInfo[catId] || `Categoría ${catId}`,
      promedio: acumulado[catId].count > 0 ? Number((acumulado[catId].sum / acumulado[catId].count).toFixed(2)) : 0
    }))
    return res.json(result)
  } catch (error) {
    return sendError(res, error)
  }
})

// GET /teachers/debug-professors - Endpoint temporal para debug

export default router
