import { Router } from 'express'
import { z } from 'zod'
import { SupabaseDB } from '../../config/supabase-only'
import { authenticateToken } from '../../middleware/auth'
import jwt from 'jsonwebtoken'
import { EvaluationRequest, EvaluationResponse } from '../../types/evaluationTypes'

const router = Router()

// GET /teachers - Obtener profesores con sus cursos
router.get('/:profesorId/stats', authenticateToken, async (req: any, res) => {
  try {
    const { profesorId } = req.params
    const user = req.user

    console.log('🔍 Backend: Getting stats for profesorId:', profesorId);

    // Verificar que el profesor existe y está activo
    const { data: profesor, error: profesorError } = await SupabaseDB.supabaseAdmin
      .from('profesores')
      .select('id')
      .eq('id', profesorId)
      .eq('activo', true)
      .single()

    if (profesorError || !profesor) {
      console.log('❌ Backend: Profesor not found:', profesorError);
      return res.status(404).json({ error: 'Profesor no encontrado' })
    }

    console.log('✅ Backend: Profesor found:', profesor);

    // Obtener todas las evaluaciones del profesor (sin joins directos)
    const { data: evaluaciones, error: evaluacionesError } = await SupabaseDB.supabaseAdmin
      .from('evaluaciones')
      .select(`
        id,
        calificacion_promedio,
        fecha_creacion,
        grupo_id,
        estudiante_id
      `)
      .eq('profesor_id', profesorId)

    console.log('🔍 Backend: Evaluaciones found:', evaluaciones?.length || 0);

    if (evaluacionesError) {
      console.error('❌ Backend: Error consultando evaluaciones:', evaluacionesError)
      return res.status(500).json({ error: 'Error consultando evaluaciones', details: evaluacionesError })
    }

    // Calcular estadísticas
    const totalEvaluaciones = evaluaciones?.length || 0
    const calificacionPromedio = totalEvaluaciones > 0 
      ? evaluaciones.reduce((sum, evaluacion) => sum + (evaluacion.calificacion_promedio || 0), 0) / totalEvaluaciones
      : 0

    // Mapear grupo -> curso y obtener info de curso
    const evalsArrayStats: any[] = Array.isArray(evaluaciones) ? (evaluaciones as any[]) : []
    const gruposIdsStats = Array.from(new Set(evalsArrayStats.map((e: any) => e.grupo_id).filter(Boolean)))
    const { data: gruposStats } = await SupabaseDB.supabaseAdmin
      .from('grupos')
      .select('id, curso_id, numero_grupo')
      .in('id', gruposIdsStats.length ? gruposIdsStats : [-1])
    const grupoToCursoStats: any = {}
    ;(Array.isArray(gruposStats) ? gruposStats : []).forEach((g: any) => { grupoToCursoStats[g.id] = g.curso_id })

    const cursoIdsStats = Array.from(new Set(((Array.isArray(gruposStats) ? gruposStats : []).map((g: any) => g.curso_id)).filter(Boolean)))
    const { data: cursosStats } = await SupabaseDB.supabaseAdmin
      .from('cursos')
      .select('id,nombre,codigo')
      .in('id', cursoIdsStats.length ? cursoIdsStats : [-1])
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
      const suma = curso.evaluaciones.reduce((sum: number, evaluacion: any) => sum + (evaluacion.calificacion_promedio || 0), 0)
      curso.promedio = curso.total > 0 ? Number((suma / curso.total).toFixed(2)) : 0
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

    console.log('✅ Backend: Stats calculated:', stats);
    res.json(stats)
  } catch (error) {
    console.error('❌ Backend: Error al obtener estadísticas del profesor:', error)
    console.error('❌ Backend: Error stack:', (error as any)?.stack)
    res.status(500).json({ error: 'Error interno del servidor', details: (error as any)?.message || String(error) })
  }
})

