import { Router } from 'express'
import { z } from 'zod'
import { SupabaseDB } from '../../config/supabase-only'
import { authenticateToken } from '../../middleware/auth'
import jwt from 'jsonwebtoken'
import { EvaluationRequest, EvaluationResponse } from '../../types/evaluationTypes'

const router = Router()

// ID de profesor: en muchas BD es entero (serial); en otras puede ser UUID.
const teacherIdSchema = z.union([
  z.string().uuid('ID de profesor inválido'),
  z
    .string()
    .regex(/^\d+$/, 'ID de profesor inválido')
    .refine((s) => parseInt(s, 10) > 0, 'ID de profesor inválido'),
])

const evaluationSchema = z.object({
  teacherId: teacherIdSchema,
  courseId: z.union([
    z.string().uuid('ID de curso inválido (UUID)'),
    z
      .string()
      .transform((val) => parseInt(val, 10))
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
      const { data: estudiante, error: estudianteError } = await SupabaseDB.supabaseAdmin
        .from('estudiantes')
        .select('id')
        .eq('usuario_id', user.id)
        .single()

      if (estudianteError) {
        console.error('Error obteniendo estudiante por usuario:', estudianteError)
        return res.status(500).json({ error: 'DB estudiantes', details: estudianteError })
      }
      if (!estudiante) {
        // El usuario no tiene registro en estudiantes; no hay profesores que mostrar
        return res.json([])
      }

      const { data: inscripciones, error: inscError } = await SupabaseDB.supabaseAdmin
        .from('inscripciones')
        .select('grupo_id')
        .eq('estudiante_id', estudiante.id)
        .eq('activa', true)

      if (inscError) {
        console.error('Error consultando inscripciones:', inscError)
        return res.status(500).json({ error: 'DB inscripciones', details: inscError })
      }

      const grupoIds = Array.from(new Set((inscripciones || []).map((i: any) => i.grupo_id).filter(Boolean)))
      if (grupoIds.length > 0) {
        // Algunos esquemas usan 'asignacion_profesor_id' en lugar de 'profesor_id'
        // Algunos esquemas no tienen profesor_id/asignacion_profesor_id en grupos. Intentar con ambos y hacer fallback.
        let gruposDeConsulta: any[] = []
        let gruposError: any = null
        try {
          const respGrupos = await SupabaseDB.supabaseAdmin
            .from('grupos')
            .select('id, curso_id, profesor_id, asignacion_profesor_id')
            .in('id', grupoIds)
          gruposDeConsulta = respGrupos.data || []
          gruposError = respGrupos.error || null
        } catch (e) {
          gruposError = e
        }

        // Fallback cuando alguna de las columnas no existe
        if (gruposError && (gruposError.code === '42703' || String(gruposError?.message || '').includes('column') )) {
          try {
            const respGruposFallback = await SupabaseDB.supabaseAdmin
              .from('grupos')
              .select('id, curso_id')
              .in('id', grupoIds)
            gruposDeConsulta = respGruposFallback.data || []
            gruposError = respGruposFallback.error || null
          } catch (e2) {
            gruposError = e2
          }
        }

        if (gruposError) {
          console.error('Error consultando grupos:', gruposError)
          return res.status(500).json({ error: 'DB grupos', details: gruposError })
        }
        gruposDeEstudiante = gruposDeConsulta || []

        // Si los grupos no traen profesor, resolver mediante asignaciones por grupo
        const necesitaResolverProfesor = gruposDeEstudiante.some((g: any) => !g.profesor_id)
        if (necesitaResolverProfesor && grupoIds.length > 0) {
          let asignacionesPorGrupo: any[] = []
          let asignErr: any = null
          try {
            const respA = await SupabaseDB.supabaseAdmin
              .from('asignaciones_profesor')
              .select('id, grupo_id, profesor_id, curso_id')
              .in('grupo_id', grupoIds)
            asignacionesPorGrupo = respA.data || []
            asignErr = respA.error || null
          } catch (e) {
            asignErr = e
          }

          if (asignErr) {
            // Fallback a cursos_profesor
            try {
              const respB = await SupabaseDB.supabaseAdmin
                .from('cursos_profesor')
                .select('id, grupo_id, profesor_id, curso_id')
                .in('grupo_id', grupoIds)
              asignacionesPorGrupo = respB.data || []
              asignErr = respB.error || null
            } catch (e2) {
              asignErr = e2
            }
          }

          if (!asignErr && asignacionesPorGrupo.length > 0) {
            const asigByGrupo = new Map(asignacionesPorGrupo.map((a: any) => [a.grupo_id, a]))
            gruposDeEstudiante = gruposDeEstudiante.map((g: any) => {
              const a = asigByGrupo.get(g.id)
              if (a) {
                return { ...g, profesor_id: a.profesor_id, curso_id: g.curso_id || a.curso_id }
              }
              return g
            })
          }
        }

        // Si no hay profesor_id directo, resolverlo via asignaciones_profesor
        const asignacionIds = Array.from(new Set(gruposDeEstudiante.map((g: any) => g.asignacion_profesor_id).filter(Boolean)))
        let asignacionById = new Map<string, any>()
        if (asignacionIds.length > 0) {
          const { data: asigns, error: asgErr } = await SupabaseDB.supabaseAdmin
            .from('asignaciones_profesor')
            .select('id, profesor_id, curso_id')
            .in('id', asignacionIds)
          if (asgErr) {
            console.error('Error consultando asignaciones para grupos:', asgErr)
            return res.status(500).json({ error: 'DB asignaciones_profesor', details: asgErr })
          }
          asignacionById = new Map((asigns || []).map((a: any) => [a.id, a]))
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

        profesorIdsFiltro = Array.from(new Set(gruposDeEstudiante.map((g: any) => g.profesor_id).filter(Boolean)))
      } else {
        // Sin inscripciones => devolver lista vacía
        return res.json([])
      }
    }
    // 1) Traer profesores + usuario relacionado (sin joins adicionales)
    let queryProfes = SupabaseDB.supabaseAdmin
      .from('profesores')
      .select(`
        *,
        usuario:usuarios(
          id,
          nombre,
          apellido,
          email,
          activo
        )
      `)
      .eq('activo', true)

    if (profesorIdsFiltro && profesorIdsFiltro.length > 0) {
      queryProfes = queryProfes.in('id', profesorIdsFiltro)
    }

    const { data: profesores, error: profesoresError } = await queryProfes

    if (profesoresError) {
      console.error('Error consultando profesores:', profesoresError)
      return res.status(500).json({ error: 'DB profesores', details: profesoresError })
    }

    const profesorIds = (profesores || []).map((p: any) => p.id)

    // 2) Traer asignaciones y cursos por separado y combinarlos
    // Intento 1: tabla asignaciones_profesor (nombre preferido)
    let asignaciones: any[] = []
    let asignacionesError: any = null
    try {
      const resp = await SupabaseDB.supabaseAdmin
        .from('asignaciones_profesor')
        .select('*')
        .in('profesor_id', profesorIds.length ? profesorIds : ['00000000-0000-0000-0000-000000000000'])
      asignaciones = resp.data || []
      asignacionesError = resp.error || null
    } catch (e) {
      asignacionesError = e
    }

    // Fallback: algunas bases usan cursos_profesor con mismas columnas clave
    if (asignacionesError) {
      console.warn('Fallo con asignaciones_profesor; intentando cursos_profesor. Detalle:', asignacionesError)
      try {
        const respFallback = await SupabaseDB.supabaseAdmin
          .from('cursos_profesor')
          .select('*')
          .in('profesor_id', profesorIds.length ? profesorIds : ['00000000-0000-0000-0000-000000000000'])
        asignaciones = respFallback.data || []
        asignacionesError = respFallback.error || null
      } catch (e2) {
        asignacionesError = e2
      }
    }

    if (asignacionesError) {
      console.error('Error consultando asignaciones (ambos nombres):', asignacionesError)
      return res.status(500).json({ error: 'DB asignaciones', details: asignacionesError })
    }

    // Normalizar posibles variantes de nombres de columnas
    asignaciones = (asignaciones || []).map((a: any) => ({
      ...a,
      profesor_id: a.profesor_id ?? a.docente_id ?? a.teacher_id ?? a.profesor ?? null,
      curso_id: Number(a.curso_id ?? a.id_curso ?? a.course_id ?? a.curso ?? null)
    }))

    // Traer grupos para mapearlos por curso y profesor (para usuarios no-estudiante)
    const grupoIdsAsignados = Array.from(new Set((asignaciones || []).map((a: any) => a.grupo_id).filter(Boolean)))
    let gruposPorAsignaciones: any[] = []
    if (grupoIdsAsignados.length > 0) {
      const { data: gruposAll, error: gruposAllError } = await SupabaseDB.supabaseAdmin
        .from('grupos')
        .select('id, curso_id, numero_grupo, horario, aula')
        .in('id', grupoIdsAsignados)
      if (gruposAllError) {
        console.warn('Advertencia: no se pudieron cargar grupos por asignaciones:', gruposAllError)
      } else {
        gruposPorAsignaciones = gruposAll || []
      }
    }

    let cursos: any[] = []
    let tieneCarreraId = true

    // 3) Traer carreras para mapear departamento (según carrera_id)
    let carreras: any[] = []
    if (tieneCarreraId) {
      const carreraIds = Array.from(
        new Set(cursos.map((c: any) => c.carrera_id).filter((id: any) => id !== null && id !== undefined))
      )
      if (carreraIds.length > 0) {
        const { data: carrerasData, error: carrerasError } = await SupabaseDB.supabaseAdmin
          .from('carreras')
          .select('id, nombre')
          .in('id', carreraIds)
        if (carrerasError) {
          console.error('Error consultando carreras:', carrerasError)
          return res.status(500).json({ error: 'DB carreras', details: carrerasError })
        }
        carreras = carrerasData || []
      }
    }

    const cursoIds = Array.from(new Set((asignaciones || []).map((a: any) => a.curso_id).filter((id: any) => id !== null && id !== undefined)))
    console.log('🔍 Curso IDs from asignaciones:', cursoIds);
    
    if (cursoIds.length > 0 && cursos.length === 0) {
      // Cargar cursos solo con las columnas seguras si aún no se han cargado
      try {
        const respCursos = await SupabaseDB.supabaseAdmin
          .from('cursos')
          .select('id, nombre, codigo, creditos, descripcion')
          .in('id', cursoIds)
        cursos = respCursos.data || []
        console.log('🔍 Cursos loaded:', cursos);
      } catch (e) {
        console.warn('No fue posible cargar cursos por ids:', e)
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
      
      console.log(`🔍 Processing profesor ${nombre} ${apellido} (${profesor.id})`);
      console.log(`🔍 Asignaciones:`, asignacionesDeProfesor);
      
      const courses = asignacionesDeProfesor.map((a: any) => {
        const c = cursoById.get(a.curso_id)
        console.log(`🔍 Course for curso_id ${a.curso_id}:`, c);
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

      console.log(`✅ Final courses for ${nombre}:`, courses);

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
    console.error('Error al obtener profesores:', error)
    res.status(500).json({ error: 'Error interno del servidor', details: (error as any)?.message || String(error) })
  }
})

// GET /teachers/:profesorId/courses/:courseId/groups - Obtener grupos de un curso específico

router.get('/:profesorId/courses/:courseId/groups', authenticateToken, async (req: any, res) => {
  try {
    const { profesorId, courseId } = req.params
    const user = req.user

    console.log('🔍 Backend: Getting groups for profesorId:', profesorId, 'courseId:', courseId);
    console.log('🔍 Backend: User type:', user?.tipo_usuario);

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

    // Buscar grupos del curso Y del profesor específico
    const numericCourseId = Number(courseId)
    // Buscar primero en asignaciones_profesor (es la fuente que relaciona profesor-curso-grupo)
    const { data: asigns, error: asignsErr } = await SupabaseDB.supabaseAdmin
      .from('asignaciones_profesor')
      .select('id, profesor_id, curso_id, grupo_id, activa')
      .eq('profesor_id', profesorId)
      .eq('curso_id', isNaN(numericCourseId) ? courseId : numericCourseId)
      .eq('activa', true)
    if (asignsErr) {
      console.error('❌ Backend: Error consultando asignaciones_profesor:', asignsErr)
      return res.status(500).json({ error: 'Error consultando asignaciones', details: asignsErr })
    }
    let gruposFinal: any[] = []
    if (Array.isArray(asigns) && asigns.length > 0) {
      const grupoIds = Array.from(new Set((asigns || []).map((a: any) => a.grupo_id).filter(Boolean)))
      console.log('🔍 grupoIds desde asignaciones_profesor:', grupoIds)
      if (grupoIds.length > 0) {
        const { data: gruposPorAsign, error: gruposAsignErr } = await SupabaseDB.supabaseAdmin
          .from('grupos')
          .select('id, numero_grupo, horario, aula, curso_id')
          .in('id', grupoIds)
        if (gruposAsignErr) {
          console.error('❌ Backend: Error consultando grupos por ids:', gruposAsignErr)
          return res.status(500).json({ error: 'Error consultando grupos', details: gruposAsignErr })
        }
        gruposFinal = gruposPorAsign || []
      }
    }

    if (!gruposFinal || gruposFinal.length === 0) {
      // Intentar también por usuario_id si el esquema de grupos usa usuario_id en profesor_id
      console.log('⚠️ No hay grupos por profesor_id (profesores.id). Intentando por usuario_id del profesor...')
      const { data: profRow, error: profErr } = await SupabaseDB.supabaseAdmin
        .from('profesores')
        .select('usuario_id')
        .eq('id', profesorId)
        .single()
      if (!profErr && profRow?.usuario_id) {
        const { data: gruposPorUsuario, error: gruposUsuarioErr } = await SupabaseDB.supabaseAdmin
          .from('grupos')
          .select('id, numero_grupo, horario, aula, curso_id, profesor_id')
          .eq('curso_id', isNaN(numericCourseId) ? courseId : numericCourseId)
          .eq('profesor_id', profRow.usuario_id)
        if (!gruposUsuarioErr && gruposPorUsuario?.length) {
          console.log('✅ Encontrados grupos usando usuario_id del profesor')
          gruposFinal = gruposPorUsuario
        }
      }
    }

    if (!gruposFinal || gruposFinal.length === 0) {
      console.log('⚠️ No hay grupos para el profesor en este curso. Buscando grupos del curso en general...')
      const { data: gruposPorCurso, error: gruposCursoError } = await SupabaseDB.supabaseAdmin
        .from('grupos')
        .select('id, numero_grupo, horario, aula, curso_id')
        .eq('curso_id', isNaN(numericCourseId) ? courseId : numericCourseId)
      if (gruposCursoError) {
        console.error('❌ Backend: Error consultando grupos por curso:', gruposCursoError)
        return res.status(500).json({ error: 'Error consultando grupos del curso', details: gruposCursoError })
      }
      gruposFinal = gruposPorCurso || []
    }

    console.log('🔍 Backend: Final groups to return:', gruposFinal);
    res.json(gruposFinal)
  } catch (error) {
    console.error('❌ Backend: Error al obtener grupos del curso:', error)
    console.error('❌ Backend: Error stack:', (error as any)?.stack)
    res.status(500).json({ error: 'Error interno del servidor', details: (error as any)?.message || String(error) })
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
    const numericCourseId = typeof courseId === 'string' ? parseInt(courseId, 10) : courseId

    console.log('🔍 Backend: Saving evaluation:', {
      teacherId,
      courseId: numericCourseId,
      groupId,
      studentId: user.id,
      userType: user.tipo_usuario,
      overallRating,
      answersCount: answers?.length || 0
    });

    // Verificar que el usuario es un estudiante
    if (user.tipo_usuario !== 'estudiante') {
      console.log('❌ Backend: User is not a student:', user.tipo_usuario);
      return res.status(403).json({ error: 'Solo los estudiantes pueden realizar evaluaciones' })
    }

    // Obtener el ID del estudiante
    console.log('🔍 Backend: Looking for student with usuario_id:', user.id);
    const { data: estudiante, error: estudianteError } = await SupabaseDB.supabaseAdmin
      .from('estudiantes')
      .select('id')
      .eq('usuario_id', user.id)
      .single()

    if (estudianteError) {
      console.log('❌ Backend: Error finding student:', estudianteError);
      return res.status(404).json({ error: 'Error al buscar el estudiante', details: estudianteError.message })
    }

    if (!estudiante) {
      console.log('❌ Backend: Student not found for user:', user.id);
      return res.status(404).json({ error: 'Estudiante no encontrado' })
    }

    console.log('✅ Backend: Estudiante found:', estudiante);

    // Verificar que no haya una evaluación previa para este profesor y grupo
    const { data: existingEvaluation, error: existingError } = await SupabaseDB.supabaseAdmin
      .from('evaluaciones')
      .select('id')
      .eq('profesor_id', teacherId)
      .eq('estudiante_id', estudiante.id)
      .eq('grupo_id', groupId || 1)
      .eq('periodo_id', 1)
      .maybeSingle()

    if (existingEvaluation) {
      console.log('❌ Backend: Evaluation already exists');
      return res.status(409).json({ error: 'Ya has evaluado a este profesor para este curso y grupo' })
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

    console.log('🔍 Backend: Inserting evaluation with data:', evaluationData);
    const { data: evaluacion, error: evaluacionError } = await SupabaseDB.supabaseAdmin
      .from('evaluaciones')
      .insert(evaluationData)
      .select('id')
      .single()

    if (evaluacionError) {
      console.error('❌ Backend: Error creating evaluation:', evaluacionError);
      console.error('❌ Backend: Evaluation data that failed:', evaluationData);
      return res.status(500).json({ error: 'Error al guardar la evaluación', details: evaluacionError.message })
    }

    console.log('✅ Backend: Evaluation created:', evaluacion);

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
        const { error: respuestasError } = await SupabaseDB.supabaseAdmin
          .from('respuestas_evaluacion')
          .insert(respuestasData)

        if (respuestasError) {
          console.error('❌ Backend: Error saving answers:', respuestasError);
          // No fallar la operación completa si solo fallan las respuestas individuales
        } else {
          console.log('✅ Backend: Answers saved successfully:', respuestasData.length, 'responses');
        }
      }
    }

    console.log('✅ Backend: Evaluation saved successfully');
    res.json({ 
      success: true, 
      message: 'Evaluación guardada exitosamente',
      evaluationId: evaluacion.id
    })
  } catch (error) {
    // Manejo específico de errores de validación Zod
    if (error instanceof z.ZodError) {
      console.log('❌ Backend: Validation error:', error.errors);
      return res.status(400).json({ 
        error: 'Datos de evaluación inválidos', 
        details: error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message
        }))
      })
    }
    
    console.error('❌ Backend: Error al guardar evaluación:', error)
    console.error('❌ Backend: Error stack:', (error as any)?.stack)
    res.status(500).json({ error: 'Error interno del servidor', details: (error as any)?.message || String(error) })
  }
})

// GET /teachers/evaluation-questions/:courseId - Obtener preguntas de evaluación por curso (basado en código del curso)

router.get('/evaluation-questions/:courseId', authenticateToken, async (req: any, res) => {
  try {
    const { courseId } = req.params
    const user = req.user

    console.log('🔍 Backend: Getting evaluation questions for courseId:', courseId);

    // Verificar que el usuario es un estudiante
    if (user.tipo_usuario !== 'estudiante') {
      return res.status(403).json({ error: 'Solo los estudiantes pueden acceder a las preguntas de evaluación' })
    }

    // Obtener información del curso para determinar la carrera
    const { data: curso, error: cursoError } = await SupabaseDB.supabaseAdmin
      .from('cursos')
      .select('id, codigo, nombre')
      .eq('id', courseId)
      .single()

    if (cursoError || !curso) {
      console.log('❌ Backend: Curso not found:', cursoError);
      return res.status(404).json({ error: 'Curso no encontrado' })
    }

    console.log('✅ Backend: Curso found:', curso);

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
      const { data: estudianteRow, error: estudianteError } = await SupabaseDB.supabaseAdmin
        .from('estudiantes')
        .select('carrera_id')
        .eq('usuario_id', user.id)
        .single()

      if (!estudianteError && estudianteRow?.carrera_id != null) {
        carreraId = Number(estudianteRow.carrera_id)
      }
    }

    console.log('🔍 Backend: Course code:', codigoCurso, '-> Career ID (resolved):', carreraId, '(fromCourseCode:', carreraIdFromCourseCode, ')');

    // Obtener preguntas específicas de la base de datos para esta carrera
    let query = SupabaseDB.supabaseAdmin
      .from('preguntas_evaluacion')
      .select(`
        id,
        texto_pregunta,
        tipo_pregunta,
        opciones,
        orden,
        categoria:categorias_pregunta(nombre)
      `)
      .eq('activa', true)
      .order('orden', { ascending: true });

    if (carreraId) {
      query = query.eq('id_carrera', carreraId);
    } else {
      query = query.is('id_carrera', null);
    }

    const { data: preguntasDB, error: preguntasError } = await query;

    if (preguntasError) {
      console.error('❌ Backend: Error obteniendo preguntas de la DB:', preguntasError);
      return res.status(500).json({ error: 'Error obteniendo preguntas de evaluación' })
    }

    // Si no hay preguntas específicas para esta carrera, obtener preguntas generales (sin carrera_id)
    let questions = preguntasDB || [];
    
    if (questions.length === 0 && carreraIdFromCourseCode) {
      console.log('⚠️ Backend: No hay preguntas específicas para carrera', carreraId, ', obteniendo preguntas generales...');
      
      const { data: preguntasGenerales, error: preguntasGeneralesError } = await SupabaseDB.supabaseAdmin
        .from('preguntas_evaluacion')
        .select(`
          id,
          texto_pregunta,
          tipo_pregunta,
          opciones,
          orden,
          categoria:categorias_pregunta(nombre)
        `)
        .is('id_carrera', null)
        .eq('activa', true)
        .order('orden', { ascending: true })

      if (preguntasGeneralesError) {
        console.error('❌ Backend: Error obteniendo preguntas generales:', preguntasGeneralesError);
        return res.status(500).json({ error: 'Error obteniendo preguntas de evaluación' })
      }

      questions = preguntasGenerales || [];
    }

    // Transformar las preguntas al formato esperado por el frontend
    const questionsFormatted = questions.map((pregunta: any) => ({
      id: pregunta.id.toString(),
      category: pregunta.categoria?.nombre || 'General',
      question: pregunta.texto_pregunta,
      type: pregunta.tipo_pregunta,
      options: pregunta.opciones
    }))

    console.log('✅ Backend: Questions found for course:', curso.nombre, 'Career ID:', carreraId, 'Count:', questionsFormatted.length);

    res.json({
      courseId: parseInt(courseId),
      courseCode: curso.codigo,
      courseName: curso.nombre,
      carreraId: carreraId != null ? Number(carreraId) : null,
      questions: questionsFormatted
    })

  } catch (error) {
    console.error('❌ Backend: Error getting evaluation questions:', error)
    res.status(500).json({ error: 'Error interno del servidor', details: (error as any)?.message || String(error) })
  }
})

