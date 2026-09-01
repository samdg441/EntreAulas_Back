import { z } from 'zod'

const teacherIdSchema = z.union([
  z.string().uuid('ID de profesor inválido'),
  z
    .string()
    .regex(/^\d+$/, 'ID de profesor inválido')
    .refine((s) => parseInt(s, 10) > 0, 'ID de profesor inválido'),
])

export const evaluationSchema = z.object({
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

export const BODY_EVALUACION_VALIDO = {
  teacherId: '12',
  courseId: '3',
  groupId: '7',
  answers: [{ questionId: 1, rating: 4, textAnswer: null }],
  overallRating: 4,
  comments: 'Buen curso',
}

export function esEstudiante(tipoUsuario?: string): boolean {
  return tipoUsuario === 'estudiante'
}

export function validarBodyEvaluacion(body: unknown): {
  ok: boolean
  status: number
  error?: string
  details?: Array<{ field: string; message: string }>
  data?: z.infer<typeof evaluationSchema>
} {
  const parsed = evaluationSchema.safeParse(body)
  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      error: 'Datos de evaluación inválidos',
      details: parsed.error.errors.map((err) => ({
        field: err.path.join('.'),
        message: err.message,
      })),
    }
  }
  return { ok: true, status: 200, data: parsed.data }
}

export function armarFilaEvaluacion(params: {
  teacherId: string
  estudianteId: string
  groupId?: string
  comments?: string
  overallRating: number
}) {
  return {
    profesor_id: params.teacherId,
    estudiante_id: params.estudianteId,
    grupo_id: params.groupId || 1,
    periodo_id: 1,
    completada: true,
    comentarios: params.comments || null,
    calificacion_promedio: params.overallRating,
  }
}

export function armarRespuestas(
  evaluationId: string,
  answers: Array<{
    questionId: number
    rating?: number | null
    textAnswer?: string | null
    selectedOption?: string | null
  }>
) {
  return answers
    .map((answer) => {
      const row: {
        evaluacion_id: string
        pregunta_id: number
        respuesta_rating?: number
        respuesta_texto?: string
        respuesta_opcion?: string
      } = {
        evaluacion_id: evaluationId,
        pregunta_id: answer.questionId,
      }
      if (answer.rating !== null && answer.rating !== undefined) {
        row.respuesta_rating = answer.rating
      }
      if (answer.textAnswer !== null && answer.textAnswer !== undefined && answer.textAnswer.trim() !== '') {
        row.respuesta_texto = answer.textAnswer.trim()
      }
      if (answer.selectedOption !== null && answer.selectedOption !== undefined) {
        row.respuesta_opcion = answer.selectedOption
      }
      return row
    })
    .filter(
      (row) =>
        row.respuesta_rating !== undefined ||
        row.respuesta_texto !== undefined ||
        row.respuesta_opcion !== undefined
    )
}

export function decidirEnvioEvaluacion(params: {
  autenticado: boolean
  tipoUsuario?: string
  body: unknown
  perfilEstudiante: boolean
  errorPerfil?: boolean
  yaEvaluo?: boolean
  errorInsert?: boolean
  evaluationId?: string
}): {
  ok: boolean
  status: number
  error?: string
  details?: unknown
  data?: { success: boolean; message: string; evaluationId: string }
} {
  if (!params.autenticado) {
    return { ok: false, status: 401, error: 'Token de acceso requerido' }
  }

  const validacion = validarBodyEvaluacion(params.body)
  if (!validacion.ok) {
    return {
      ok: false,
      status: 400,
      error: validacion.error,
      details: validacion.details,
    }
  }

  if (!esEstudiante(params.tipoUsuario)) {
    return { ok: false, status: 403, error: 'Solo los estudiantes pueden realizar evaluaciones' }
  }

  if (params.errorPerfil) {
    return { ok: false, status: 404, error: 'Error al buscar el estudiante' }
  }
  if (!params.perfilEstudiante) {
    return { ok: false, status: 404, error: 'Estudiante no encontrado' }
  }

  if (params.yaEvaluo) {
    return {
      ok: false,
      status: 409,
      error: 'Ya has evaluado a este profesor para este curso y grupo',
    }
  }

  if (params.errorInsert) {
    return { ok: false, status: 500, error: 'Error al guardar la evaluación' }
  }

  return {
    ok: true,
    status: 200,
    data: {
      success: true,
      message: 'Evaluación guardada exitosamente',
      evaluationId: params.evaluationId ?? 'eval-1',
    },
  }
}
