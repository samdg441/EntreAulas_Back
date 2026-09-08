import jwt from 'jsonwebtoken'
import { teachersRepository } from './teachers.repository'
import { academicRepository } from './academic.repository'
import { analyticsRepository } from '../analytics/analytics.repository'
import { evaluationsRepository } from '../evaluations/evaluations.repository'
import { conflict, forbidden, internal, notFound } from '../../shared/errors'

function formatQuestions(questions: any[]) {
  return questions.map((pregunta: any) => ({
    id: pregunta.id.toString(),
    category: pregunta.categoria?.nombre || 'General',
    question: pregunta.texto_pregunta,
    type: pregunta.tipo_pregunta,
    options: pregunta.opciones,
  }))
}

function carreraIdDesdeCodigo(codigoCurso: string): number | null {
  switch ((codigoCurso.split('-')[0] || '').toUpperCase()) {
    case 'SIS':
      return 1
    case 'CIV':
      return 2
    case 'AMB':
      return 3
    case 'ENE':
      return 4
    case 'TEL':
      return 5
    case 'FIN':
      return 6
    case 'IND':
      return 7
    default:
      return null
  }
}

function mapProfesorFacultad(p: any, carreraNombre: string, extra: Record<string, unknown> = {}) {
  return {
    id: p.id,
    usuario_id: p.usuario_id,
    codigo_profesor: p.codigo_profesor || null,
    carrera_id: p.carrera_id,
    carrera_nombre: carreraNombre,
    nombre: p.usuarios?.nombre || '',
    apellido: p.usuarios?.apellido || '',
    email: p.usuarios?.email || '',
    ...extra,
  }
}

async function listCarrerasActivas(opts: { activo?: boolean; activa?: boolean }) {
  return academicRepository.listCarreras('id, nombre', {
    ...opts,
    excludeTroncoComun: true,
    orderByNombre: true,
  })
}