// GET /teachers/:profesorId/stats/historical - Obtener estadísticas históricas del profesor

router.get('/:profesorId/stats/historical', authenticateToken, async (req: any, res) => {
  try {
    const { profesorId } = req.params
    const { period } = req.query // Ejemplo: ?period=2023-1, 2023-2, 2024-1, etc.
    const user = req.user

    console.log('🔍 Backend: Getting historical stats for profesorId:', profesorId, 'period:', period);

    // Debug: Verificar si el profesor existe (con o sin filtro activo)
    const { data: profesorDebug, error: debugError } = await SupabaseDB.supabaseAdmin
      .from('profesores')
      .select('id, activo, usuario_id')
      .eq('id', profesorId)
      .single()

    console.log('🔍 Backend: Debug profesor query result:', { profesorDebug, debugError });

    // Verificar que el profesor existe
    const { data: profesor, error: profesorError } = await SupabaseDB.supabaseAdmin
      .from('profesores')
      .select('id')
      .eq('id', profesorId)
      .single()

    if (profesorError || !profesor) {
      console.log('❌ Backend: Profesor not found, returning mock data:', profesorError);
      
      // Construir filtro de fecha para los datos mock
      let mockDateFilter: { gte?: string; lte?: string } = {}
      if (period) {
        const [year, semester] = period.split('-')
        const startDate = `${year}-${semester === '1' ? '01' : '07'}-01`
        const endDate = `${year}-${semester === '1' ? '06' : '12'}-31`
        
        mockDateFilter = {
          gte: startDate,
          lte: endDate
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
          debugError: debugError 
        }
      };
      
      console.log('✅ Backend: Returning mock historical stats:', mockHistoricalStats);
      return res.json(mockHistoricalStats);
    }

    console.log('✅ Backend: Profesor found:', profesor);

    // Construir filtro de fecha basado en el período
    let dateFilter: { gte?: string; lte?: string } = {}
    if (period) {
      const [year, semester] = period.split('-')
      const startDate = `${year}-${semester === '1' ? '01' : '07'}-01`
      const endDate = `${year}-${semester === '1' ? '06-30' : '12-31'}`
      
      dateFilter = {
        gte: startDate,
        lte: endDate
      }
      console.log('🔍 Backend: Date filter:', dateFilter);
    }

    // Obtener evaluaciones del profesor con filtro de período
    const { data: evaluaciones, error: evaluacionesError } = await SupabaseDB.supabaseAdmin
      .from('evaluaciones')
      .select(`
        id,
        calificacion_promedio,
        fecha_creacion,
        grupo_id,
        estudiante_id
      `)
      .eq('profesor_id', profesorId)
      .gte('fecha_creacion', dateFilter.gte || '2020-01-01')
      .lte('fecha_creacion', dateFilter.lte || '2030-12-31')

    console.log('🔍 Backend: Evaluaciones found for period:', evaluaciones?.length || 0);

    if (evaluacionesError) {
      console.error('❌ Backend: Error consultando evaluaciones históricas:', evaluacionesError)
      return res.status(500).json({ error: 'Error consultando evaluaciones históricas', details: evaluacionesError })
    }

    // Calcular estadísticas históricas
    const totalEvaluaciones = evaluaciones?.length || 0
    const calificacionPromedio = totalEvaluaciones > 0 
      ? evaluaciones.reduce((sum, evaluacion) => sum + (evaluacion.calificacion_promedio || 0), 0) / totalEvaluaciones
      : 0

    // Obtener estudiantes únicos que han evaluado en este período
    const estudiantesUnicos = new Set(evaluaciones?.map(e => e.estudiante_id) || [])
    const totalEstudiantes = estudiantesUnicos.size

    // Obtener evaluaciones por curso para este período
    // Mapear grupo_id -> curso_id y luego curso info
    const gruposIds = Array.from(new Set(((evaluaciones as any[]) || []).map((e: any) => e.grupo_id).filter(Boolean)))
    const { data: gruposInfo } = await SupabaseDB.supabaseAdmin
      .from('grupos')
      .select('id, curso_id, numero_grupo')
      .in('id', gruposIds.length ? gruposIds : [-1])

    const grupoIdToCursoId: any = {}
    ;(Array.isArray(gruposInfo) ? gruposInfo : []).forEach((g: any) => { grupoIdToCursoId[g.id] = g.curso_id })

    const cursoIds = Array.from(new Set(((Array.isArray(gruposInfo) ? gruposInfo : []).map((g: any) => g.curso_id)).filter(Boolean)))
    const { data: cursosInfo } = await SupabaseDB.supabaseAdmin
      .from('cursos')
      .select('id,nombre,codigo')
      .in('id', cursoIds.length ? cursoIds : [-1])

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
      const suma = curso.evaluaciones.reduce((sum: number, evaluacion: any) => sum + (evaluacion.calificacion_promedio || 0), 0)
      curso.promedio = curso.total > 0 ? Number((suma / curso.total).toFixed(2)) : 0
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

    console.log('✅ Backend: Historical stats calculated:', historicalStats);
    res.json(historicalStats)
  } catch (error) {
    console.error('❌ Backend: Error al obtener estadísticas históricas del profesor:', error)
    console.error('❌ Backend: Error stack:', (error as any)?.stack)
    res.status(500).json({ error: 'Error interno del servidor', details: (error as any)?.message || String(error) })
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
    
    console.log(`🔍 Obteniendo calificación promedio para profesor ${professorId} en curso ${courseId}`)
    
    // Buscar evaluaciones del profesor en el curso específico
    const { data: evaluaciones, error: evalError } = await SupabaseDB.supabaseAdmin
      .from('evaluaciones')
      .select(`
        id,
        respuestas_evaluacion (
          pregunta_id,
          respuesta,
          preguntas (
            tipo_pregunta
          )
        )
      `)
      .eq('profesor_id', professorId)
      .eq('curso_id', courseId)
      .eq('estado', 'completada')
    
    if (evalError) {
      console.error('❌ Error obteniendo evaluaciones:', evalError)
      return res.status(500).json({ error: 'Error obteniendo evaluaciones' })
    }
    
    console.log(`🔍 Evaluaciones encontradas: ${evaluaciones?.length || 0}`)
    
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
    
    evaluaciones.forEach(evaluacion => {
      evaluacion.respuestas_evaluacion?.forEach((respuesta: any) => {
        if (respuesta.preguntas?.tipo_pregunta === 'likert' && !isNaN(parseInt(respuesta.respuesta))) {
          sumaTotal += parseInt(respuesta.respuesta)
          cantidadRespuestas++
        }
      })
    })
    
    const promedio = cantidadRespuestas > 0 ? (sumaTotal / cantidadRespuestas).toFixed(2) : null
    
    console.log(`✅ Calificación promedio calculada: ${promedio} (${cantidadRespuestas} respuestas)`)
    
    res.json({
      promedio: promedio ? parseFloat(promedio) : null,
      total_respuestas: cantidadRespuestas,
      total_evaluaciones: evaluaciones.length
    })
    
  } catch (error) {
    console.error('❌ Error en /teachers/course-rating:', error)
    res.status(500).json({ error: 'Error interno del servidor' })
  }
})

