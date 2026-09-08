import { Router } from 'express'
import { z } from 'zod'
import { authenticateToken } from '../../middleware/auth'
import jwt from 'jsonwebtoken'
import { teachersRepository } from './teachers.repository'
import { academicRepository } from './academic.repository'
import { analyticsRepository } from '../analytics/analytics.repository'
import { evaluationsRepository } from '../evaluations/evaluations.repository'
import {
  badRequest,
  conflict,
  forbidden,
  internal,
  notFound,
  sendError,
} from '../../shared/errors'

const router = Router()

// ID de profesor: en muchas BD es entero (serial); en otras puede ser UUID.
const teacherIdSchema = z.union([
  z.string().uuid('ID de profesor inválido'),
  z
    .string()
    .regex(/^\d+$/, 'ID de profesor inválido')
    .refine((s) => Number.parseInt(s, 10) > 0, 'ID de profesor inválido'),
])

const evaluationSchema = z.object({
  teacherId: teacherIdSchema,
  courseId: z.union([
    z.string().uuid('ID de curso inválido (UUID)'),
    z
      .string()
      .transform((val) => Number.parseInt(val, 10))
      .pipe(z.number().int().positive('ID de curso inválido (número)')),
  ]),
  groupId: z.string().optional(),
  answers: z
    .array(
      z.object({
        questionId: z.number().int().positive('ID de pregunta inválido'),
        rating: z.number().int().min(1).max(5).nullable().optional(),
        textAnswer: z.string().nullable().optional(),
        selectedOption: z.string().nullable().optional(),
      })
    )
    .min(1, 'Debe haber al menos una respuesta'),
  overallRating: z.number().min(1).max(5, 'Calificación promedio debe estar entre 1 y 5'),
  comments: z.string().optional(),
})

// GET /teachers - Obtener profesores con sus cursos
router.get('/', authenticateToken, async (req: any, res) => {
  try {
    const user = req.user

    // Si es estudiante, limitar a sus inscripciones activas
    let gruposDeEstudiante: any[] = []
    let profesorIdsFiltro: string[] | null = null
    if (user?.tipo_usuario === 'estudiante') {
      // Mapear usuario -> estudiante.id
      const estudiante = await academicRepository.findEstudianteByUsuarioId(user.id)
      if (!estudiante) {
        return res.json([])
      }

      let inscripciones
      try {
        inscripciones = await academicRepository.listInscripcionesActivas(estudiante.id)
      } catch (inscError) {
        throw internal('DB inscripciones', inscError)
      }

      const grupoIds = [...new Set((inscripciones || []).map((i: any) => i.grupo_id).filter(Boolean))]
      if (grupoIds.length > 0) {
        // Algunos esquemas usan 'asignacion_profesor_id' en lugar de 'profesor_id'
        // Algunos esquemas no tienen profesor_id/asignacion_profesor_id en grupos. Intentar con ambos y hacer fallback.
        let gruposDeConsulta: any[] = []
        try {
          gruposDeConsulta = await academicRepository.listGruposByIdsFlexible(grupoIds)
        } catch (gruposError) {
          throw internal('DB grupos', gruposError)
        }
        gruposDeEstudiante = gruposDeConsulta || []

        // Si los grupos no traen profesor, resolver mediante asignaciones por grupo
        const necesitaResolverProfesor = gruposDeEstudiante.some((g: any) => !g.profesor_id)
        if (necesitaResolverProfesor && grupoIds.length > 0) {
          try {
            const asignacionesPorGrupo = await academicRepository.listAsignacionesByGrupoIds(grupoIds)
            if (asignacionesPorGrupo.length > 0) {
              const asigByGrupo = new Map(asignacionesPorGrupo.map((a: any) => [a.grupo_id, a]))
              gruposDeEstudiante = gruposDeEstudiante.map((g: any) => {
                const a = asigByGrupo.get(g.id)
                if (a) {
                  return { ...g, profesor_id: a.profesor_id, curso_id: g.curso_id || a.curso_id }
                }
                return g
              })
            }
          } catch {
            // Si falla el fallback de asignaciones, continuar sin resolver profesor
          }
        }

        // Si no hay profesor_id directo, resolverlo via asignaciones_profesor
        const asignacionIds = [...new Set(gruposDeEstudiante.map((g: any) => g.asignacion_profesor_id).filter(Boolean))]
        let asignacionById = new Map<string, any>()
        if (asignacionIds.length > 0) {
          try {
            const asigns = await academicRepository.listAsignacionesByIds(asignacionIds)
            asignacionById = new Map((asigns || []).map((a: any) => [a.id, a]))
          } catch (asgErr) {
            throw internal('DB asignaciones_profesor', asgErr)
          }
        }

        gruposDeEstudiante = gruposDeEstudiante.map((g: any) => {
          if (!g.profesor_id && g.asignacion_profesor_id) {
            const a = asignacionById.get(g.asignacion_profesor_id)
            if (a) {
              return { ...g, profesor_id: a.profesor_id, curso_id: g.curso_id || a.curso_id }
            }
          }
          return g
        })

        profesorIdsFiltro = [...new Set(gruposDeEstudiante.map((g: any) => g.profesor_id).filter(Boolean))]
      } else {
        // Sin inscripciones => devolver lista vacía
        return res.json([])
      }
    }
    // 1) Traer profesores + usuario relacionado (sin joins adicionales)
    let profesores: any[] = []
    try {
      profesores = await teachersRepository.listActiveWithUsuario(
        profesorIdsFiltro && profesorIdsFiltro.length > 0 ? profesorIdsFiltro : undefined
      )
    } catch (profesoresError) {
      throw internal('DB profesores', profesoresError)
    }

    const profesorIds = (profesores || []).map((p: any) => p.id)

    // 2) Traer asignaciones y cursos por separado y combinarlos
    let asignaciones: any[] = []
    try {
      asignaciones = await academicRepository.listAsignacionesByProfesorIds(profesorIds)
    } catch (asignacionesError) {
      throw internal('DB asignaciones', asignacionesError)
    }

    // Normalizar posibles variantes de nombres de columnas
    asignaciones = (asignaciones || []).map((a: any) => ({
      ...a,
      profesor_id: a.profesor_id ?? a.docente_id ?? a.teacher_id ?? a.profesor ?? null,
      curso_id: Number(a.curso_id ?? a.id_curso ?? a.course_id ?? a.curso ?? null)
    }))

    // Traer grupos para mapearlos por curso y profesor (para usuarios no-estudiante)
    const grupoIdsAsignados = [...new Set((asignaciones || []).map((a: any) => a.grupo_id).filter(Boolean))]
    let gruposPorAsignaciones: any[] = []
    if (grupoIdsAsignados.length > 0) {
      try {
        gruposPorAsignaciones = await academicRepository.listGruposByIds(
          grupoIdsAsignados,
          'id, curso_id, numero_grupo, horario, aula'
        )
      } catch {
        gruposPorAsignaciones = []
      }
    }

    let cursos: any[] = []
    let tieneCarreraId = true

    // 3) Traer carreras para mapear departamento (según carrera_id)
    let carreras: any[] = []
    if (tieneCarreraId) {
      const carreraIds = [...new Set(cursos.map((c: any) => c.carrera_id).filter((id: any) => id !== null && id !== undefined))]
      if (carreraIds.length > 0) {
        try {
          carreras = await academicRepository.listCarrerasByIds(carreraIds)
        } catch (carrerasError) {
          throw internal('DB carreras', carrerasError)
        }
      }
    }

    const cursoIds = [...new Set((asignaciones || []).map((a: any) => a.curso_id).filter((id: any) => id !== null && id !== undefined))]

    if (cursoIds.length > 0 && cursos.length === 0) {
      // Cargar cursos solo con las columnas seguras si aún no se han cargado
      try {
        cursos = await academicRepository.listCursosByIds(cursoIds, 'id, nombre, codigo, creditos, descripcion')
      } catch (e) {
      }
    }
    const cursoById = new Map((cursos || []).map((c: any) => [c.id, c]))
    const carreraById = new Map((carreras || []).map((c: any) => [c.id, c]))
    const asignacionesByProfesor = new Map<string, any[]>()
    // Índice para resolver curso por grupo
    const cursoIdByGrupoId = new Map<number, number>()
    gruposPorAsignaciones.forEach((g: any) => {
      if (g && g.id != null) cursoIdByGrupoId.set(Number(g.id), Number(g.curso_id))
    })

    ;(asignaciones || []).forEach((a: any) => {
      // Completar curso_id desde grupo si no viene en la fila
      const resolvedCursoId = Number(a.curso_id ?? cursoIdByGrupoId.get(Number(a.grupo_id)))
      a.curso_id = Number.isFinite(resolvedCursoId) ? resolvedCursoId : undefined
      const list = asignacionesByProfesor.get(a.profesor_id) || []
      list.push(a)
      asignacionesByProfesor.set(a.profesor_id, list)
    })

    // Indexar grupos por profesor y curso usando asignaciones
    const gruposByProfesorCurso = new Map<string, any[]>()
    asignaciones.forEach((a: any) => {
      const grupo = gruposPorAsignaciones.find((g: any) => g.id === a.grupo_id)
      if (grupo) {
        const key = `${a.profesor_id}:${Number(a.curso_id)}`
        const list = gruposByProfesorCurso.get(key) || []
        list.push(grupo)
        gruposByProfesorCurso.set(key, list)
      }
    })

    const teachers = (profesores || []).map((profesor: any) => {
      const nombre = profesor.usuario?.nombre || ''
      const apellido = profesor.usuario?.apellido || ''
      const email = profesor.usuario?.email || ''
      const asignacionesDeProfesor = asignacionesByProfesor.get(profesor.id) || []

      const courses = asignacionesDeProfesor.map((a: any) => {
        const c = cursoById.get(a.curso_id)
        return c
          ? {
              id: c.id,
              name: c.nombre,
              code: c.codigo,
              credits: c.creditos,
              description: c.descripcion,
              schedule: 'Por definir',
              carreraId: c.carrera_id,
              department: (profesor.departamento || carreraById.get(c.carrera_id)?.nombre || 'Sin departamento'),
              groups: (() => {
                if (user?.tipo_usuario === 'estudiante') {
                  return gruposDeEstudiante
                    .filter((g: any) => g.profesor_id === profesor.id && Number(g.curso_id) === Number(c.id))
                    .map((g: any) => ({ id: g.id, numero: g.numero_grupo }))
                }
                const key = `${profesor.id}:${Number(c.id)}`
                const gs = gruposByProfesorCurso.get(key) || []
                return gs.map((g: any) => ({ id: g.id, numero: g.numero_grupo }))
              })()
            }
          : null
      }).filter(Boolean)
      return {
        id: profesor.id,
        name: `${nombre} ${apellido}`.trim(),
        email,
        department: (profesor.departamento || (courses.length > 0 ? (courses[0] as any).department : 'Sin departamento')),
        courses
      }
    })

    res.json(teachers)
  } catch (error) {
    return sendError(res, error)
  }
})