// GET /teachers/student-info - Obtener información del estudiante actual

router.get('/student-info', authenticateToken, async (req: any, res) => {
  try {
    const user = req.user

    console.log('🔍 Backend: Getting student info for user:', user.id);

    // Verificar que el usuario es un estudiante
    if (user.tipo_usuario !== 'estudiante') {
      return res.status(403).json({ error: 'Solo los estudiantes pueden acceder a esta información' })
    }

    // Obtener información del estudiante
    const { data: estudiante, error: estudianteError } = await SupabaseDB.supabaseAdmin
      .from('estudiantes')
      .select(`
        id,
        carrera_id,
        carrera:carreras(id, nombre)
      `)
      .eq('usuario_id', user.id)
      .single()

    if (estudianteError || !estudiante) {
      console.log('❌ Backend: Estudiante not found:', estudianteError);
      return res.status(404).json({ error: 'Estudiante no encontrado' })
    }

    console.log('✅ Backend: Estudiante found:', estudiante);

    res.json({
      estudianteId: estudiante.id,
      carreraId: estudiante.carrera_id,
      carrera: estudiante.carrera
    })

  } catch (error) {
    console.error('❌ Backend: Error getting student info:', error)
    res.status(500).json({ error: 'Error interno del servidor', details: (error as any)?.message || String(error) })
  }
})