// GET /teachers/careers - Obtener carreras disponibles (para coordinadores)

router.get('/career-results/all', authenticateToken, async (req: any, res) => {
  try {
    const user = req.user

    // Verificar que el usuario sea decano
    if (!user.roles?.includes('decano')) {
      return res.status(403).json({ error: 'Acceso denegado. Solo decanos pueden acceder a estos resultados.' })
    }

    console.log('🔍 Obteniendo resultados para todas las carreras...')

    // Obtener todas las carreras activas (excluyendo tronco común)
    const { data: carreras, error: carrerasError } = await SupabaseDB.supabaseAdmin
      .from('carreras')
      .select(`
        id,
        nombre,
        codigo,
        activo
      `)
      .eq('activa', true)
      .not('nombre', 'ilike', '%tronco común%')
      .not('nombre', 'ilike', '%tronco comun%')
      .eq('activo', true)

    if (carrerasError) {
      console.error('❌ Error obteniendo carreras:', carrerasError)
      return res.status(500).json({ error: 'Error obteniendo carreras', details: carrerasError })
    }

    // Obtener estadísticas generales de evaluaciones
    const { data: evaluacionesGenerales, error: evalError } = await SupabaseDB.supabaseAdmin
      .from('evaluaciones')
      .select(`
        id,
        calificacion_promedio,
        fecha_creacion,
        grupos:grupos(
          curso_id,
          cursos:cursos(
            carrera_id,
            carreras:carreras(
              id,
              nombre
            )
          )
        )
      `)

    if (evalError) {
      console.error('❌ Error obteniendo evaluaciones generales:', evalError)
      return res.status(500).json({ error: 'Error obteniendo evaluaciones', details: evalError })
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

    console.log('✅ Resultados globales generados:', resultado.estadisticas_generales)
    res.json(resultado)

  } catch (error) {
    console.error('❌ Error en /teachers/career-results/all:', error)
    res.status(500).json({ error: 'Error interno del servidor' })
  }
})

// GET /teachers/career-results/:careerId - Obtener resultados para una carrera específica

router.get('/career-results/:careerId', authenticateToken, async (req: any, res) => {
  try {
    const user = req.user
    const { careerId } = req.params

    // Verificar que el usuario sea decano
    if (!user.roles?.includes('decano')) {
      return res.status(403).json({ error: 'Acceso denegado. Solo decanos pueden acceder a estos resultados.' })
    }

    console.log(`🔍 Obteniendo resultados para carrera ${careerId}...`)

    // Obtener información de la carrera
    const { data: carrera, error: carreraError } = await SupabaseDB.supabaseAdmin
      .from('carreras')
      .select(`
        id,
        nombre,
        codigo,
            activa,
        descripcion
      `)
      .eq('id', careerId)
      .single()

    if (carreraError) {
      console.error('❌ Error obteniendo carrera:', carreraError)
      return res.status(404).json({ error: 'Carrera no encontrada', details: carreraError })
    }

    // Obtener profesores de la carrera
    const { data: profesores, error: profesoresError } = await SupabaseDB.supabaseAdmin
      .from('profesores')
      .select(`
        id,
        usuario_id,
        codigo_profesor,
        activa,
        carrera_id,
        usuarios:usuarios(
          id,
          nombre,
          apellido,
          email
        )
      `)
      .eq('activo', true)

    if (profesoresError) {
      console.error('❌ Error obteniendo profesores:', profesoresError)
      return res.status(500).json({ error: 'Error obteniendo profesores', details: profesoresError })
    }

    // Obtener evaluaciones de la carrera
    const { data: evaluaciones, error: evaluacionesError } = await SupabaseDB.supabaseAdmin
      .from('evaluaciones')
      .select(`
        id,
        calificacion_promedio,
        fecha_creacion,
        comentarios,
        profesor_id,
        grupos:grupos(
          curso_id,
          cursos:cursos(
            id,
            nombre,
            codigo,
            carrera_id,
            carreras:carreras(
              id,
              nombre
            )
          )
        )
      `)
      .eq('grupos.cursos.carrera_id', careerId)

    if (evaluacionesError) {
      console.error('❌ Error obteniendo evaluaciones:', evaluacionesError)
      return res.status(500).json({ error: 'Error obteniendo evaluaciones', details: evaluacionesError })
    }

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

    console.log(`✅ Resultados de carrera ${carrera.nombre} generados:`, resultado.estadisticas_carrera)
    res.json(resultado)

  } catch (error) {
    console.error('❌ Error en /teachers/career-results/:careerId:', error)
    res.status(500).json({ error: 'Error interno del servidor' })
  }
})

// GET /teachers/student-stats - Obtener estadísticas del estudiante

router.get('/student-stats', authenticateToken, async (req: any, res) => {
  try {
    const user = req.user
    
    console.log('🔍 Backend: Getting student stats for user:', user.id);

    // Verificar que el usuario es un estudiante
    if (user.tipo_usuario !== 'estudiante') {
      return res.status(403).json({ error: 'Solo los estudiantes pueden acceder a estas estadísticas' })
    }

    // Obtener el ID del estudiante (si no existe, devolver datos en cero para que el dashboard cargue)
    const { data: estudiante, error: estudianteError } = await SupabaseDB.supabaseAdmin
      .from('estudiantes')
      .select('id')
      .eq('usuario_id', user.id)
      .single()

    if (estudianteError || !estudiante) {
      console.log('⚠️ Backend: No row in estudiantes for user, returning zero stats:', user.id);
      return res.json({
        evaluacionesCompletadas: 0,
        evaluacionesPendientes: 0,
        materiasMatriculadas: 0,
        promedioGeneral: 0,
        progresoGeneral: 0
      });
    }

    console.log('✅ Backend: Estudiante found:', estudiante);

    // Obtener evaluaciones completadas
    const { data: evaluacionesCompletadas, error: completadasError } = await SupabaseDB.supabaseAdmin
      .from('evaluaciones')
      .select('id, calificacion_promedio')
      .eq('estudiante_id', estudiante.id)
      .eq('completada', true)

    if (completadasError) {
      console.log('❌ Backend: Error getting completed evaluations:', completadasError);
    }

    // Obtener materias matriculadas (grupos donde está inscrito)
    const { data: materiasMatriculadas, error: materiasError } = await SupabaseDB.supabaseAdmin
      .from('inscripciones')
      .select(`
        id,
        grupo:grupos(
          id,
          numero_grupo,
          curso:cursos(
            id,
            nombre,
            codigo
          )
        )
      `)
      .eq('estudiante_id', estudiante.id)
      .eq('activa', true)

    if (materiasError) {
      console.log('❌ Backend: Error getting enrolled subjects:', materiasError);
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

    console.log('✅ Backend: Student stats calculated:', {
      materiasMatriculadasCount,
      evaluacionesCompletadasCount,
      evaluacionesPendientesCount,
      promedioGeneral,
      progresoGeneral: materiasMatriculadasCount > 0 
        ? Math.round((evaluacionesCompletadasCount / materiasMatriculadasCount) * 100)
        : 0,
      stats
    });

    res.json(stats)
  } catch (error) {
    console.error('❌ Backend: Error getting student stats:', error)
    res.status(500).json({ error: 'Error interno del servidor', details: (error as any)?.message || String(error) })
  }
})

// GET /teachers/student-enrolled-subjects - Obtener materias matriculadas del estudiante

router.get('/teacher-stats/:teacherId', authenticateToken, async (req: any, res) => {
  try {
    const user = req.user
    const { teacherId } = req.params
    
    console.log('🔍 Backend: Getting teacher stats for teacher ID:', teacherId);

    // Verificar que el usuario es un profesor
    if (user.tipo_usuario !== 'profesor') {
      return res.status(403).json({ error: 'Solo los profesores pueden acceder a estas estadísticas' })
    }

    // Obtener el ID del profesor
    const { data: profesor, error: profesorError } = await SupabaseDB.supabaseAdmin
      .from('profesores')
      .select('id')
      .eq('id', teacherId)
      .single()

    if (profesorError || !profesor) {
      console.log('❌ Backend: Error finding teacher:', profesorError);
      return res.status(404).json({ error: 'Profesor no encontrado' })
    }

    console.log('✅ Backend: Profesor found:', profesor);

    // Obtener evaluaciones completadas del profesor
    const { data: evaluacionesCompletadas, error: completadasError } = await SupabaseDB.supabaseAdmin
      .from('evaluaciones')
      .select('id, calificacion_promedio, grupo_id')
      .eq('profesor_id', profesor.id)
      .eq('completada', true)

    if (completadasError) {
      console.log('❌ Backend: Error getting completed evaluations:', completadasError);
      return res.status(500).json({ error: 'Error obteniendo evaluaciones completadas', details: completadasError.message })
    }

    const evaluacionesArray = Array.isArray(evaluacionesCompletadas) ? evaluacionesCompletadas : []
    const grupoIds = Array.from(new Set(evaluacionesArray.map((e: any) => e.grupo_id).filter(Boolean)))

    // Resolver curso por cada grupo evaluado para agrupar correctamente por curso
    const { data: gruposEvaluados, error: gruposError } = await SupabaseDB.supabaseAdmin
      .from('grupos')
      .select('id, curso_id')
      .in('id', grupoIds.length ? grupoIds : [-1])

    if (gruposError) {
      console.log('❌ Backend: Error getting groups for evaluations:', gruposError);
      return res.status(500).json({ error: 'Error obteniendo grupos de evaluaciones', details: gruposError.message })
    }

    const grupoToCurso = new Map<any, any>()
    ;(gruposEvaluados || []).forEach((g: any) => {
      grupoToCurso.set(g.id, g.curso_id)
    })

    const cursoIdsFromEvals = Array.from(
      new Set((gruposEvaluados || []).map((g: any) => g.curso_id).filter(Boolean))
    )

    // Obtener cursos activos impartidos por el profesor para la card de cursos
    const { data: asignacionesActivas, error: cursosError } = await SupabaseDB.supabaseAdmin
      .from('asignaciones_profesor')
      .select('curso_id, grupo_id')
      .eq('profesor_id', profesor.id)
      // Incluye asignaciones activas y también registros donde "activa" viene nulo
      // para no perder grupos/cursos válidos por inconsistencias históricas.
      .neq('activa', false)

    if (cursosError) {
      console.log('❌ Backend: Error getting teacher courses:', cursosError);
      return res.status(500).json({ error: 'Error obteniendo cursos del profesor', details: cursosError.message })
    }

    const cursosActivosSet = new Set((asignacionesActivas || []).map((a: any) => a.curso_id).filter(Boolean))
    const gruposActivosSet = new Set((asignacionesActivas || []).map((a: any) => a.grupo_id).filter(Boolean))

    const cursoIdsToFetch = Array.from(new Set([...cursoIdsFromEvals, ...Array.from(cursosActivosSet)]))
    const { data: cursosInfo, error: cursosInfoError } = await SupabaseDB.supabaseAdmin
      .from('cursos')
      .select('id, nombre, codigo')
      .in('id', cursoIdsToFetch.length ? cursoIdsToFetch : [-1])

    if (cursosInfoError) {
      console.log('❌ Backend: Error getting courses info:', cursosInfoError);
      return res.status(500).json({ error: 'Error obteniendo información de cursos', details: cursosInfoError.message })
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

    console.log('✅ Backend: Teacher stats calculated:', stats);

    res.json(stats)
  } catch (error) {
    console.error('❌ Backend: Error getting teacher stats:', error)
    res.status(500).json({ error: 'Error interno del servidor', details: (error as any)?.message || String(error) })
  }
})

// GET /teachers/teacher-courses - Obtener cursos del profesor

router.get('/period-stats', authenticateToken, async (req: any, res) => {
  try {
    const user = req.user
    const { period } = req.query

    if (user.tipo_usuario !== 'profesor') {
      return res.status(403).json({ error: 'Solo los profesores pueden acceder a estas estadísticas' })
    }

    // Obtener ID del profesor por usuario autenticado
    const { data: profesor, error: profesorError } = await SupabaseDB.supabaseAdmin
      .from('profesores')
      .select('id')
      .eq('usuario_id', user.id)
      .single()

    if (profesorError || !profesor) {
      return res.status(404).json({ error: 'Profesor no encontrado' })
    }

    // Rango de fechas del período
    let dateFilter: { gte?: string; lte?: string } = {}
    if (period) {
      const [year, semester] = String(period).split('-')
      const startDate = `${year}-${semester === '1' ? '01' : '07'}-01`
      const endDate = `${year}-${semester === '1' ? '06-30' : '12-31'}`
      dateFilter = { gte: startDate, lte: endDate }
    }

    // Evaluaciones del período para este profesor
    const { data: evaluaciones, error: evaluacionesError } = await SupabaseDB.supabaseAdmin
      .from('evaluaciones')
      .select('id, calificacion_promedio, fecha_creacion, grupo_id')
      .eq('profesor_id', profesor.id)
      .eq('completada', true)
      .gte('fecha_creacion', dateFilter.gte || '2020-01-01')
      .lte('fecha_creacion', dateFilter.lte || '2030-12-31')

    if (evaluacionesError) {
      return res.status(500).json({ error: 'Error consultando evaluaciones del período', details: evaluacionesError })
    }

    const totalEvaluaciones = evaluaciones?.length || 0
    const calificacionPromedio = totalEvaluaciones > 0
      ? ((evaluaciones as any[]) || []).reduce((sum: number, e: any) => sum + (e.calificacion_promedio || 0), 0) / totalEvaluaciones
      : 0

    // Obtener info de cursos via grupos
    const evalsArray: any[] = Array.isArray(evaluaciones) ? (evaluaciones as any[]) : []
    const gruposIds = Array.from(new Set(evalsArray.map((e: any) => e.grupo_id).filter(Boolean)))
    const { data: periodGrupos } = await SupabaseDB.supabaseAdmin
      .from('grupos')
      .select('id, curso_id')
      .in('id', gruposIds.length ? gruposIds : [-1])
    const grupoToCurso: any = {}
    ;(Array.isArray(periodGrupos) ? periodGrupos : []).forEach((g: any) => { grupoToCurso[g.id] = g.curso_id })

    const periodCursoIds = Array.from(new Set(((Array.isArray(periodGrupos) ? periodGrupos : []).map((g: any) => g.curso_id)).filter(Boolean)))
    const { data: periodCursos } = await SupabaseDB.supabaseAdmin
      .from('cursos')
      .select('id,nombre,codigo')
      .in('id', periodCursoIds.length ? periodCursoIds : [-1])
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
    const { data: cursosImpartidos } = await SupabaseDB.supabaseAdmin
      .from('asignaciones_profesor')
      .select('id')
      .eq('profesor_id', profesor.id)
      .eq('activa', true)

    const stats = {
      totalEvaluaciones,
      calificacionPromedio: Number(calificacionPromedio.toFixed(2)),
      totalCursos: cursosImpartidos?.length || 0,
      evaluacionesPorCurso,
      period: period || 'all'
    }

    return res.json(stats)
  } catch (error) {
    return res.status(500).json({ error: 'Error interno del servidor', details: (error as any)?.message || String(error) })
  }
})

// GET /teachers/period-category-stats?period=YYYY-X&courseId=NN
// Promedios por categoría a partir de respuestas_evaluacion

router.get('/period-category-stats', authenticateToken, async (req: any, res) => {
  try {
    const user = req.user
    const { period, courseId } = req.query

    if (user.tipo_usuario !== 'profesor') {
      return res.status(403).json({ error: 'Solo los profesores pueden acceder a estas estadísticas' })
    }

    // 1) Profesor
    const { data: profesor, error: profesorError } = await SupabaseDB.supabaseAdmin
      .from('profesores')
      .select('id')
      .eq('usuario_id', user.id)
      .single()
    if (profesorError || !profesor) {
      return res.status(404).json({ error: 'Profesor no encontrado' })
    }

    // 2) Rango de fechas del período
    let dateFilter: { gte?: string; lte?: string } = {}
    if (period) {
      const [year, semester] = String(period).split('-')
      const startDate = `${year}-${semester === '1' ? '01' : '07'}-01`
      const endDate = `${year}-${semester === '1' ? '06-30' : '12-31'}`
      dateFilter = { gte: startDate, lte: endDate }
    }

    // 3) Evaluaciones del período del profesor
    const { data: evaluaciones, error: evalError } = await SupabaseDB.supabaseAdmin
      .from('evaluaciones')
      .select('id, grupo_id, fecha_creacion')
      .eq('profesor_id', profesor.id)
      .eq('completada', true)
      .gte('fecha_creacion', dateFilter.gte || '2020-01-01')
      .lte('fecha_creacion', dateFilter.lte || '2030-12-31')
    if (evalError) {
      return res.status(500).json({ error: 'Error obteniendo evaluaciones', details: evalError })
    }

    let evalsArray: any[] = Array.isArray(evaluaciones) ? evaluaciones as any[] : []

    // 3.1) Si viene courseId, filtrar las evaluaciones por curso vía grupo_id -> grupos.curso_id
    if (courseId && evalsArray.length > 0) {
      const grupoIds = Array.from(new Set(evalsArray.map((e: any) => e.grupo_id).filter(Boolean)))
      const { data: grupos } = await SupabaseDB.supabaseAdmin
        .from('grupos')
        .select('id, curso_id')
        .in('id', grupoIds.length ? grupoIds : [-1])
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
      const { data, error } = await SupabaseDB.supabaseAdmin
        .from('respuestas_evaluacion')
        .select('evaluacion_id, pregunta_id, respuesta_rating')
        .in('evaluacion_id', evaluacionIds)
      if (!error) {
        respuestas = Array.isArray(data) ? data : []
      } else {
        const fallback = await SupabaseDB.supabaseAdmin
          .from('respuestas_evaluacion')
          .select('evaluacion_id, pregunta_id, valor')
          .in('evaluacion_id', evaluacionIds)
        if (fallback.error) {
          return res.status(500).json({ error: 'Error obteniendo respuestas', details: fallback.error })
        }
        respuestas = Array.isArray(fallback.data) ? fallback.data : []
      }
    }

    const preguntaIds = Array.from(new Set(((respuestas as any[]) || []).map((r: any) => r.pregunta_id)))
    if (preguntaIds.length === 0) {
      return res.json([])
    }

    // 5) Mapeo pregunta -> categoria_id
    const { data: catPreg, error: catPregError } = await SupabaseDB.supabaseAdmin
      .from('preguntas_evaluacion')
      .select('id, categoria_id')
      .in('id', preguntaIds)
    if (catPregError) {
      return res.status(500).json({ error: 'Error obteniendo categorías de preguntas', details: catPregError })
    }
    const preguntaToCategoria: any = {}
    ;(Array.isArray(catPreg) ? catPreg : []).forEach((cp: any) => { preguntaToCategoria[cp.id] = cp.categoria_id })

    // 6) Info de categorías
    const categoriaIds = Array.from(new Set(((catPreg as any[]) || []).map((cp: any) => cp.categoria_id).filter(Boolean)))
    const { data: categorias } = await SupabaseDB.supabaseAdmin
      .from('categorias_pregunta')
      .select('id, nombre')
      .in('id', categoriaIds.length ? categoriaIds : [-1])
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
    return res.status(500).json({ error: 'Error interno del servidor', details: (error as any)?.message || String(error) })
  }
})

// GET /teachers/debug-professors - Endpoint temporal para debug

export default router