// GET /teachers/:profesorId/courses/:courseId/groups - Obtener grupos de un curso específico

router.get('/:profesorId/courses/:courseId/groups', authenticateToken, async (req: any, res) => {
  try {
    const { profesorId, courseId } = req.params
    const user = req.user

    // Verificar que el profesor existe y está activo
    const profesor = await teachersRepository.findActiveProfessor(profesorId)
    if (!profesor) {
      throw notFound('Profesor no encontrado')
    }

    // Buscar grupos del curso Y del profesor específico
    const numericCourseId = Number(courseId)
    // Buscar primero en asignaciones_profesor (es la fuente que relaciona profesor-curso-grupo)
    let asigns: any[] = []
    try {
      asigns = await academicRepository.listAsignacionesByProfesorAndCurso(
        profesorId,
        Number.isNaN(numericCourseId) ? courseId : numericCourseId
      )
    } catch (asignsErr) {
      throw internal('Error consultando asignaciones', asignsErr)
    }
    let gruposFinal: any[] = []
    if (Array.isArray(asigns) && asigns.length > 0) {
      const grupoIds = [...new Set((asigns || []).map((a: any) => a.grupo_id).filter(Boolean))]

      if (grupoIds.length > 0) {
        try {
          gruposFinal = await academicRepository.listGruposByIds(
            grupoIds,
            'id, numero_grupo, horario, aula, curso_id'
          )
        } catch (gruposAsignErr) {
          throw internal('Error consultando grupos', gruposAsignErr)
        }
      }
    }

    if (!gruposFinal || gruposFinal.length === 0) {
      // Intentar también por usuario_id si el esquema de grupos usa usuario_id en profesor_id

      const usuarioId = await teachersRepository.findUsuarioId(profesorId)
      if (usuarioId) {
        try {
          const gruposPorUsuario = await academicRepository.listGruposByCurso(
            Number.isNaN(numericCourseId) ? courseId : numericCourseId,
            'profesor_id'
          )
          const filtrados = (gruposPorUsuario || []).filter((g: any) => g.profesor_id === usuarioId)
          if (filtrados.length) {
            gruposFinal = filtrados
          }
        } catch {
          // continuar con el fallback por curso
        }
      }
    }

    if (!gruposFinal || gruposFinal.length === 0) {
      try {
        gruposFinal = await academicRepository.listGruposByCurso(
          Number.isNaN(numericCourseId) ? courseId : numericCourseId
        )
      } catch (gruposCursoError) {
        throw internal('Error consultando grupos del curso', gruposCursoError)
      }
    }

    res.json(gruposFinal)
  } catch (error) {
    return sendError(res, error)
  }
})