// GET /teachers/teacher-info - Obtener información del profesor actual

router.get('/teacher-info', authenticateToken, async (req: any, res) => {
  try {
    const user = req.user

    console.log('🔍 Backend: Getting teacher info for user:', user.id);
    console.log('🔍 Backend: User type:', user.tipo_usuario);

    // Verificar que el usuario es un profesor o coordinador (que puede ser profesor también)
    const canAccessAsTeacher = user.tipo_usuario === 'profesor' || 
                               user.tipo_usuario === 'docente' ||
                               user.tipo_usuario === 'coordinador';
    
    if (!canAccessAsTeacher) {
      return res.status(403).json({ error: 'Solo los profesores y coordinadores pueden acceder a esta información' })
    }

    // Obtener información del profesor
    const { data: profesor, error: profesorError } = await SupabaseDB.supabaseAdmin
      .from('profesores')
      .select(`
        id,
        carrera_id,
        carrera:carreras(id, nombre)
      `)
      .eq('usuario_id', user.id)
      .single()

    if (profesorError || !profesor) {
      console.log('❌ Backend: Profesor not found:', profesorError);
      return res.status(404).json({ error: 'Profesor no encontrado' })
    }

    console.log('✅ Backend: Profesor found:', profesor);

    res.json({
      profesorId: profesor.id,
      carreraId: profesor.carrera_id,
      carrera: profesor.carrera
    })

  } catch (error) {
    console.error('❌ Backend: Error getting teacher info:', error)
    res.status(500).json({ error: 'Error interno del servidor', details: (error as any)?.message || String(error) })
  }
})