/** Orquesta listados y fichas de profesores. Sin SQL directo. */
export class TeachersService {
  async listTeachers(user: { id: string; tipo_usuario?: string }) {
    let gruposDeEstudiante: any[] = []
    let profesorIdsFiltro: string[] | null = null
    if (user?.tipo_usuario === 'estudiante') {
      const estudiante = await academicRepository.findEstudianteByUsuarioId(user.id)
      if (!estudiante) return []

      let inscripciones
      try {
        inscripciones = await academicRepository.listInscripcionesActivas(estudiante.id)
      } catch (inscError) {
        throw internal('DB inscripciones', inscError)
      }

      const grupoIds = [...new Set((inscripciones || []).map((i: any) => i.grupo_id).filter(Boolean))]
      if (grupoIds.length > 0) {
        let gruposDeConsulta: any[] = []
        try {
          gruposDeConsulta = await academicRepository.listGruposByIdsFlexible(grupoIds)
        } catch (gruposError) {
          throw internal('DB grupos', gruposError)
        }
        gruposDeEstudiante = gruposDeConsulta || []

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

        const asignacionIds = [
          ...new Set(gruposDeEstudiante.map((g: any) => g.asignacion_profesor_id).filter(Boolean)),
        ]
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
        return []
      }
    }

    let profesores: any[] = []
    try {
      profesores = await teachersRepository.listActiveWithUsuario(
        profesorIdsFiltro && profesorIdsFiltro.length > 0 ? profesorIdsFiltro : undefined
      )
    } catch (profesoresError) {
      throw internal('DB profesores', profesoresError)
    }

    const profesorIds = (profesores || []).map((p: any) => p.id)

    let asignaciones: any[] = []
    try {
      asignaciones = await academicRepository.listAsignacionesByProfesorIds(profesorIds)
    } catch (asignacionesError) {
      throw internal('DB asignaciones', asignacionesError)
    }

    asignaciones = (asignaciones || []).map((a: any) => ({
      ...a,
      profesor_id: a.profesor_id ?? a.docente_id ?? a.teacher_id ?? a.profesor ?? null,
      curso_id: Number(a.curso_id ?? a.id_curso ?? a.course_id ?? a.curso ?? null),
    }))

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
    const tieneCarreraId = true
    let carreras: any[] = []
    if (tieneCarreraId) {
      const carreraIds = [
        ...new Set(cursos.map((c: any) => c.carrera_id).filter((id: any) => id !== null && id !== undefined)),
      ]
      if (carreraIds.length > 0) {
        try {
          carreras = await academicRepository.listCarrerasByIds(carreraIds)
        } catch (carrerasError) {
          throw internal('DB carreras', carrerasError)
        }
      }
    }

    const cursoIds = [
      ...new Set(
        (asignaciones || []).map((a: any) => a.curso_id).filter((id: any) => id !== null && id !== undefined)
      ),
    ]

    if (cursoIds.length > 0 && cursos.length === 0) {
      try {
        cursos = await academicRepository.listCursosByIds(cursoIds, 'id, nombre, codigo, creditos, descripcion')
      } catch {
        // original swallowed
      }
    }
    const cursoById = new Map((cursos || []).map((c: any) => [c.id, c]))
    const carreraById = new Map((carreras || []).map((c: any) => [c.id, c]))
    const asignacionesByProfesor = new Map<string, any[]>()
    const cursoIdByGrupoId = new Map<number, number>()
    gruposPorAsignaciones.forEach((g: any) => {
      if (g && g.id != null) cursoIdByGrupoId.set(Number(g.id), Number(g.curso_id))
    })

    ;(asignaciones || []).forEach((a: any) => {
      const resolvedCursoId = Number(a.curso_id ?? cursoIdByGrupoId.get(Number(a.grupo_id)))
      a.curso_id = Number.isFinite(resolvedCursoId) ? resolvedCursoId : undefined
      const list = asignacionesByProfesor.get(a.profesor_id) || []
      list.push(a)
      asignacionesByProfesor.set(a.profesor_id, list)
    })

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

    return (profesores || []).map((profesor: any) => {
      const nombre = profesor.usuario?.nombre || ''
      const apellido = profesor.usuario?.apellido || ''
      const email = profesor.usuario?.email || ''
      const asignacionesDeProfesor = asignacionesByProfesor.get(profesor.id) || []

      const courses = asignacionesDeProfesor
        .map((a: any) => {
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
                department: profesor.departamento || carreraById.get(c.carrera_id)?.nombre || 'Sin departamento',
                groups: (() => {
                  if (user?.tipo_usuario === 'estudiante') {
                    return gruposDeEstudiante
                      .filter((g: any) => g.profesor_id === profesor.id && Number(g.curso_id) === Number(c.id))
                      .map((g: any) => ({ id: g.id, numero: g.numero_grupo }))
                  }
                  const key = `${profesor.id}:${Number(c.id)}`
                  const gs = gruposByProfesorCurso.get(key) || []
                  return gs.map((g: any) => ({ id: g.id, numero: g.numero_grupo }))
                })(),
              }
            : null
        })
        .filter(Boolean)
      return {
        id: profesor.id,
        name: `${nombre} ${apellido}`.trim(),
        email,
        department:
          profesor.departamento || (courses.length > 0 ? (courses[0] as any).department : 'Sin departamento'),
        courses,
      }
    })
  }

  async listGroups(profesorId: string, courseId: string) {
    const profesor = await teachersRepository.findActiveProfessor(profesorId)
    if (!profesor) {
      throw notFound('Profesor no encontrado')
    }

    const numericCourseId = Number(courseId)
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

    return gruposFinal
  }

  async createEvaluation(
    user: { id: string; tipo_usuario?: string },
    validatedData: {
      teacherId: string
      courseId: string | number
      groupId?: string
      answers: Array<{
        questionId: number
        rating?: number | null
        textAnswer?: string | null
        selectedOption?: string | null
      }>
      overallRating: number
      comments?: string
    }
  ) {
    const { teacherId, groupId, answers, overallRating, comments } = validatedData
    if (user.tipo_usuario !== 'estudiante') {
      throw forbidden('Solo los estudiantes pueden realizar evaluaciones')
    }

    let estudiante
    try {
      estudiante = await academicRepository.findEstudianteByUsuarioId(user.id)
    } catch (estudianteError) {
      throw notFound('Error al buscar el estudiante', (estudianteError as Error)?.message ?? estudianteError)
    }
    if (!estudiante) {
      throw notFound('Estudiante no encontrado')
    }

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

    const evaluationData: any = {
      profesor_id: teacherId,
      estudiante_id: estudiante.id,
      grupo_id: groupId || 1,
      periodo_id: 1,
      completada: true,
      comentarios: comments || null,
      calificacion_promedio: overallRating,
      fecha_completada: new Date().toISOString(),
    }

    let evaluacion: any
    try {
      evaluacion = await analyticsRepository.insertEvaluacion(evaluationData)
    } catch (evaluacionError: any) {
      throw internal('Error al guardar la evaluación', evaluacionError?.message ?? evaluacionError)
    }

    if (answers && answers.length > 0) {
      const respuestasData = answers
        .map((answer: any) => {
          const responseData: any = {
            evaluacion_id: evaluacion.id,
            pregunta_id: answer.questionId,
          }
          if (answer.rating !== null && answer.rating !== undefined) {
            responseData.respuesta_rating = answer.rating
          }
          if (answer.textAnswer !== null && answer.textAnswer !== undefined && answer.textAnswer.trim() !== '') {
            responseData.respuesta_texto = answer.textAnswer.trim()
          }
          if (answer.selectedOption !== null && answer.selectedOption !== undefined) {
            responseData.respuesta_opcion = answer.selectedOption
          }
          return responseData
        })
        .filter(
          (response: any) =>
            response.respuesta_rating !== undefined ||
            response.respuesta_texto !== undefined ||
            response.respuesta_opcion !== undefined
        )

      if (respuestasData.length > 0) {
        try {
          await analyticsRepository.insertRespuestas(respuestasData)
        } catch {
          // No fallar la operación completa si solo fallan las respuestas individuales
        }
      }
    }

    return {
      success: true,
      message: 'Evaluación guardada exitosamente',
      evaluationId: evaluacion.id,
    }
  }

  async getEvaluationQuestions(user: { id: string; tipo_usuario?: string }, courseId: string) {
    if (user.tipo_usuario !== 'estudiante') {
      throw forbidden('Solo los estudiantes pueden acceder a las preguntas de evaluación')
    }

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

    let carreraIdFromCourseCode: number | null = carreraIdDesdeCodigo(curso.codigo || '')
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

    let questions: any[] = []
    try {
      questions = await evaluationsRepository.getActiveQuestionsByCareer(carreraId)
    } catch {
      throw internal('Error obteniendo preguntas de evaluación')
    }
    if (questions.length === 0 && carreraIdFromCourseCode) {
      try {
        questions = await evaluationsRepository.getActiveQuestionsByCareer(null)
      } catch {
        throw internal('Error obteniendo preguntas de evaluación')
      }
    }

    return {
      courseId: Number.parseInt(courseId),
      courseCode: curso.codigo,
      courseName: curso.nombre,
      carreraId: carreraId != null ? Number(carreraId) : null,
      questions: formatQuestions(questions),
    }
  }

  async getStudentInfo(usuarioId: string) {
    let estudiante: any
    try {
      estudiante = await academicRepository.findEstudianteInfoByUsuarioId(usuarioId)
    } catch {
      estudiante = null
    }
    if (!estudiante) {
      throw notFound('Estudiante no encontrado')
    }
    return {
      estudianteId: estudiante.id,
      carreraId: estudiante.carrera_id,
      carrera: estudiante.carrera,
    }
  }

  async getTeacherInfo(usuarioId: string) {
    const profesor = await teachersRepository.findTeacherInfoByUsuarioId(usuarioId)
    if (!profesor) {
      throw notFound('Profesor no encontrado')
    }
    return {
      profesorId: profesor.id,
      carreraId: profesor.carrera_id,
      carrera: profesor.carrera,
    }
  }

  async getSurveyByCareer(careerId: string) {
    const parsedCareerId = careerId && careerId !== 'null' ? Number.parseInt(careerId) : null
    let questions: any[] = []
    try {
      questions = await evaluationsRepository.getActiveQuestionsByCareer(parsedCareerId)
    } catch {
      throw internal('Error obteniendo preguntas de evaluación')
    }
    if (questions.length === 0 && careerId && careerId !== 'null') {
      try {
        questions = await evaluationsRepository.getActiveQuestionsByCareer(null)
      } catch {
        throw internal('Error obteniendo preguntas de evaluación')
      }
    }

    let carreraInfo = null
    if (careerId && careerId !== 'null') {
      try {
        carreraInfo = await academicRepository.getCarreraById(careerId, 'id, nombre')
      } catch {
        carreraInfo = null
      }
    }

    return {
      careerId: careerId ? Number.parseInt(careerId) : null,
      career: carreraInfo,
      questions: formatQuestions(questions),
    }
  }

  async debugUser(user: any) {
    const { data: usuarioCompleto, error: usuarioError } = await academicRepository.findUsuarioById(user.id)
    if (usuarioError) {
      throw internal('Error obteniendo usuario', usuarioError)
    }
    let profesor: any = null
    let profesorError: any = null
    try {
      profesor = await teachersRepository.findTeacherInfoByUsuarioId(user.id)
    } catch (err) {
      profesorError = err
    }
    return {
      userFromToken: user,
      usuarioCompleto,
      profesor: profesor || null,
      profesorError: profesorError || null,
    }
  }

  async debugAuth(authHeader: string | undefined) {
    const token = authHeader && authHeader.split(' ')[1]
    if (!token) {
      return {
        status: 401,
        body: { error: 'No token provided', authHeader, hasToken: false },
      }
    }
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any
      const { data: user, error: userError } = await academicRepository.findUsuarioById(decoded.userId)
      return {
        status: 200,
        body: {
          tokenPresent: true,
          decodedToken: decoded,
          userFromDB: user,
          userError,
          authHeader,
        },
      }
    } catch (jwtError) {
      return {
        status: 401,
        body: { error: 'Invalid token', jwtError, token },
      }
    }
  }

  async listByCareer(careerId: string) {
    let profesBase: any[] = []
    try {
      profesBase = await teachersRepository.listByCareerDetailed(careerId)
    } catch (profesErr) {
      throw internal('Error obteniendo profesores por carrera', profesErr)
    }

    const profesorIds = (profesBase || []).map((p: any) => p.id)
    let asignaciones: any[] = []
    try {
      const resp = await academicRepository.listAsignacionesByProfesorIds(profesorIds)
      asignaciones = (resp || [])
        .filter((item: any) => item.activa)
        .map((item: any) => ({
          ...item,
          periodo_academico: null,
          activa: true,
        }))
    } catch {
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
    }

    const cursoById = new Map((cursos || []).map((c: any) => [c.id, c]))
    let carreraNombre: string | null = null
    try {
      const carreraData: any = await academicRepository.getCarreraById(careerId, 'id, nombre')
      carreraNombre = carreraData?.nombre || null
    } catch {
      carreraNombre = null
    }

    const asignacionesByProfesor = new Map<string, any[]>()
    ;(asignaciones || []).forEach((a: any) => {
      const list = asignacionesByProfesor.get(a.profesor_id) || []
      list.push(a)
      asignacionesByProfesor.set(a.profesor_id, list)
    })

    return (profesBase || []).map((p: any) => {
      const asigns = asignacionesByProfesor.get(p.id) || []
      const cursosDeAsignaciones = asigns
        .map((a: any) => {
          const curso = cursoById.get(a.curso_id)
          if (curso) {
            return { ...curso, calificacion_promedio: null }
          }
          return null
        })
        .filter(Boolean)
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
        cursos: cursosDeAsignaciones,
      }
    })
  }

  async getProfessorSubjects() {
    let carreras: any[] = []
    try {
      carreras = await listCarrerasActivas({ activa: true })
    } catch (carrerasError) {
      throw internal('Error obteniendo carreras', carrerasError)
    }

    const profesoresPorCarrera: { [key: string]: any[] } = {}
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

      profesoresPorCarrera[carrera.id] = (profesores || []).map((p: any) => {
        const asignacionesProfesor = (asignsByProf.get(p.id) || []).map((asig: any) => ({
          ...asig,
          cursos: cursoById.get(asig.curso_id) || null,
        }))
        return {
          ...mapProfesorFacultad(p, carrera.nombre, { activo: p.activo }),
          materias_asignadas: asignacionesProfesor
            .filter((asig: any) => asig.cursos && asig.cursos.activo)
            .map((asig: any) => ({
              id: asig.cursos.id,
              nombre: asig.cursos.nombre,
              codigo: asig.cursos.codigo,
              creditos: asig.cursos.creditos,
            })),
          total_materias_asignadas: asignacionesProfesor.filter(
            (asig: any) => asig.cursos && asig.cursos.activo
          ).length,
        }
      })
    }

    return {
      carreras: carreras.map((c) => ({
        id: c.id,
        nombre: c.nombre,
        total_profesores: profesoresPorCarrera[c.id]?.length || 0,
      })),
      profesores_por_carrera: profesoresPorCarrera,
      total_profesores: Object.values(profesoresPorCarrera).flat().length,
    }
  }

  async getCareerSubjects() {
    let carreras: any[] = []
    try {
      carreras = await listCarrerasActivas({ activa: true })
    } catch (carrerasError) {
      throw internal('Error obteniendo carreras', carrerasError)
    }

    const materiasPorCarrera: { [key: string]: any[] } = {}
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

    return {
      carreras: carreras.map((c) => ({
        id: c.id,
        nombre: c.nombre,
        total_materias: materiasPorCarrera[c.id]?.length || 0,
      })),
      materias_por_carrera: materiasPorCarrera,
      total_materias: Object.values(materiasPorCarrera).flat().length,
    }
  }

  async getDetailedFaculty() {
    let carreras: any[] = []
    try {
      carreras = await listCarrerasActivas({ activa: true })
    } catch (carrerasError) {
      throw internal('Error obteniendo carreras', carrerasError)
    }

    const profesoresPorCarrera: { [key: string]: any[] } = {}
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

      profesoresPorCarrera[carrera.id] = (profesores || []).map((p: any) =>
        mapProfesorFacultad(p, carrera.nombre, {
          activo: p.activo,
          materias_carrera: cursosCarrera || [],
          total_materias_carrera: cursosCarrera?.length || 0,
        })
      )
    }

    return {
      carreras: carreras.map((c) => ({
        id: c.id,
        nombre: c.nombre,
        total_profesores: profesoresPorCarrera[c.id]?.length || 0,
      })),
      profesores_por_carrera: profesoresPorCarrera,
      total_profesores: Object.values(profesoresPorCarrera).flat().length,
    }
  }

  async getFaculty() {
    let carreras: any[] = []
    try {
      carreras = await listCarrerasActivas({ activo: true, activa: true })
    } catch (carrerasError) {
      throw internal('Error obteniendo carreras', carrerasError)
    }

    const profesoresPorCarrera: { [key: string]: any[] } = {}
    for (const carrera of carreras) {
      try {
        const profesores = await teachersRepository.listByCareerDetailed(carrera.id)
        profesoresPorCarrera[carrera.id] = (profesores || []).map((p: any) =>
          mapProfesorFacultad(p, carrera.nombre, {
            departamento: 'Sin departamento',
            activo: p.activo,
          })
        )
      } catch {
        profesoresPorCarrera[carrera.id] = []
      }
    }

    return {
      carreras: carreras.map((c) => ({
        id: c.id,
        nombre: c.nombre,
        total_profesores: profesoresPorCarrera[c.id]?.length || 0,
      })),
      profesores_por_carrera: profesoresPorCarrera,
      total_profesores: Object.values(profesoresPorCarrera).flat().length,
    }
  }

  async getAllFaculty() {
    let profesBase: any[] = []
    try {
      profesBase = await teachersRepository.listActiveWithUsuario()
    } catch (profesErr) {
      throw internal('Error obteniendo profesores', profesErr)
    }

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

    return (profesBase || []).map((p: any) => {
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
        activo: p.activo,
      }
    })
  }

  async debugGroups(profesorId: string, courseId: string) {
    let profesor: any[] = []
    try {
      profesor = await teachersRepository.listActiveById(profesorId)
    } catch {
      throw internal('Error consultando profesor')
    }

    let curso: any[] = []
    try {
      curso = await academicRepository.listCursosByIds([courseId], 'id, nombre, codigo, carrera_id')
    } catch {
      throw internal('Error consultando curso')
    }

    let asignaciones: any[] = []
    try {
      asignaciones = await academicRepository.listAsignacionesByProfesorAndCursoAll(profesorId, courseId)
    } catch {
      asignaciones = []
    }

    let grupos: any[] = []
    try {
      grupos = await academicRepository.listGruposByCurso(courseId)
    } catch {
      throw internal('Error consultando grupos')
    }

    let todosLosGrupos: any[] = []
    try {
      todosLosGrupos = await academicRepository.listGruposSample(10)
    } catch {
      todosLosGrupos = []
    }

    return {
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
        totalGruposEnDB: todosLosGrupos?.length || 0,
      },
    }
  }

  async debugAssignments(careerId: string) {
    let profesores: any[] = []
    try {
      profesores = await teachersRepository.listByCareerDetailed(careerId)
    } catch {
      throw internal('Error consultando profesores')
    }

    const profesorIds = profesores?.map((p: any) => p.id) || []
    let asignaciones: any[] = []
    try {
      asignaciones = await academicRepository.listAsignacionesConCursos(profesorIds)
    } catch {
      throw internal('Error consultando asignaciones')
    }

    let cursos: any[] = []
    try {
      cursos = await academicRepository.listCursosByCareer(careerId, 'id, nombre, codigo, carrera_id')
    } catch {
      throw internal('Error consultando cursos')
    }

    return {
      profesores: profesores || [],
      asignaciones: asignaciones || [],
      cursos: cursos || [],
      summary: {
        totalProfesores: profesores?.length || 0,
        totalAsignaciones: asignaciones?.length || 0,
        totalCursos: cursos?.length || 0,
      },
    }
  }

  async listCareers() {
    try {
      return (
        (await academicRepository.listCarreras('id, nombre, facultad_id, activa', {
          activa: true,
          orderByNombre: true,
        })) || []
      )
    } catch (error) {
      throw internal('Error obteniendo carreras', error)
    }
  }

  async listCoursesByTeacher(user: { id: string; roles?: string[]; tipo_usuario?: string }, teacherId: string) {
    const isOwnProfile = user.id === teacherId
    const isCoordinator = user.roles?.includes('coordinador') || user.tipo_usuario === 'coordinador'
    if (!isOwnProfile && !isCoordinator) {
      throw forbidden('Acceso denegado. Solo puedes ver tus propios cursos.')
    }

    let profesor: any
    try {
      profesor = await teachersRepository.findActiveByUsuarioId(teacherId)
    } catch (profesorError) {
      throw internal('Error obteniendo información del profesor', profesorError)
    }
    if (!profesor) return []

    let asignaciones: any[] = []
    try {
      asignaciones = await academicRepository.listAsignacionesConCursoCarrera(profesor.id)
    } catch (asignError) {
      throw internal('Error obteniendo cursos del profesor', asignError)
    }

    return (asignaciones || [])
      .filter((asig: any) => asig.cursos && asig.cursos.activo)
      .map((asig: any) => ({
        id: asig.cursos.id,
        nombre: asig.cursos.nombre,
        codigo: asig.cursos.codigo,
        creditos: asig.cursos.creditos,
        descripcion: asig.cursos.descripcion,
        carrera_id: asig.cursos.carrera_id,
        carrera: asig.cursos.carreras,
      }))
  }

  async getStudentEnrolledSubjects(usuarioId: string) {
    const empty = { materiasMatriculadas: [] as any[], total: 0 }
    let estudiante: any
    try {
      estudiante = await academicRepository.findEstudianteByUsuarioId(usuarioId)
    } catch {
      return empty
    }
    if (!estudiante) return empty

    let inscripciones: any[] = []
    try {
      inscripciones = await academicRepository.listInscripcionesDetalladas(estudiante.id)
    } catch {
      return empty
    }

    const materiasMatriculadas =
      inscripciones
        ?.map((inscripcion: any) => ({
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
              creditos: inscripcion.grupo?.curso?.creditos,
            },
            profesor: {
              id: inscripcion.grupo?.asignaciones_profesor?.[0]?.profesor?.id,
              nombre: `${inscripcion.grupo?.asignaciones_profesor?.[0]?.profesor?.usuario?.nombre || ''} ${inscripcion.grupo?.asignaciones_profesor?.[0]?.profesor?.usuario?.apellido || ''}`.trim(),
            },
            periodo: {
              id: inscripcion.grupo?.periodo?.id,
              nombre: inscripcion.grupo?.periodo?.nombre,
              codigo: inscripcion.grupo?.periodo?.codigo,
            },
          },
        }))
        .filter((materia: any) => materia.grupo?.curso?.id) || []

    return { materiasMatriculadas, total: materiasMatriculadas.length }
  }

  async getTeacherCourses(teacherId: string) {
    let cursos: any[] = []
    try {
      cursos = await academicRepository.listAsignacionesConCursoGrupo(teacherId)
    } catch (cursosError: any) {
      throw internal('Error al obtener cursos del profesor', cursosError?.message ?? cursosError)
    }

    return (
      cursos
        ?.map((asignacion: any) => ({
          id: asignacion.id,
          curso: {
            id: asignacion.curso?.id,
            nombre: asignacion.curso?.nombre,
            codigo: asignacion.curso?.codigo,
            creditos: asignacion.curso?.creditos,
          },
          grupo: {
            id: asignacion.grupo?.id,
            numeroGrupo: asignacion.grupo?.numero_grupo,
            horario: asignacion.grupo?.horario,
            aula: asignacion.grupo?.aula,
            periodo: {
              id: asignacion.grupo?.periodo?.id,
              nombre: asignacion.grupo?.periodo?.nombre,
              codigo: asignacion.grupo?.periodo?.codigo,
            },
          },
        }))
        .filter((curso: any) => curso.curso?.id) || []
    )
  }

  async getTeacherId(usuarioId: string) {
    const profesor = await teachersRepository.findByUsuarioId(usuarioId)
    if (!profesor) {
      throw notFound('Profesor no encontrado')
    }
    return { teacherId: profesor.id }
  }

  async debugProfessors(user: { id: string; tipo_usuario?: string }) {
    let todosProfesores: any[] = []
    try {
      todosProfesores = await teachersRepository.listSample(10)
    } catch {
      todosProfesores = []
    }
    const { data: profesorEspecifico, error: profError } = await teachersRepository.findWithUsuario(
      '8c1f98db-6722-4aac-ad68-2a368b6324d4'
    )
    return {
      user: { id: user.id, tipo: user.tipo_usuario },
      todosProfesores: todosProfesores || [],
      profesorEspecifico: profesorEspecifico || null,
      error: profError,
    }
  }
}

export const teachersService = new TeachersService()