// GET /teachers/:profesorId/stats - Obtener estadísticas de evaluaciones del profesor

router.post('/evaluations', authenticateToken, async (req: any, res) => {
  try {
    const user = req.user

    // Validar datos de entrada
    const validatedData = evaluationSchema.parse(req.body)
    const {
      teacherId,
      courseId,
      groupId,
      answers,
      overallRating,
      comments
    } = validatedData

    // Asegurar que courseId sea un número para las consultas de BD
    const numericCourseId = typeof courseId === 'string' ? Number.parseInt(courseId, 10) : courseId

    // Verificar que el usuario es un estudiante
    if (user.tipo_usuario !== 'estudiante') {
      throw forbidden('Solo los estudiantes pueden realizar evaluaciones')
    }

    // Obtener el ID del estudiante

    let estudiante
    try {
      estudiante = await academicRepository.findEstudianteByUsuarioId(user.id)
    } catch (estudianteError) {
      throw notFound('Error al buscar el estudiante', (estudianteError as Error)?.message ?? estudianteError)
    }

    if (!estudiante) {
      throw notFound('Estudiante no encontrado')
    }

    // Verificar que no haya una evaluación previa para este profesor y grupo
    let existingEvaluation: any[] = []
    try {
      existingEvaluation = await analyticsRepository.listEvaluaciones({
        columns: 'id',
        profesorId: teacherId,
        estudianteId: estudiante.id,
        grupoId: groupId || 1,
        periodoId: 1,
      })
    } catch {
      existingEvaluation = []
    }

    if (existingEvaluation && existingEvaluation.length > 0) {
      throw conflict('Ya has evaluado a este profesor para este curso y grupo')
    }

    // Crear la evaluación principal
    const evaluationData: any = {
      profesor_id: teacherId,
      estudiante_id: estudiante.id,
      grupo_id: groupId || 1, // Usar grupo_id por defecto si no se proporciona
      periodo_id: 1, // Usar periodo_id por defecto (2025-2)
      completada: true,
      comentarios: comments || null,
      calificacion_promedio: overallRating,
      fecha_completada: new Date().toISOString()
    }

    let evaluacion: any
    try {
      evaluacion = await analyticsRepository.insertEvaluacion(evaluationData)
    } catch (evaluacionError: any) {
      throw internal('Error al guardar la evaluación', evaluacionError?.message ?? evaluacionError)
    }

    // Guardar las respuestas individuales si existen
    if (answers && answers.length > 0) {
      const respuestasData = answers.map((answer: any) => {
        const responseData: any = {
          evaluacion_id: evaluacion.id,
          pregunta_id: answer.questionId
        };

        // Manejar respuestas de rating
        if (answer.rating !== null && answer.rating !== undefined) {
          responseData.respuesta_rating = answer.rating;
        }

        // Manejar respuestas de texto
        if (answer.textAnswer !== null && answer.textAnswer !== undefined && answer.textAnswer.trim() !== '') {
          responseData.respuesta_texto = answer.textAnswer.trim();
        }

        // Manejar respuestas de opción múltiple
        if (answer.selectedOption !== null && answer.selectedOption !== undefined) {
          responseData.respuesta_opcion = answer.selectedOption;
        }
        return responseData;
      }).filter((response: any) => response.respuesta_rating !== undefined || response.respuesta_texto !== undefined || response.respuesta_opcion !== undefined);

      if (respuestasData.length > 0) {
        try {
          await analyticsRepository.insertRespuestas(respuestasData)
        } catch {
          // No fallar la operación completa si solo fallan las respuestas individuales
        }
      }
    }

    res.json({
      success: true,
      message: 'Evaluación guardada exitosamente',
      evaluationId: evaluacion.id
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendError(
        res,
        badRequest(
          'Datos de evaluación inválidos',
          error.errors.map((err) => ({ field: err.path.join('.'), message: err.message }))
        )
      )
    }
    return sendError(res, error)
  }
})

// GET /teachers/evaluation-questions/:courseId - Obtener preguntas de evaluación por curso (basado en código del curso)

router.get('/evaluation-questions/:courseId', authenticateToken, async (req: any, res) => {
  try {
    const { courseId } = req.params
    const user = req.user

    // Verificar que el usuario es un estudiante
    if (user.tipo_usuario !== 'estudiante') {
      throw forbidden('Solo los estudiantes pueden acceder a las preguntas de evaluación')
    }

    // Obtener información del curso para determinar la carrera
    let curso: any = null
    try {
      const cursos = await academicRepository.listCursosByIds([courseId], 'id, codigo, nombre')
      curso = cursos?.[0] || null
    } catch {
      curso = null
    }

    if (!curso) {
      throw notFound('Curso no encontrado')
    }

    // Determinar la carrera basada en el código del curso (si aplica)
    const codigoCurso = curso.codigo || '';
    const prefijo = codigoCurso.split('-')[0] || '';

    let carreraIdFromCourseCode: number | null = null;
    switch (prefijo.toUpperCase()) {
      case 'SIS':
        carreraIdFromCourseCode = 1
        break;
      case 'CIV':
        carreraIdFromCourseCode = 2
        break;
      case 'AMB':
        carreraIdFromCourseCode = 3
        break;
      case 'ENE':
        carreraIdFromCourseCode = 4
        break;
      case 'TEL':
        carreraIdFromCourseCode = 5
        break;
      case 'FIN':
        carreraIdFromCourseCode = 6
        break;
      case 'IND':
        carreraIdFromCourseCode = 7
        break;
      default:
        carreraIdFromCourseCode = null
        break;
    }

    // Fallback: si el código del curso no permite inferir la carrera, usar la carrera del estudiante
    let carreraId: number | null = carreraIdFromCourseCode
    if (carreraId === null) {
      try {
        const estudianteRow = await academicRepository.findEstudianteInfoByUsuarioId(user.id)
        if (estudianteRow?.carrera_id != null) {
          carreraId = Number(estudianteRow.carrera_id)
        }
      } catch {
        // continuar sin carrera
      }
    }

    // Obtener preguntas específicas de la base de datos para esta carrera
    let questions: any[] = []
    try {
      questions = await evaluationsRepository.getActiveQuestionsByCareer(carreraId)
    } catch {
      throw internal('Error obteniendo preguntas de evaluación')
    }

    // Si no hay preguntas específicas para esta carrera, obtener preguntas generales (sin carrera_id)
    if (questions.length === 0 && carreraIdFromCourseCode) {
      try {
        questions = await evaluationsRepository.getActiveQuestionsByCareer(null)
      } catch {
        throw internal('Error obteniendo preguntas de evaluación')
      }
    }

    // Transformar las preguntas al formato esperado por el frontend
    const questionsFormatted = questions.map((pregunta: any) => ({
      id: pregunta.id.toString(),
      category: pregunta.categoria?.nombre || 'General',
      question: pregunta.texto_pregunta,
      type: pregunta.tipo_pregunta,
      options: pregunta.opciones
    }))

    res.json({
      courseId: Number.parseInt(courseId),
      courseCode: curso.codigo,
      courseName: curso.nombre,
      carreraId: carreraId != null ? Number(carreraId) : null,
      questions: questionsFormatted
    })
  } catch (error) {
    return sendError(res, error)
  }
})

// GET /teachers/student-info - Obtener información del estudiante actual

router.get('/student-info', authenticateToken, async (req: any, res) => {
  try {
    const user = req.user

    // Verificar que el usuario es un estudiante
    if (user.tipo_usuario !== 'estudiante') {
      throw forbidden('Solo los estudiantes pueden acceder a esta información')
    }

    // Obtener información del estudiante
    let estudiante: any
    try {
      estudiante = await academicRepository.findEstudianteInfoByUsuarioId(user.id)
    } catch {
      estudiante = null
    }

    if (!estudiante) {
      throw notFound('Estudiante no encontrado')
    }

    res.json({
      estudianteId: estudiante.id,
      carreraId: estudiante.carrera_id,
      carrera: estudiante.carrera
    })
  } catch (error) {
    return sendError(res, error)
  }
})

// GET /teachers/teacher-info - Obtener información del profesor actual

router.get('/teacher-info', authenticateToken, async (req: any, res) => {
  try {
    const user = req.user

    // Verificar que el usuario es un profesor o coordinador (que puede ser profesor también)
    const canAccessAsTeacher = user.tipo_usuario === 'profesor' ||
                               user.tipo_usuario === 'docente' ||
                               user.tipo_usuario === 'coordinador';

    if (!canAccessAsTeacher) {
      throw forbidden('Solo los profesores y coordinadores pueden acceder a esta información')
    }

    // Obtener información del profesor
    const profesor = await teachersRepository.findTeacherInfoByUsuarioId(user.id)
    if (!profesor) {
      throw notFound('Profesor no encontrado')
    }

    res.json({
      profesorId: profesor.id,
      carreraId: profesor.carrera_id,
      carrera: profesor.carrera
    })
  } catch (error) {
    return sendError(res, error)
  }
})

// GET /teachers/survey-by-career/:careerId - Obtener encuesta por carrera

router.get('/survey-by-career/:careerId', authenticateToken, async (req: any, res) => {
  try {
    const user = req.user
    const { careerId } = req.params

    // Verificar que el usuario es un profesor o coordinador (que puede ser profesor también)
    const canAccessAsTeacher = user.tipo_usuario === 'profesor' ||
                               user.tipo_usuario === 'docente' ||
                               user.tipo_usuario === 'coordinador';

    if (!canAccessAsTeacher) {
      throw forbidden('Solo los profesores y coordinadores pueden acceder a esta información')
    }

    // Obtener preguntas de la encuesta para la carrera específica
    const parsedCareerId =
      careerId && careerId !== 'null' ? Number.parseInt(careerId) : null

    let questions: any[] = []
    try {
      questions = await evaluationsRepository.getActiveQuestionsByCareer(parsedCareerId)
    } catch {
      throw internal('Error obteniendo preguntas de evaluación')
    }

    // Si no hay preguntas específicas para esta carrera, obtener preguntas generales
    if (questions.length === 0 && careerId && careerId !== 'null') {
      try {
        questions = await evaluationsRepository.getActiveQuestionsByCareer(null)
      } catch {
        throw internal('Error obteniendo preguntas de evaluación')
      }
    }

    // Obtener información de la carrera
    let carreraInfo = null;
    if (careerId && careerId !== 'null') {
      try {
        carreraInfo = await academicRepository.getCarreraById(careerId, 'id, nombre')
      } catch {
        carreraInfo = null
      }
    }

    // Transformar las preguntas al formato esperado por el frontend
    const questionsFormatted = questions.map((pregunta: any) => ({
      id: pregunta.id.toString(),
      category: pregunta.categoria?.nombre || 'General',
      question: pregunta.texto_pregunta,
      type: pregunta.tipo_pregunta,
      options: pregunta.opciones
    }))

    res.json({
      careerId: careerId ? Number.parseInt(careerId) : null,
      career: carreraInfo,
      questions: questionsFormatted
    })
  } catch (error) {
    return sendError(res, error)
  }
})

// GET /teachers/test - Endpoint de prueba

router.get('/test', (req, res) => {
  res.json({ message: 'Teachers endpoint working', timestamp: new Date().toISOString() })
})

// GET /teachers/debug-user - Endpoint de debug para verificar información del usuario

router.get('/debug-user', authenticateToken, async (req: any, res) => {
  try {
    const user = req.user

    // Buscar información completa del usuario
    const { data: usuarioCompleto, error: usuarioError } = await academicRepository.findUsuarioById(user.id)

    if (usuarioError) {
      throw internal('Error obteniendo usuario', usuarioError)
    }

    // Buscar si es profesor
    let profesor: any = null
    let profesorError: any = null
    try {
      profesor = await teachersRepository.findTeacherInfoByUsuarioId(user.id)
    } catch (err) {
      profesorError = err
    }

    res.json({
      userFromToken: user,
      usuarioCompleto,
      profesor: profesor || null,
      profesorError: profesorError || null
    })
  } catch (error) {
    return sendError(res, error)
  }
})

// GET /teachers/debug-auth - Endpoint de debug para verificar autenticación

router.get('/debug-auth', async (req: any, res) => {
  try {
    const authHeader = req.headers['authorization']
    const token = authHeader && authHeader.split(' ')[1]

    if (!token) {
      return res.status(401).json({
        error: 'No token provided',
        authHeader: authHeader,
        hasToken: false
      })
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any

      // Buscar usuario directamente
      const { data: user, error: userError } = await academicRepository.findUsuarioById(decoded.userId)

      res.json({
        tokenPresent: true,
        decodedToken: decoded,
        userFromDB: user,
        userError: userError,
        authHeader: authHeader
      })
    } catch (jwtError) {
      res.status(401).json({
        error: 'Invalid token',
        jwtError: jwtError,
        token: token
      })
    }
  } catch (error) {
    return sendError(res, error)
  }
})

// GET /teachers/by-career/:careerId - Obtener profesores por carrera (para coordinadores)

router.get('/by-career/:careerId', authenticateToken, async (req: any, res) => {
  try {
    const user = req.user
    const { careerId } = req.params

    // Verificar que el usuario sea coordinador o decano
    if (!user.roles?.includes('coordinador') && !user.roles?.includes('decano') && user.tipo_usuario !== 'coordinador') {
      throw forbidden('Acceso denegado. Solo coordinadores y decanos pueden ver esta información.')
    }

    // 1) Traer profesores activos de la carrera directamente por columna profesores.carrera_id
    let profesBase: any[] = []
    try {
      profesBase = await teachersRepository.listByCareerDetailed(careerId)
    } catch (profesErr) {
      throw internal('Error obteniendo profesores por carrera', profesErr)
    }

    const profesorIds = (profesBase || []).map((p: any) => p.id)

    // 2) Buscar asignaciones por profesor_id en la tabla correcta
    let asignaciones: any[] = []
    try {
      const resp = await academicRepository.listAsignacionesByProfesorIds(profesorIds)
      asignaciones = (resp || [])
        .filter((item: any) => item.activa)
        .map((item: any) => ({
          ...item,
          periodo_academico: null, // asignaciones_profesor no tiene periodo_academico
          activa: true
        }))
    } catch (e) {
      // Si falla, continuar sin cursos
      asignaciones = []
    }

    const cursoIds = [...new Set((asignaciones || []).map((a: any) => a.curso_id).filter(Boolean))]

    let cursos: any[] = []
    if (cursoIds.length > 0) {
      try {
        cursos = await academicRepository.listCursosByIds(cursoIds, 'id, nombre, codigo, carrera_id')
      } catch {
        cursos = []
      }
    } else {
      cursos = []
    }

    const cursoById = new Map((cursos || []).map((c: any) => [c.id, c]))

    // Cargar nombre de la carrera para enriquecer "department"
    let carreraNombre: string | null = null
    try {
      const carreraData: any = await academicRepository.getCarreraById(careerId, 'id, nombre')
      carreraNombre = carreraData?.nombre || null
    } catch {}

    const asignacionesByProfesor = new Map<string, any[]>()
    ;(asignaciones || []).forEach((a: any) => {
      const list = asignacionesByProfesor.get(a.profesor_id) || []
      list.push(a)
      asignacionesByProfesor.set(a.profesor_id, list)
    })

    const result = (profesBase || []).map((p: any) => {
      const asigns = asignacionesByProfesor.get(p.id) || []

      // Obtener cursos de las asignaciones
      const cursosDeAsignaciones = asigns
        .map((a: any) => {
          const curso = cursoById.get(a.curso_id)

          if (curso) {
            return {
              ...curso,
              // TODO: Agregar calificación promedio cuando se implemente la funcionalidad
              calificacion_promedio: null
            }
          }
          return null
        })
        .filter(Boolean)

      // Mostrar únicamente cursos provenientes de asignaciones; si no hay, lista vacía
      const cursosProf = cursosDeAsignaciones
      return {
        id: p.id,
        usuario_id: p.usuario_id,
        codigo_profesor: p.codigo_profesor || null,
        carrera_id: p.carrera_id,
        carrera_nombre: carreraNombre,
        nombre: p.usuarios?.nombre || '',
        apellido: p.usuarios?.apellido || '',
        email: p.usuarios?.email || '',
        activa: p.activo,
        cursos: cursosProf
      }
    })

    res.json(result)
  } catch (error) {
    return sendError(res, error)
  }
})

// GET /teachers/professor-subjects - Obtener materias específicas de cada profesor

router.get('/professor-subjects', authenticateToken, async (req: any, res) => {
  try {
    const user = req.user

    // Verificar que el usuario sea decano
    if (!user.roles?.includes('decano')) {
      throw forbidden('Acceso denegado. Solo el decano puede ver las materias de los profesores.')
    }

    // Obtener todas las carreras activas (excluyendo tronco común)
    let carreras: any[] = []
    try {
      carreras = await academicRepository.listCarreras('id, nombre', {
        activa: true,
        excludeTroncoComun: true,
        orderByNombre: true,
      })
    } catch (carrerasError) {
      throw internal('Error obteniendo carreras', carrerasError)
    }

    // Obtener profesores de cada carrera con sus materias específicas
    const profesoresPorCarrera: {[key: string]: any[]} = {}

    for (const carrera of carreras) {
      let profesores: any[] = []
      try {
        profesores = await teachersRepository.listByCareerDetailed(carrera.id)
      } catch {
        profesoresPorCarrera[carrera.id] = []
        continue
      }

      const profesorIds = (profesores || []).map((p: any) => p.id)
      let asignaciones: any[] = []
      try {
        asignaciones = await academicRepository.listAsignacionesByProfesorIds(profesorIds)
      } catch {
        asignaciones = []
      }
      asignaciones = (asignaciones || []).filter((a: any) => a.activa)

      const cursoIds = [...new Set(asignaciones.map((a: any) => a.curso_id).filter(Boolean))]
      let cursos: any[] = []
      try {
        if (cursoIds.length > 0) {
          cursos = await academicRepository.listCursosByIds(cursoIds, 'id, nombre, codigo, creditos, activo')
        }
      } catch {
        cursos = []
      }
      const cursoById = new Map((cursos || []).map((c: any) => [c.id, c]))
      const asignsByProf = new Map<string, any[]>()
      asignaciones.forEach((a: any) => {
        const list = asignsByProf.get(a.profesor_id) || []
        list.push(a)
        asignsByProf.set(a.profesor_id, list)
      })

      const profesoresConMaterias = (profesores || []).map((p: any) => {
        const asignacionesProfesor = (asignsByProf.get(p.id) || []).map((asig: any) => ({
          ...asig,
          cursos: cursoById.get(asig.curso_id) || null,
        }))
        return {
          id: p.id,
          usuario_id: p.usuario_id,
          codigo_profesor: p.codigo_profesor || null,
          carrera_id: p.carrera_id,
          carrera_nombre: carrera.nombre,
          nombre: p.usuarios?.nombre || '',
          apellido: p.usuarios?.apellido || '',
          email: p.usuarios?.email || '',
          activo: p.activo,
          materias_asignadas: asignacionesProfesor
            .filter((asig: any) => asig.cursos && asig.cursos.activo)
            .map((asig: any) => ({
              id: asig.cursos.id,
              nombre: asig.cursos.nombre,
              codigo: asig.cursos.codigo,
              creditos: asig.cursos.creditos
            })),
          total_materias_asignadas: asignacionesProfesor
            .filter((asig: any) => asig.cursos && asig.cursos.activo).length
        }
      })

      profesoresPorCarrera[carrera.id] = profesoresConMaterias
    }

    const result = {
      carreras: carreras.map(c => ({
        id: c.id,
        nombre: c.nombre,
        total_profesores: profesoresPorCarrera[c.id]?.length || 0
      })),
      profesores_por_carrera: profesoresPorCarrera,
      total_profesores: Object.values(profesoresPorCarrera).flat().length
    }

    res.json(result)
  } catch (error) {
    return sendError(res, error)
  }
})

// GET /teachers/career-subjects - Obtener materias de cada carrera

router.get('/career-subjects', authenticateToken, async (req: any, res) => {
  try {
    const user = req.user

    // Verificar que el usuario sea decano
    if (!user.roles?.includes('decano')) {
      throw forbidden('Acceso denegado. Solo el decano puede ver las materias de las carreras.')
    }

    // Obtener todas las carreras activas (excluyendo tronco común)
    let carreras: any[] = []
    try {
      carreras = await academicRepository.listCarreras('id, nombre', {
        activa: true,
        excludeTroncoComun: true,
        orderByNombre: true,
      })
    } catch (carrerasError) {
      throw internal('Error obteniendo carreras', carrerasError)
    }

    // Obtener materias de cada carrera
    const materiasPorCarrera: {[key: string]: any[]} = {}

    for (const carrera of carreras) {
      try {
        const cursos = await academicRepository.listCursosActivosByCareer(
          carrera.id,
          'id, nombre, codigo, creditos, descripcion, activo'
        )
        materiasPorCarrera[carrera.id] = [...(cursos || [])].sort((a: any, b: any) =>
          String(a.nombre || '').localeCompare(String(b.nombre || ''))
        )
      } catch {
        materiasPorCarrera[carrera.id] = []
      }
    }

    const result = {
      carreras: carreras.map(c => ({
        id: c.id,
        nombre: c.nombre,
        total_materias: materiasPorCarrera[c.id]?.length || 0
      })),
      materias_por_carrera: materiasPorCarrera,
      total_materias: Object.values(materiasPorCarrera).flat().length
    }

    res.json(result)
  } catch (error) {
    return sendError(res, error)
  }
})

// GET /teachers/detailed-faculty - Obtener profesores con información detallada (materias, etc.)

router.get('/detailed-faculty', authenticateToken, async (req: any, res) => {
  try {
    const user = req.user

    // Verificar que el usuario sea decano
    if (!user.roles?.includes('decano')) {
      throw forbidden('Acceso denegado. Solo el decano puede ver todos los profesores de la facultad.')
    }

    // Obtener todas las carreras activas (excluyendo tronco común)
    let carreras: any[] = []
    try {
      carreras = await academicRepository.listCarreras('id, nombre', {
        activa: true,
        excludeTroncoComun: true,
        orderByNombre: true,
      })
    } catch (carrerasError) {
      throw internal('Error obteniendo carreras', carrerasError)
    }

    // Obtener profesores de cada carrera con información detallada
    const profesoresPorCarrera: {[key: string]: any[]} = {}

    for (const carrera of carreras) {
      let profesores: any[] = []
      try {
        profesores = await teachersRepository.listByCareerDetailed(carrera.id)
      } catch {
        profesoresPorCarrera[carrera.id] = []
        continue
      }

      let cursosCarrera: any[] = []
      try {
        cursosCarrera = await academicRepository.listCursosActivosByCareer(
          carrera.id,
          'id, nombre, codigo, creditos, activo'
        )
      } catch {
        cursosCarrera = []
      }

      const profesoresConMaterias = (profesores || []).map((p: any) => ({
        id: p.id,
        usuario_id: p.usuario_id,
        codigo_profesor: p.codigo_profesor || null,
        carrera_id: p.carrera_id,
        carrera_nombre: carrera.nombre,
        nombre: p.usuarios?.nombre || '',
        apellido: p.usuarios?.apellido || '',
        email: p.usuarios?.email || '',
        activo: p.activo,
        materias_carrera: cursosCarrera || [],
        total_materias_carrera: cursosCarrera?.length || 0
      }))

      profesoresPorCarrera[carrera.id] = profesoresConMaterias
    }

    const result = {
      carreras: carreras.map(c => ({
        id: c.id,
        nombre: c.nombre,
        total_profesores: profesoresPorCarrera[c.id]?.length || 0
      })),
      profesores_por_carrera: profesoresPorCarrera,
      total_profesores: Object.values(profesoresPorCarrera).flat().length
    }

    res.json(result)
  } catch (error) {
    return sendError(res, error)
  }
})

// GET /teachers/faculty - Obtener TODOS los profesores de la facultad organizados por carrera (solo para decanos)

router.get('/faculty', authenticateToken, async (req: any, res) => {
  try {
    const user = req.user

    // Verificar que el usuario sea decano
    if (!user.roles?.includes('decano')) {
      throw forbidden('Acceso denegado. Solo el decano puede ver todos los profesores de la facultad.')
    }

    // Obtener todas las carreras activas (excluyendo tronco común)
    let carreras: any[] = []
    try {
      carreras = await academicRepository.listCarreras('id, nombre', {
        activo: true,
        activa: true,
        excludeTroncoComun: true,
        orderByNombre: true,
      })
    } catch (carrerasError) {
      throw internal('Error obteniendo carreras', carrerasError)
    }

    // Obtener profesores de cada carrera
    const profesoresPorCarrera: {[key: string]: any[]} = {}

    for (const carrera of carreras) {
      try {
        const profesores = await teachersRepository.listByCareerDetailed(carrera.id)
        profesoresPorCarrera[carrera.id] = (profesores || []).map((p: any) => ({
          id: p.id,
          usuario_id: p.usuario_id,
          codigo_profesor: p.codigo_profesor || null,
          carrera_id: p.carrera_id,
          carrera_nombre: carrera.nombre,
          departamento: 'Sin departamento', // Campo fijo ya que no existe en la tabla
          nombre: p.usuarios?.nombre || '',
          apellido: p.usuarios?.apellido || '',
          email: p.usuarios?.email || '',
          activo: p.activo
        }))
      } catch {
        profesoresPorCarrera[carrera.id] = []
      }
    }

    const result = {
      carreras: carreras.map(c => ({
        id: c.id,
        nombre: c.nombre,
        total_profesores: profesoresPorCarrera[c.id]?.length || 0
      })),
      profesores_por_carrera: profesoresPorCarrera,
      total_profesores: Object.values(profesoresPorCarrera).flat().length
    }

    res.json(result)
  } catch (error) {
    return sendError(res, error)
  }
})

// GET /teachers/all - Obtener TODOS los profesores de la facultad (solo para decanos)

router.get('/all', authenticateToken, async (req: any, res) => {
  try {
    const user = req.user

    // Verificar que el usuario sea decano
    if (!user.roles?.includes('decano')) {
      throw forbidden('Acceso denegado. Solo el decano puede ver todos los profesores de la facultad.')
    }

    // Obtener TODOS los profesores activos de la facultad
    let profesBase: any[] = []
    try {
      profesBase = await teachersRepository.listActiveWithUsuario()
    } catch (profesErr) {
      throw internal('Error obteniendo profesores', profesErr)
    }

    // Obtener todas las carreras para mostrar información completa
    let carreras: any[] = []
    try {
      carreras = await academicRepository.listCarreras('id, nombre', { activo: true })
    } catch {
      carreras = []
    }

    const carreraById = new Map()
    ;(carreras || []).forEach((c: any) => {
      carreraById.set(c.id, c)
    })

    const result = (profesBase || []).map((p: any) => {
      const usuario = p.usuarios || p.usuario
      const carrera = carreraById.get(p.carrera_id)
      return {
        id: p.id,
        usuario_id: p.usuario_id,
        codigo_profesor: p.codigo_profesor || null,
        carrera_id: p.carrera_id,
        carrera_nombre: carrera?.nombre || 'Sin carrera asignada',
        departamento: p.departamento || 'Sin departamento',
        nombre: usuario?.nombre || '',
        apellido: usuario?.apellido || '',
        email: usuario?.email || '',
        activo: p.activo
      }
    })

    res.json(result)
  } catch (error) {
    return sendError(res, error)
  }
})

// Endpoint de debug para verificar grupos de un curso

router.get('/debug-groups/:profesorId/:courseId', authenticateToken, async (req: any, res) => {
  try {
    const user = req.user
    const { profesorId, courseId } = req.params

    // 1. Verificar que el profesor existe
    let profesor: any[] = []
    try {
      profesor = await teachersRepository.listActiveById(profesorId)
    } catch {
      throw internal('Error consultando profesor')
    }

    // 2. Verificar que el curso existe
    let curso: any[] = []
    try {
      curso = await academicRepository.listCursosByIds([courseId], 'id, nombre, codigo, carrera_id')
    } catch {
      throw internal('Error consultando curso')
    }

    // 3. Verificar asignaciones del profesor para este curso
    let asignaciones: any[] = []
    try {
      asignaciones = await academicRepository.listAsignacionesByProfesorAndCursoAll(profesorId, courseId)
    } catch {
      asignaciones = []
    }

    // 4. Traer grupos por curso_id (la tabla grupos no tiene profesor_id)
    let grupos: any[] = []
    try {
      grupos = await academicRepository.listGruposByCurso(courseId)
    } catch {
      throw internal('Error consultando grupos')
    }

    // 5. Verificar si hay grupos en general (para debug)
    let todosLosGrupos: any[] = []
    try {
      todosLosGrupos = await academicRepository.listGruposSample(10)
    } catch {
      todosLosGrupos = []
    }

    res.json({
      profesor: profesor || null,
      curso: curso || null,
      grupos: grupos || [],
      asignaciones: asignaciones || [],
      todosLosGrupos: todosLosGrupos || [],
      summary: {
        profesorExiste: !!profesor,
        cursoExiste: !!curso,
        gruposEncontrados: grupos?.length || 0,
        asignacionesEncontradas: asignaciones?.length || 0,
        totalGruposEnDB: todosLosGrupos?.length || 0
      }
    })
  } catch (error) {
    return sendError(res, error)
  }
})

// Endpoint de debug para verificar asignaciones de profesores

router.get('/debug-assignments/:careerId', authenticateToken, async (req: any, res) => {
  try {
    const user = req.user
    const { careerId } = req.params

    // 1. Verificar profesores de la carrera
    let profesores: any[] = []
    try {
      profesores = await teachersRepository.listByCareerDetailed(careerId)
    } catch {
      throw internal('Error consultando profesores')
    }

    // 2. Verificar asignaciones por profesor_id
    const profesorIds = profesores?.map((p: any) => p.id) || []

    let asignaciones: any[] = []
    try {
      asignaciones = await academicRepository.listAsignacionesConCursos(profesorIds)
    } catch {
      throw internal('Error consultando asignaciones')
    }

    // 3. Verificar cursos de la carrera
    let cursos: any[] = []
    try {
      cursos = await academicRepository.listCursosByCareer(careerId, 'id, nombre, codigo, carrera_id')
    } catch {
      throw internal('Error consultando cursos')
    }

    res.json({
      profesores: profesores || [],
      asignaciones: asignaciones || [],
      cursos: cursos || [],
      summary: {
        totalProfesores: profesores?.length || 0,
        totalAsignaciones: asignaciones?.length || 0,
        totalCursos: cursos?.length || 0
      }
    })
  } catch (error) {
    return sendError(res, error)
  }
})

// Endpoint para obtener calificación promedio de un profesor en un curso específico

router.get('/careers', authenticateToken, async (req: any, res) => {
  try {
    const user = req.user
    const isCoordinador =
      user.roles?.includes('coordinador') || user.tipo_usuario === 'coordinador'
    const isAdmin = user.roles?.includes('admin') || user.tipo_usuario === 'admin'

    if (!isCoordinador && !isAdmin) {
      throw forbidden('Acceso denegado. Solo coordinadores o administradores pueden ver esta información.')
    }

    // Schema seed usa `activa`; algunos entornos pueden tener `activo`
    let carreras: any[] | null = null

    try {
      carreras = await academicRepository.listCarreras('id, nombre, facultad_id, activa', {
        activa: true,
        orderByNombre: true,
      })
    } catch (error) {
      throw internal('Error obteniendo carreras', error)
    }

    res.json(carreras || [])
  } catch (error) {
    return sendError(res, error)
  }
})
// GET /teachers/:teacherId/courses - Obtener cursos de un profesor específico

router.get('/:teacherId/courses', authenticateToken, async (req: any, res) => {
  try {
    const user = req.user
    const { teacherId } = req.params

    // Verificar que el usuario sea el mismo profesor o un coordinador
    const isOwnProfile = user.id === teacherId
    const isCoordinator = user.roles?.includes('coordinador') || user.tipo_usuario === 'coordinador'

    if (!isOwnProfile && !isCoordinator) {
      throw forbidden('Acceso denegado. Solo puedes ver tus propios cursos.')
    }

    // Primero obtener el profesor_id desde el usuario_id
    let profesor: any
    try {
      profesor = await teachersRepository.findActiveByUsuarioId(teacherId)
    } catch (profesorError) {
      throw internal('Error obteniendo información del profesor', profesorError)
    }

    if (!profesor) {
      return res.json([]) // Retornar array vacío si no es profesor
    }

    // Obtener asignaciones del profesor con información de cursos
    let asignaciones: any[] = []
    try {
      asignaciones = await academicRepository.listAsignacionesConCursoCarrera(profesor.id)
    } catch (asignError) {
      throw internal('Error obteniendo cursos del profesor', asignError)
    }

    // Filtrar solo cursos activos y formatear respuesta
    const cursos = (asignaciones || [])
      .filter((asig: any) => asig.cursos && asig.cursos.activo)
      .map((asig: any) => ({
        id: asig.cursos.id,
        nombre: asig.cursos.nombre,
        codigo: asig.cursos.codigo,
        creditos: asig.cursos.creditos,
        descripcion: asig.cursos.descripcion,
        carrera_id: asig.cursos.carrera_id,
        carrera: asig.cursos.carreras
      }))

    res.json(cursos)
  } catch (error) {
    return sendError(res, error)
  }
})

// GET /teachers/career-results/all - Obtener resultados para todas las carreras

router.get('/student-enrolled-subjects', authenticateToken, async (req: any, res) => {
  try {
    const user = req.user

    // Verificar que el usuario es un estudiante
    if (user.tipo_usuario !== 'estudiante') {
      throw forbidden('Solo los estudiantes pueden acceder a esta información')
    }

    // Obtener el ID del estudiante (si no existe, devolver lista vacía para que el dashboard cargue)
    let estudiante: any
    try {
      estudiante = await academicRepository.findEstudianteByUsuarioId(user.id)
    } catch {
      return res.json({ materiasMatriculadas: [], total: 0 });
    }

    if (!estudiante) {
      return res.json({ materiasMatriculadas: [], total: 0 });
    }

    // Obtener materias matriculadas con información detallada
    let inscripciones: any[] = []
    try {
      inscripciones = await academicRepository.listInscripcionesDetalladas(estudiante.id)
    } catch {
      return res.json({ materiasMatriculadas: [], total: 0 });
    }

    // Formatear los datos
    const materiasMatriculadas = inscripciones?.map((inscripcion: any) => ({
      id: inscripcion.id,
      grupo: {
        id: inscripcion.grupo?.id,
        numeroGrupo: inscripcion.grupo?.numero_grupo,
        horario: inscripcion.grupo?.horario,
        aula: inscripcion.grupo?.aula,
        curso: {
          id: inscripcion.grupo?.curso?.id,
          nombre: inscripcion.grupo?.curso?.nombre,
          codigo: inscripcion.grupo?.curso?.codigo,
          creditos: inscripcion.grupo?.curso?.creditos
        },
        profesor: {
          id: inscripcion.grupo?.asignaciones_profesor?.[0]?.profesor?.id,
          nombre: `${inscripcion.grupo?.asignaciones_profesor?.[0]?.profesor?.usuario?.nombre || ''} ${inscripcion.grupo?.asignaciones_profesor?.[0]?.profesor?.usuario?.apellido || ''}`.trim()
        },
        periodo: {
          id: inscripcion.grupo?.periodo?.id,
          nombre: inscripcion.grupo?.periodo?.nombre,
          codigo: inscripcion.grupo?.periodo?.codigo
        }
      }
    })).filter((materia: any) => materia.grupo?.curso?.id) || []

    res.json({
      materiasMatriculadas,
      total: materiasMatriculadas.length
    })
  } catch (error) {
    return res.json({ materiasMatriculadas: [], total: 0 });
  }
})

// GET /teachers/teacher-stats - Obtener estadísticas del profesor

router.get('/teacher-courses/:teacherId', authenticateToken, async (req: any, res) => {
  try {
    const user = req.user
    const { teacherId } = req.params

    // Verificar que el usuario es un profesor
    if (user.tipo_usuario !== 'profesor') {
      throw forbidden('Solo los profesores pueden acceder a estos datos')
    }

    // Obtener cursos del profesor con información detallada
    let cursos: any[] = []
    try {
      cursos = await academicRepository.listAsignacionesConCursoGrupo(teacherId)
    } catch (cursosError: any) {
      throw internal('Error al obtener cursos del profesor', cursosError?.message ?? cursosError)
    }

    // Formatear los datos
    const cursosFormateados = cursos?.map((asignacion: any) => ({
      id: asignacion.id,
      curso: {
        id: asignacion.curso?.id,
        nombre: asignacion.curso?.nombre,
        codigo: asignacion.curso?.codigo,
        creditos: asignacion.curso?.creditos
      },
      grupo: {
        id: asignacion.grupo?.id,
        numeroGrupo: asignacion.grupo?.numero_grupo,
        horario: asignacion.grupo?.horario,
        aula: asignacion.grupo?.aula,
        periodo: {
          id: asignacion.grupo?.periodo?.id,
          nombre: asignacion.grupo?.periodo?.nombre,
          codigo: asignacion.grupo?.periodo?.codigo
        }
      }
    })).filter((curso: any) => curso.curso?.id) || []

    res.json(cursosFormateados)
  } catch (error) {
    return sendError(res, error)
  }
})

// GET /teachers/teacher-id - Obtener ID del profesor desde el usuario autenticado

router.get('/teacher-id', authenticateToken, async (req: any, res) => {
  try {
    const user = req.user

    // Verificar que el usuario es un profesor
    if (user.tipo_usuario !== 'profesor') {
      throw forbidden('Solo los profesores pueden acceder a este endpoint')
    }

    // Obtener el ID del profesor
    const profesor = await teachersRepository.findByUsuarioId(user.id)
    if (!profesor) {
      throw notFound('Profesor no encontrado')
    }

    res.json({ teacherId: profesor.id })
  } catch (error) {
    return sendError(res, error)
  }
})

// GET /teachers/period-stats?period=YYYY-1|YYYY-2 - Estadísticas filtradas por período (cards y tablas)

router.get('/debug-professors', authenticateToken, async (req: any, res) => {
  try {
    const user = req.user

    // Obtener todos los profesores
    let todosProfesores: any[] = []
    try {
      todosProfesores = await teachersRepository.listSample(10)
    } catch {
      todosProfesores = []
    }

    // Buscar el profesor específico que está fallando
    const { data: profesorEspecifico, error: profError } = await teachersRepository.findWithUsuario(
      '8c1f98db-6722-4aac-ad68-2a368b6324d4'
    )

    res.json({
      user: { id: user.id, tipo: user.tipo_usuario },
      todosProfesores: todosProfesores || [],
      profesorEspecifico: profesorEspecifico || null,
      error: profError
    })
  } catch (error) {
    return sendError(res, error)
  }
})

export default router