// GET /teachers/survey-by-career/:careerId - Obtener encuesta por carrera

router.get('/survey-by-career/:careerId', authenticateToken, async (req: any, res) => {
  try {
    const user = req.user
    const { careerId } = req.params

    console.log('🔍 Backend: Getting survey for career:', careerId, 'for user:', user.id);

    // Verificar que el usuario es un profesor o coordinador (que puede ser profesor también)
    const canAccessAsTeacher = user.tipo_usuario === 'profesor' || 
                               user.tipo_usuario === 'docente' ||
                               user.tipo_usuario === 'coordinador';
    
    if (!canAccessAsTeacher) {
      return res.status(403).json({ error: 'Solo los profesores y coordinadores pueden acceder a esta información' })
    }

    // Obtener preguntas de la encuesta para la carrera específica
    let query = SupabaseDB.supabaseAdmin
      .from('preguntas_evaluacion')
      .select(`
        id,
        texto_pregunta,
        tipo_pregunta,
        opciones,
        orden,
        categoria:categorias_pregunta(nombre)
      `)
      .eq('activa', true)
      .order('orden', { ascending: true });

    if (careerId && careerId !== 'null') {
      query = query.eq('id_carrera', parseInt(careerId));
    } else {
      query = query.is('id_carrera', null);
    }

    const { data: preguntasDB, error: preguntasError } = await query;

    if (preguntasError) {
      console.error('❌ Backend: Error obteniendo preguntas de la DB:', preguntasError);
      return res.status(500).json({ error: 'Error obteniendo preguntas de evaluación' })
    }

    // Si no hay preguntas específicas para esta carrera, obtener preguntas generales
    let questions = preguntasDB || [];
    
    if (questions.length === 0 && careerId && careerId !== 'null') {
      console.log('⚠️ Backend: No hay preguntas específicas para carrera', careerId, ', obteniendo preguntas generales...');
      
      const { data: preguntasGenerales, error: preguntasGeneralesError } = await SupabaseDB.supabaseAdmin
        .from('preguntas_evaluacion')
        .select(`
          id,
          texto_pregunta,
          tipo_pregunta,
          opciones,
          orden,
          categoria:categorias_pregunta(nombre)
        `)
        .is('id_carrera', null)
        .eq('activa', true)
        .order('orden', { ascending: true })

      if (preguntasGeneralesError) {
        console.error('❌ Backend: Error obteniendo preguntas generales:', preguntasGeneralesError);
        return res.status(500).json({ error: 'Error obteniendo preguntas de evaluación' })
      }

      questions = preguntasGenerales || [];
    }

    // Obtener información de la carrera
    let carreraInfo = null;
    if (careerId && careerId !== 'null') {
      const { data: carreraData, error: carreraError } = await SupabaseDB.supabaseAdmin
        .from('carreras')
        .select('id, nombre')
        .eq('id', careerId)
        .single()

      if (!carreraError && carreraData) {
        carreraInfo = carreraData;
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

    console.log('✅ Backend: Survey questions found for career:', careerId, 'Count:', questionsFormatted.length);

    res.json({
      careerId: careerId ? parseInt(careerId) : null,
      career: carreraInfo,
      questions: questionsFormatted
    })

  } catch (error) {
    console.error('❌ Backend: Error getting survey by career:', error)
    res.status(500).json({ error: 'Error interno del servidor', details: (error as any)?.message || String(error) })
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
    console.log('🔍 Debug: User info from token:', user);

    // Buscar información completa del usuario
    const { data: usuarioCompleto, error: usuarioError } = await SupabaseDB.supabaseAdmin
      .from('usuarios')
      .select(`
        id,
        nombre,
        apellido,
        email,
        tipo_usuario,
        activo
      `)
      .eq('id', user.id)
      .single()

    if (usuarioError) {
      console.log('❌ Debug: Error getting user:', usuarioError);
      return res.status(500).json({ error: 'Error obteniendo usuario', details: usuarioError })
    }

    // Buscar si es profesor
    const { data: profesor, error: profesorError } = await SupabaseDB.supabaseAdmin
      .from('profesores')
      .select(`
        id,
        usuario_id,
        carrera_id,
            activa,
        carrera:carreras(id, nombre)
      `)
      .eq('usuario_id', user.id)
      .single()

    console.log('🔍 Debug: Profesor info:', profesor, 'Error:', profesorError);

    res.json({
      userFromToken: user,
      usuarioCompleto,
      profesor: profesor || null,
      profesorError: profesorError || null
    })

  } catch (error) {
    console.error('❌ Debug: Error:', error)
    res.status(500).json({ error: 'Error interno del servidor', details: (error as any)?.message || String(error) })
  }
})

// GET /teachers/debug-auth - Endpoint de debug para verificar autenticación

router.get('/debug-auth', async (req: any, res) => {
  try {
    const authHeader = req.headers['authorization']
    const token = authHeader && authHeader.split(' ')[1]
    
    console.log('🔍 Debug Auth: Auth header:', authHeader);
    console.log('🔍 Debug Auth: Token:', token ? 'Present' : 'Missing');

    if (!token) {
      return res.status(401).json({ 
        error: 'No token provided',
        authHeader: authHeader,
        hasToken: false
      })
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any
      console.log('🔍 Debug Auth: Decoded token:', decoded);

      // Buscar usuario directamente
      const { data: user, error: userError } = await SupabaseDB.supabaseAdmin
        .from('usuarios')
        .select(`
          id,
          nombre,
          apellido,
          email,
          tipo_usuario,
          activo
        `)
        .eq('id', decoded.userId)
        .single()

      console.log('🔍 Debug Auth: User from DB:', user, 'Error:', userError);

      res.json({
        tokenPresent: true,
        decodedToken: decoded,
        userFromDB: user,
        userError: userError,
        authHeader: authHeader
      })

    } catch (jwtError) {
      console.log('❌ Debug Auth: JWT Error:', jwtError);
      res.status(401).json({ 
        error: 'Invalid token',
        jwtError: jwtError,
        token: token
      })
    }

  } catch (error) {
    console.error('❌ Debug Auth: Error:', error)
    res.status(500).json({ error: 'Error interno del servidor', details: (error as any)?.message || String(error) })
  }
})

// GET /teachers/by-career/:careerId - Obtener profesores por carrera (para coordinadores)

router.get('/by-career/:careerId', authenticateToken, async (req: any, res) => {
  try {
    const user = req.user
    const { careerId } = req.params

    console.log('🔍 [/teachers/by-career] Request received', { userId: user?.id, careerId })

    // Verificar que el usuario sea coordinador o decano
    if (!user.roles?.includes('coordinador') && !user.roles?.includes('decano') && user.tipo_usuario !== 'coordinador') {
      return res.status(403).json({ error: 'Acceso denegado. Solo coordinadores y decanos pueden ver esta información.' })
    }

    // 1) Traer profesores activos de la carrera directamente por columna profesores.carrera_id
    const { data: profesBase, error: profesErr } = await SupabaseDB.supabaseAdmin
      .from('profesores')
      .select(`
        id,
        usuario_id,
        activo,
        codigo_profesor,
        carrera_id,
        usuarios:usuarios(
          id,
          nombre,
          apellido,
          email,
          activo
        )
      `)
      .eq('activo', true)
      .eq('usuarios.activo', true)
      .eq('carrera_id', careerId)

    if (profesErr) {
      console.error('Error consultando profesores por carrera_id:', profesErr)
      return res.status(500).json({ error: 'Error obteniendo profesores por carrera', details: profesErr })
    }

    console.log(`🔎 Profesores base encontrados para carrera ${careerId}:`, profesBase?.length || 0)
    console.log('🔍 Profesores encontrados:', profesBase?.map((p: any) => ({
      id: p.id,
      nombre: p.usuarios?.nombre,
      apellido: p.usuarios?.apellido,
      carrera_id: p.carrera_id
    })))

    const profesorIds = (profesBase || []).map((p: any) => p.id)
    console.log('🔍 IDs de profesores para buscar asignaciones:', profesorIds)

    // 2) Buscar asignaciones por profesor_id en la tabla correcta
    let asignaciones: any[] = []
    try {
      console.log('🔍 Buscando asignaciones por profesor_id:', profesorIds)
      
      // Intentar primero con asignaciones_profesor
      let resp = await SupabaseDB.supabaseAdmin
        .from('asignaciones_profesor')
        .select('id, profesor_id, curso_id, activa')
        .in('profesor_id', profesorIds.length ? profesorIds : ['00000000-0000-0000-0000-000000000000'])
        .eq('activa', true)
      
      console.log('🔍 Respuesta de asignaciones_profesor:', resp)
      
      if (resp.error || !resp.data || resp.data.length === 0) {
        console.log('🔍 No hay datos en asignaciones_profesor para estos profesores')
        asignaciones = []
      } else {
        asignaciones = resp.data.map((item: any) => ({
          ...item,
          periodo_academico: null, // asignaciones_profesor no tiene periodo_academico
          activa: true
        }))
      }
      
      console.log('🔍 Error de asignaciones:', resp.error)
    } catch (e) {
      console.error('❌ Error en consulta de asignaciones:', e)
      // Si falla, continuar sin cursos
      asignaciones = []
    }

    console.log('🔎 Asignaciones cargadas:', asignaciones?.length || 0)
    console.log('🔎 Asignaciones encontradas:', asignaciones?.map(a => ({ profesor_id: a.profesor_id, curso_id: a.curso_id })))

    const cursoIds = Array.from(new Set((asignaciones || []).map((a: any) => a.curso_id).filter(Boolean)))
    console.log('🔍 IDs de cursos extraídos de asignaciones:', cursoIds)
    
    let cursos: any[] = []
    if (cursoIds.length > 0) {
      console.log('🔍 Buscando cursos específicos de asignaciones...')
      const { data: cursosData, error: cursosErr } = await SupabaseDB.supabaseAdmin
        .from('cursos')
        .select('id, nombre, codigo, carrera_id')
        .in('id', cursoIds)
      console.log('🔍 Respuesta de cursos específicos:', { data: cursosData, error: cursosErr })
      if (!cursosErr) cursos = cursosData || []
      console.log('🔎 Cursos encontrados de asignaciones:', cursos?.length || 0)
      console.log('🔎 Cursos encontrados:', cursos?.map(c => ({ id: c.id, nombre: c.nombre, carrera_id: c.carrera_id })))
    } else {
      console.log('⚠️ No hay cursoIds de asignaciones; no se cargarán cursos adicionales. Se mostrará vacío para no exponer materias no asignadas.')
      cursos = []
    }
    console.log('🔎 Cursos filtrados por carrera cargados:', cursos?.length || 0)
    const cursoById = new Map((cursos || []).map((c: any) => [c.id, c]))

    // Cargar nombre de la carrera para enriquecer "department"
    let carreraNombre: string | null = null
    try {
      const { data: carreraData } = await SupabaseDB.supabaseAdmin
        .from('carreras')
        .select('id,nombre')
        .eq('id', careerId)
        .single()
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
      console.log(`🔍 DEBUG: Profesor ${p.id} (${p.usuarios?.nombre}) - asignaciones:`, asigns)
      
      // Obtener cursos de las asignaciones
      const cursosDeAsignaciones = asigns
        .map((a: any) => {
          const curso = cursoById.get(a.curso_id)
          console.log(`🔍 DEBUG: curso_id: ${a.curso_id}, curso encontrado:`, curso)
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
      
      console.log(`🔍 DEBUG: cursosProf final para ${p.usuarios?.nombre}:`, cursosProf)
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

    console.log(`✅ Respuesta profesores por carrera ${careerId}:`, { profesores: result.length })
    res.json(result)
  } catch (error) {
    console.error('❌ Error en /teachers/by-career:', error)
    res.status(500).json({ error: 'Error interno del servidor' })
  }
})

// GET /teachers/professor-subjects - Obtener materias específicas de cada profesor

router.get('/professor-subjects', authenticateToken, async (req: any, res) => {
  try {
    const user = req.user

    console.log('🔍 [/teachers/professor-subjects] Request received', { userId: user?.id })

    // Verificar que el usuario sea decano
    if (!user.roles?.includes('decano')) {
      return res.status(403).json({ error: 'Acceso denegado. Solo el decano puede ver las materias de los profesores.' })
    }

    // Obtener todas las carreras activas (excluyendo tronco común)
    const { data: carreras, error: carrerasError } = await SupabaseDB.supabaseAdmin
      .from('carreras')
      .select('id, nombre')
      .eq('activa', true)
      .not('nombre', 'ilike', '%tronco común%')
      .not('nombre', 'ilike', '%tronco comun%')
      .order('nombre')

    if (carrerasError) {
      console.error('Error consultando carreras:', carrerasError)
      return res.status(500).json({ error: 'Error obteniendo carreras', details: carrerasError })
    }

    // Obtener profesores de cada carrera con sus materias específicas
    const profesoresPorCarrera: {[key: string]: any[]} = {}
    
    for (const carrera of carreras) {
      const { data: profesores, error: profesoresError } = await SupabaseDB.supabaseAdmin
        .from('profesores')
        .select(`
          id,
          usuario_id,
          activo,
          codigo_profesor,
          carrera_id,
          usuarios:usuarios(
            id,
            nombre,
            apellido,
            email,
            activo
          ),
          asignaciones_profesor:asignaciones_profesor(
            curso_id,
            activa,
            cursos:cursos(
              id,
              nombre,
              codigo,
              creditos,
              activo
            )
          )
        `)
        .eq('activo', true)
        .eq('usuarios.activo', true)
        .eq('carrera_id', carrera.id)
        .eq('asignaciones_profesor.activa', true)

      if (profesoresError) {
        console.error(`Error consultando profesores para carrera ${carrera.id}:`, profesoresError)
        profesoresPorCarrera[carrera.id] = []
      } else {
        // Mapear profesores con sus materias específicas
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
          materias_asignadas: (p.asignaciones_profesor || [])
            .filter((asig: any) => asig.cursos && asig.cursos.activo)
            .map((asig: any) => ({
              id: asig.cursos.id,
              nombre: asig.cursos.nombre,
              codigo: asig.cursos.codigo,
              creditos: asig.cursos.creditos
            })),
          total_materias_asignadas: (p.asignaciones_profesor || [])
            .filter((asig: any) => asig.cursos && asig.cursos.activo).length
        }))

        profesoresPorCarrera[carrera.id] = profesoresConMaterias
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

    console.log(`✅ Respuesta materias específicas de profesores:`, { 
      carreras: result.carreras.length, 
      total_profesores: result.total_profesores 
    })
    res.json(result)
  } catch (error) {
    console.error('❌ Error en /teachers/professor-subjects:', error)
    res.status(500).json({ error: 'Error interno del servidor' })
  }
})

// GET /teachers/career-subjects - Obtener materias de cada carrera

router.get('/career-subjects', authenticateToken, async (req: any, res) => {
  try {
    const user = req.user

    console.log('🔍 [/teachers/career-subjects] Request received', { userId: user?.id })

    // Verificar que el usuario sea decano
    if (!user.roles?.includes('decano')) {
      return res.status(403).json({ error: 'Acceso denegado. Solo el decano puede ver las materias de las carreras.' })
    }

    // Obtener todas las carreras activas (excluyendo tronco común)
    const { data: carreras, error: carrerasError } = await SupabaseDB.supabaseAdmin
      .from('carreras')
      .select('id, nombre')
      .eq('activa', true)
      .not('nombre', 'ilike', '%tronco común%')
      .not('nombre', 'ilike', '%tronco comun%')
      .order('nombre')

    if (carrerasError) {
      console.error('Error consultando carreras:', carrerasError)
      return res.status(500).json({ error: 'Error obteniendo carreras', details: carrerasError })
    }

    // Obtener materias de cada carrera
    const materiasPorCarrera: {[key: string]: any[]} = {}
    
    for (const carrera of carreras) {
      const { data: cursos, error: cursosError } = await SupabaseDB.supabaseAdmin
        .from('cursos')
        .select(`
          id,
          nombre,
          codigo,
          creditos,
          descripcion,
          activo
        `)
        .eq('carrera_id', carrera.id)
        .eq('activo', true)
        .order('nombre')

      if (cursosError) {
        console.error(`Error consultando cursos para carrera ${carrera.id}:`, cursosError)
        materiasPorCarrera[carrera.id] = []
      } else {
        materiasPorCarrera[carrera.id] = cursos || []
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

    console.log(`✅ Respuesta materias por carrera:`, { 
      carreras: result.carreras.length, 
      total_materias: result.total_materias 
    })
    res.json(result)
  } catch (error) {
    console.error('❌ Error en /teachers/career-subjects:', error)
    res.status(500).json({ error: 'Error interno del servidor' })
  }
})

// GET /teachers/detailed-faculty - Obtener profesores con información detallada (materias, etc.)

router.get('/detailed-faculty', authenticateToken, async (req: any, res) => {
  try {
    const user = req.user

    console.log('🔍 [/teachers/detailed-faculty] Request received', { userId: user?.id })

    // Verificar que el usuario sea decano
    if (!user.roles?.includes('decano')) {
      return res.status(403).json({ error: 'Acceso denegado. Solo el decano puede ver todos los profesores de la facultad.' })
    }

    // Obtener todas las carreras activas (excluyendo tronco común)
    const { data: carreras, error: carrerasError } = await SupabaseDB.supabaseAdmin
      .from('carreras')
      .select('id, nombre')
      .eq('activa', true)
      .not('nombre', 'ilike', '%tronco común%')
      .not('nombre', 'ilike', '%tronco comun%')
      .order('nombre')

    if (carrerasError) {
      console.error('Error consultando carreras:', carrerasError)
      return res.status(500).json({ error: 'Error obteniendo carreras', details: carrerasError })
    }

    // Obtener profesores de cada carrera con información detallada
    const profesoresPorCarrera: {[key: string]: any[]} = {}
    
    for (const carrera of carreras) {
      const { data: profesores, error: profesoresError } = await SupabaseDB.supabaseAdmin
        .from('profesores')
        .select(`
          id,
          usuario_id,
          activa,
          codigo_profesor,
          carrera_id,
          usuarios:usuarios(
            id,
            nombre,
            apellido,
            email,
            activo
          )
        `)
        .eq('activo', true)
        .eq('usuarios.activo', true)
        .eq('carrera_id', carrera.id)

      if (profesoresError) {
        console.error(`Error consultando profesores para carrera ${carrera.id}:`, profesoresError)
        profesoresPorCarrera[carrera.id] = []
      } else {
        // Obtener cursos de la carrera
        const { data: cursosCarrera, error: cursosError } = await SupabaseDB.supabaseAdmin
          .from('cursos')
          .select(`
            id,
            nombre,
            codigo,
            creditos,
            activo
          `)
          .eq('carrera_id', carrera.id)
          .eq('activo', true)

        if (cursosError) {
          console.warn(`Error obteniendo cursos para carrera ${carrera.id}:`, cursosError)
        }

        // Mapear profesores con información de la carrera
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

    console.log(`✅ Respuesta profesores detallados de la facultad:`, { 
      carreras: result.carreras.length, 
      total_profesores: result.total_profesores 
    })
    res.json(result)
  } catch (error) {
    console.error('❌ Error en /teachers/detailed-faculty:', error)
    res.status(500).json({ error: 'Error interno del servidor' })
  }
})

// GET /teachers/faculty - Obtener TODOS los profesores de la facultad organizados por carrera (solo para decanos)

router.get('/faculty', authenticateToken, async (req: any, res) => {
  try {
    const user = req.user

    console.log('🔍 [/teachers/faculty] Request received', { userId: user?.id })

    // Verificar que el usuario sea decano
    if (!user.roles?.includes('decano')) {
      return res.status(403).json({ error: 'Acceso denegado. Solo el decano puede ver todos los profesores de la facultad.' })
    }

    // Obtener todas las carreras activas (excluyendo tronco común)
    const { data: carreras, error: carrerasError } = await SupabaseDB.supabaseAdmin
      .from('carreras')
      .select('id, nombre')
      .eq('activo', true)
      .eq('activa', true)
      .not('nombre', 'ilike', '%tronco común%')
      .not('nombre', 'ilike', '%tronco comun%')
      .order('nombre')

    if (carrerasError) {
      console.error('Error consultando carreras:', carrerasError)
      return res.status(500).json({ error: 'Error obteniendo carreras', details: carrerasError })
    }

    // Obtener profesores de cada carrera
    const profesoresPorCarrera: {[key: string]: any[]} = {}
    
    for (const carrera of carreras) {
      const { data: profesores, error: profesoresError } = await SupabaseDB.supabaseAdmin
        .from('profesores')
        .select(`
          id,
          usuario_id,
          activa,
          codigo_profesor,
          carrera_id,
          usuarios:usuarios(
            id,
            nombre,
            apellido,
            email,
            activo
          )
        `)
        .eq('activo', true)
        .eq('usuarios.activo', true)
        .eq('carrera_id', carrera.id)

      if (profesoresError) {
        console.error(`Error consultando profesores para carrera ${carrera.id}:`, profesoresError)
        profesoresPorCarrera[carrera.id] = []
      } else {
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

    console.log(`✅ Respuesta profesores de la facultad:`, { 
      carreras: result.carreras.length, 
      total_profesores: result.total_profesores 
    })
    res.json(result)
  } catch (error) {
    console.error('❌ Error en /teachers/faculty:', error)
    res.status(500).json({ error: 'Error interno del servidor' })
  }
})

// GET /teachers/all - Obtener TODOS los profesores de la facultad (solo para decanos)

router.get('/all', authenticateToken, async (req: any, res) => {
  try {
    const user = req.user

    console.log('🔍 [/teachers/all] Request received', { userId: user?.id })

    // Verificar que el usuario sea decano
    if (!user.roles?.includes('decano')) {
      return res.status(403).json({ error: 'Acceso denegado. Solo el decano puede ver todos los profesores de la facultad.' })
    }

    // Obtener TODOS los profesores activos de la facultad
    const { data: profesBase, error: profesErr } = await SupabaseDB.supabaseAdmin
      .from('profesores')
      .select(`
        id,
        usuario_id,
            activa,
        codigo_profesor,
        carrera_id,
        departamento,
        usuarios:usuarios(
          id,
          nombre,
          apellido,
          email,
          activo
        ),
        carreras:carreras(
          id,
          nombre
        )
      `)
      .eq('activo', true)
      .eq('usuarios.activo', true)

    if (profesErr) {
      console.error('Error consultando todos los profesores:', profesErr)
      return res.status(500).json({ error: 'Error obteniendo profesores', details: profesErr })
    }

    console.log(`🔎 Total profesores encontrados en la facultad:`, profesBase?.length || 0)

    // Obtener todas las carreras para mostrar información completa
    const { data: carreras, error: carrerasError } = await SupabaseDB.supabaseAdmin
      .from('carreras')
      .select('id, nombre')
      .eq('activo', true)

    if (carrerasError) {
      console.warn('Error obteniendo carreras:', carrerasError)
    }

    const carreraById = new Map()
    ;(carreras || []).forEach((c: any) => {
      carreraById.set(c.id, c)
    })

    const result = (profesBase || []).map((p: any) => {
      const carrera = carreraById.get(p.carrera_id)
      return {
        id: p.id,
        usuario_id: p.usuario_id,
        codigo_profesor: p.codigo_profesor || null,
        carrera_id: p.carrera_id,
        carrera_nombre: carrera?.nombre || 'Sin carrera asignada',
        departamento: p.departamento || 'Sin departamento',
        nombre: p.usuarios?.nombre || '',
        apellido: p.usuarios?.apellido || '',
        email: p.usuarios?.email || '',
        activo: p.activo
      }
    })

    console.log(`✅ Respuesta todos los profesores de la facultad:`, { profesores: result.length })
    res.json(result)
  } catch (error) {
    console.error('❌ Error en /teachers/all:', error)
    res.status(500).json({ error: 'Error interno del servidor' })
  }
})

// Endpoint de debug para verificar grupos de un curso

router.get('/debug-groups/:profesorId/:courseId', authenticateToken, async (req: any, res) => {
  try {
    const user = req.user
    const { profesorId, courseId } = req.params

    console.log('🔍 [DEBUG GROUPS] Verificando grupos para profesor:', profesorId, 'curso:', courseId)

    // 1. Verificar que el profesor existe
    const { data: profesor, error: profesorError } = await SupabaseDB.supabaseAdmin
      .from('profesores')
      .select('id, usuario_id, carrera_id')
      .eq('id', profesorId)
      .eq('activo', true)

    if (profesorError) {
      console.error('Error consultando profesor:', profesorError)
      return res.status(500).json({ error: 'Error consultando profesor' })
    }

    console.log('🔍 [DEBUG GROUPS] Profesor encontrado:', profesor)

    // 2. Verificar que el curso existe
    const { data: curso, error: cursoError } = await SupabaseDB.supabaseAdmin
      .from('cursos')
      .select('id, nombre, codigo, carrera_id')
      .eq('id', courseId)

    if (cursoError) {
      console.error('Error consultando curso:', cursoError)
      return res.status(500).json({ error: 'Error consultando curso' })
    }

    console.log('🔍 [DEBUG GROUPS] Curso encontrado:', curso)

    // 3. Verificar asignaciones del profesor para este curso
    const { data: asignaciones, error: asignacionesError } = await SupabaseDB.supabaseAdmin
      .from('asignaciones_profesor')
      .select('id, profesor_id, curso_id, activa')
      .eq('profesor_id', profesorId)
      .eq('curso_id', courseId)

    if (asignacionesError) {
      console.error('Error consultando asignaciones:', asignacionesError)
    }

    console.log('🔍 [DEBUG GROUPS] Asignaciones del profesor para este curso:', asignaciones)

    // 4. Traer grupos por curso_id (la tabla grupos no tiene profesor_id)
    const { data: grupos, error: gruposError } = await SupabaseDB.supabaseAdmin
      .from('grupos')
      .select('id, numero_grupo, horario, aula, curso_id')
      .eq('curso_id', courseId)

    if (gruposError) {
      console.error('Error consultando grupos:', gruposError)
      return res.status(500).json({ error: 'Error consultando grupos' })
    }

    console.log('🔍 [DEBUG GROUPS] Grupos por curso encontrados:', grupos)

    // 5. Verificar si hay grupos en general (para debug)
    const { data: todosLosGrupos, error: todosLosGruposError } = await SupabaseDB.supabaseAdmin
      .from('grupos')
      .select('id, numero_grupo, curso_id, profesor_id')
      .limit(10)

    if (todosLosGruposError) {
      console.error('Error consultando todos los grupos:', todosLosGruposError)
    }

    console.log('🔍 [DEBUG GROUPS] Muestra de todos los grupos:', todosLosGrupos)

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
    console.error('❌ Error en debug groups:', error)
    res.status(500).json({ error: 'Error interno del servidor' })
  }
})

// Endpoint de debug para verificar asignaciones de profesores

router.get('/debug-assignments/:careerId', authenticateToken, async (req: any, res) => {
  try {
    const user = req.user
    const { careerId } = req.params

    console.log('🔍 [DEBUG] Verificando asignaciones para carrera:', careerId)

    // 1. Verificar profesores de la carrera
    const { data: profesores, error: profError } = await SupabaseDB.supabaseAdmin
      .from('profesores')
      .select(`
        id,
        usuario_id,
        carrera_id,
        usuarios:usuarios(nombre, apellido, email)
      `)
      .eq('carrera_id', careerId)
      .eq('activo', true)

    if (profError) {
      console.error('Error consultando profesores:', profError)
      return res.status(500).json({ error: 'Error consultando profesores' })
    }

    console.log('🔍 [DEBUG] Profesores encontrados:', profesores?.length || 0)

    // 2. Verificar asignaciones por profesor_id
    const profesorIds = profesores?.map((p: any) => p.id) || []
    console.log('🔍 [DEBUG] IDs de profesores para buscar asignaciones:', profesorIds)
    
    const { data: asignaciones, error: asigError } = await SupabaseDB.supabaseAdmin
      .from('asignaciones_profesor')
      .select(`
        id,
        profesor_id,
        curso_id,
        activa,
        cursos:cursos(id, nombre, codigo, carrera_id)
      `)
      .in('profesor_id', profesorIds.length > 0 ? profesorIds : ['00000000-0000-0000-0000-000000000000'])

    if (asigError) {
      console.error('Error consultando asignaciones:', asigError)
      return res.status(500).json({ error: 'Error consultando asignaciones' })
    }

    console.log('🔍 [DEBUG] Asignaciones encontradas:', asignaciones?.length || 0)

    // 3. Verificar cursos de la carrera
    const { data: cursos, error: cursosError } = await SupabaseDB.supabaseAdmin
      .from('cursos')
      .select(`
        id,
        nombre,
        codigo,
        carrera_id
      `)
      .eq('carrera_id', careerId)

    if (cursosError) {
      console.error('Error consultando cursos:', cursosError)
      return res.status(500).json({ error: 'Error consultando cursos' })
    }

    console.log('🔍 [DEBUG] Cursos de la carrera encontrados:', cursos?.length || 0)

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
    console.error('❌ Error en debug assignments:', error)
    res.status(500).json({ error: 'Error interno del servidor' })
  }
})

// Endpoint para obtener calificación promedio de un profesor en un curso específico

router.get('/careers', authenticateToken, async (req: any, res) => {
  try {
    const user = req.user

    // Verificar que el usuario sea coordinador
    if (!user.roles?.includes('coordinador') && user.tipo_usuario !== 'coordinador') {
      return res.status(403).json({ error: 'Acceso denegado. Solo coordinadores pueden ver esta información.' })
    }

    // Obtener carreras
    const { data: carreras, error } = await SupabaseDB.supabaseAdmin
      .from('carreras')
      .select('id, nombre, codigo, activo')
      .eq('activo', true)
      .order('nombre')

    if (error) {
      console.error('Error obteniendo carreras:', error)
      return res.status(500).json({ error: 'Error obteniendo carreras', details: error })
    }

    console.log(`✅ Carreras obtenidas:`, carreras?.length)
    res.json(carreras || [])

  } catch (error) {
    console.error('Error en /teachers/careers:', error)
    res.status(500).json({ error: 'Error interno del servidor' })
  }
})

// GET /teachers/:teacherId/courses - Obtener cursos de un profesor específico

router.get('/:teacherId/courses', authenticateToken, async (req: any, res) => {
  try {
    const user = req.user
    const { teacherId } = req.params

    console.log('🔍 [/teachers/:teacherId/courses] Request received', { userId: user?.id, teacherId })

    // Verificar que el usuario sea el mismo profesor o un coordinador
    const isOwnProfile = user.id === teacherId
    const isCoordinator = user.roles?.includes('coordinador') || user.tipo_usuario === 'coordinador'
    
    if (!isOwnProfile && !isCoordinator) {
      return res.status(403).json({ error: 'Acceso denegado. Solo puedes ver tus propios cursos.' })
    }

    // Primero obtener el profesor_id desde el usuario_id
    const { data: profesor, error: profesorError } = await SupabaseDB.supabaseAdmin
      .from('profesores')
      .select('id')
      .eq('usuario_id', teacherId)
      .eq('activo', true)
      .single()

    if (profesorError) {
      console.error('Error obteniendo profesor por usuario_id:', profesorError)
      return res.status(500).json({ error: 'Error obteniendo información del profesor', details: profesorError })
    }

    if (!profesor) {
      console.log('⚠️ No se encontró profesor activo para usuario_id:', teacherId)
      return res.json([]) // Retornar array vacío si no es profesor
    }

    console.log('🔍 Profesor encontrado:', profesor.id)

    // Obtener asignaciones del profesor con información de cursos
    const { data: asignaciones, error: asignError } = await SupabaseDB.supabaseAdmin
      .from('asignaciones_profesor')
      .select(`
        id,
        profesor_id,
        curso_id,
            activa,
        cursos:cursos(
          id,
          nombre,
          codigo,
          creditos,
          descripcion,
          activo,
          carrera_id,
          carreras:carreras(
            id,
            nombre,
            codigo
          )
        )
      `)
      .eq('profesor_id', profesor.id)
      .eq('activa', true)

    if (asignError) {
      console.error('Error consultando asignaciones del profesor:', asignError)
      return res.status(500).json({ error: 'Error obteniendo cursos del profesor', details: asignError })
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

    console.log(`✅ Cursos encontrados para profesor ${profesor.id} (usuario ${teacherId}):`, cursos.length)
    res.json(cursos)

  } catch (error) {
    console.error('❌ Error en /teachers/:teacherId/courses:', error)
    res.status(500).json({ error: 'Error interno del servidor' })
  }
})

// GET /teachers/career-results/all - Obtener resultados para todas las carreras

router.get('/student-enrolled-subjects', authenticateToken, async (req: any, res) => {
  try {
    const user = req.user
    
    console.log('🔍 Backend: Getting enrolled subjects for user:', user.id);

    // Verificar que el usuario es un estudiante
    if (user.tipo_usuario !== 'estudiante') {
      return res.status(403).json({ error: 'Solo los estudiantes pueden acceder a esta información' })
    }

    // Obtener el ID del estudiante (si no existe, devolver lista vacía para que el dashboard cargue)
    const { data: estudiante, error: estudianteError } = await SupabaseDB.supabaseAdmin
      .from('estudiantes')
      .select('id')
      .eq('usuario_id', user.id)
      .single()

    if (estudianteError || !estudiante) {
      console.log('⚠️ Backend: No row in estudiantes for user, returning empty enrollments:', user.id);
      return res.json({ materiasMatriculadas: [], total: 0 });
    }

    // Obtener materias matriculadas con información detallada
    const { data: inscripciones, error: inscripcionesError } = await SupabaseDB.supabaseAdmin
      .from('inscripciones')
      .select(`
        id,
        grupo:grupos(
          id,
          numero_grupo,
          horario,
          aula,
          curso:cursos(
            id,
            nombre,
            codigo,
            creditos
          ),
          asignaciones_profesor:asignaciones_profesor(
            profesor:profesores(
              id,
              usuario:usuarios(
                nombre,
                apellido
              )
            )
          ),
          periodo:periodos_academicos(
            id,
            ano,
            semestre
          )
        )
      `)
      .eq('estudiante_id', estudiante.id)
      .eq('activa', true)

    if (inscripcionesError) {
      console.log('⚠️ Backend: Error getting enrollments, returning empty list:', inscripcionesError.message);
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

    console.log('✅ Backend: Enrolled subjects found:', materiasMatriculadas.length);

    res.json({
      materiasMatriculadas,
      total: materiasMatriculadas.length
    })
  } catch (error) {
    console.error('❌ Backend: Error getting enrolled subjects, returning empty:', error);
    return res.json({ materiasMatriculadas: [], total: 0 });
  }
})

// GET /teachers/teacher-stats - Obtener estadísticas del profesor

router.get('/teacher-courses/:teacherId', authenticateToken, async (req: any, res) => {
  try {
    const user = req.user
    const { teacherId } = req.params
    
    console.log('🔍 Backend: Getting teacher courses for teacher ID:', teacherId);

    // Verificar que el usuario es un profesor
    if (user.tipo_usuario !== 'profesor') {
      return res.status(403).json({ error: 'Solo los profesores pueden acceder a estos datos' })
    }

    // Obtener cursos del profesor con información detallada
    const { data: cursos, error: cursosError } = await SupabaseDB.supabaseAdmin
      .from('asignaciones_profesor')
      .select(`
        id,
        curso:cursos(
          id,
          nombre,
          codigo,
          creditos
        ),
        grupo:grupos(
          id,
          numero_grupo,
          horario,
          aula,
          periodo:periodos_academicos(
            id,
            nombre,
            codigo
          )
        )
      `)
      .eq('profesor_id', teacherId)
      .eq('activa', true)

    if (cursosError) {
      console.log('❌ Backend: Error getting teacher courses:', cursosError);
      return res.status(500).json({ error: 'Error al obtener cursos del profesor', details: cursosError.message })
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

    console.log('✅ Backend: Teacher courses found:', cursosFormateados.length);

    res.json(cursosFormateados)
  } catch (error) {
    console.error('❌ Backend: Error getting teacher courses:', error)
    res.status(500).json({ error: 'Error interno del servidor', details: (error as any)?.message || String(error) })
  }
})

// GET /teachers/teacher-id - Obtener ID del profesor desde el usuario autenticado

router.get('/teacher-id', authenticateToken, async (req: any, res) => {
  try {
    const user = req.user
    
    console.log('🔍 Backend: Getting teacher ID for user:', user.id);

    // Verificar que el usuario es un profesor
    if (user.tipo_usuario !== 'profesor') {
      return res.status(403).json({ error: 'Solo los profesores pueden acceder a este endpoint' })
    }

    // Obtener el ID del profesor
    const { data: profesor, error: profesorError } = await SupabaseDB.supabaseAdmin
      .from('profesores')
      .select('id')
      .eq('usuario_id', user.id)
      .single()

    if (profesorError || !profesor) {
      console.log('❌ Backend: Error finding teacher:', profesorError);
      return res.status(404).json({ error: 'Profesor no encontrado' })
    }

    console.log('✅ Backend: Teacher ID found:', profesor.id);

    res.json({ teacherId: profesor.id })
  } catch (error) {
    console.error('❌ Backend: Error getting teacher ID:', error)
    res.status(500).json({ error: 'Error interno del servidor', details: (error as any)?.message || String(error) })
  }
})

// GET /teachers/period-stats?period=YYYY-1|YYYY-2 - Estadísticas filtradas por período (cards y tablas)

router.get('/debug-professors', authenticateToken, async (req: any, res) => {
  try {
    const user = req.user
    console.log('🔍 Debug: User info:', { id: user.id, tipo: user.tipo_usuario });
    
    // Obtener todos los profesores
    const { data: todosProfesores, error: todosError } = await SupabaseDB.supabaseAdmin
      .from('profesores')
      .select('id, activo, usuario_id, usuario:usuarios(nombre, apellido, email)')
      .limit(10)
    
    console.log('🔍 Debug: Todos los profesores:', { todosProfesores, todosError });
    
    // Buscar el profesor específico que está fallando
    const { data: profesorEspecifico, error: profError } = await SupabaseDB.supabaseAdmin
      .from('profesores')
      .select('id, activo, usuario_id, usuario:usuarios(nombre, apellido, email)')
      .eq('id', '8c1f98db-6722-4aac-ad68-2a368b6324d4')
      .single()
    
    console.log('🔍 Debug: Profesor específico:', { profesorEspecifico, profError });
    
    res.json({
      user: { id: user.id, tipo: user.tipo_usuario },
      todosProfesores: todosProfesores || [],
      profesorEspecifico: profesorEspecifico || null,
      error: profError
    })
  } catch (error) {
    console.error('❌ Debug error:', error);
    res.status(500).json({ error: 'Error interno del servidor', details: (error as any)?.message || String(error) })
  }
})

export default router
