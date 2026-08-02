import { supabaseAdmin } from '../../config/supabase-only'
import type { PreguntaEvaluacion } from './evaluations.types'

/**
 * Capa de acceso a datos de evaluaciones / preguntas.
 * Aísla Supabase para permitir mocks en tests unitarios.
 */
export class EvaluationsRepository {
  async getQuestionsByCareer(carreraId?: number): Promise<PreguntaEvaluacion[]> {
    let query = supabaseAdmin
      .from('preguntas_evaluacion')
      .select(`
        *,
        categoria:categorias_pregunta(*)
      `)
      .eq('activa', true)
      .order('orden', { ascending: true })

    if (carreraId) {
      const { data: specificQuestions, error: specificError } = await query.eq(
        'id_carrera',
        carreraId
      )
      if (specificError) throw specificError
      if (specificQuestions && specificQuestions.length > 0) {
        return specificQuestions as PreguntaEvaluacion[]
      }

      const { data: generalQuestions, error: generalError } = await supabaseAdmin
        .from('preguntas_evaluacion')
        .select(`
          *,
          categoria:categorias_pregunta(*)
        `)
        .eq('activa', true)
        .is('id_carrera', null)
        .order('orden', { ascending: true })

      if (generalError) throw generalError
      return (generalQuestions || []) as PreguntaEvaluacion[]
    }

    const { data, error } = await query
    if (error) throw error
    return (data || []) as PreguntaEvaluacion[]
  }

  async getQuestionsWithCategories(): Promise<PreguntaEvaluacion[]> {
    const { data, error } = await supabaseAdmin
      .from('preguntas_evaluacion')
      .select(`
        *,
        categoria:categorias_pregunta(*)
      `)
      .eq('activa', true)
      .order('categoria_id', { ascending: true })
      .order('orden', { ascending: true })

    if (error) throw error
    return (data || []) as PreguntaEvaluacion[]
  }

  async getBasicQuestions(): Promise<unknown[]> {
    const { data, error } = await supabaseAdmin
      .from('preguntas_evaluacion')
      .select('*')
      .eq('activa', true)
      .order('orden')

    if (error) throw error
    return data || []
  }

  async createQuestion(preguntaData: {
    categoria_id: number
    texto_pregunta: string
    descripcion?: string
    tipo_pregunta: string
    opciones?: unknown
    obligatoria?: boolean
    orden: number
    id_carrera?: number
    activa?: boolean
  }) {
    const { data, error } = await supabaseAdmin
      .from('preguntas_evaluacion')
      .insert([{ ...preguntaData, activa: preguntaData.activa ?? true }])
      .select()
      .single()

    if (error) throw error
    return data
  }

  async updateQuestion(preguntaId: number, updateData: Partial<PreguntaEvaluacion>) {
    const { data, error } = await supabaseAdmin
      .from('preguntas_evaluacion')
      .update(updateData)
      .eq('id', preguntaId)
      .select()
      .single()

    if (error) throw error
    return data
  }

  async deactivateQuestion(preguntaId: number): Promise<boolean> {
    const { error } = await supabaseAdmin
      .from('preguntas_evaluacion')
      .update({ activa: false })
      .eq('id', preguntaId)

    if (error) throw error
    return true
  }

  async getQuestionsByCategoryAndCareer(
    categoriaId: number,
    carreraId?: number
  ): Promise<PreguntaEvaluacion[]> {
    let query = supabaseAdmin
      .from('preguntas_evaluacion')
      .select(`
        *,
        categoria:categorias_pregunta(*)
      `)
      .eq('categoria_id', categoriaId)
      .eq('activa', true)
      .order('orden', { ascending: true })

    if (carreraId) {
      query = query.eq('id_carrera', carreraId)
    } else {
      query = query.is('id_carrera', null)
    }

    const { data, error } = await query
    if (error) throw error
    return (data || []) as PreguntaEvaluacion[]
  }

  async getEvaluationsByStudent(studentId: string) {
    const { data, error } = await supabaseAdmin
      .from('evaluaciones')
      .select(`
        *,
        profesor:profesores(
          *,
          usuario:usuarios(nombre, apellido)
        ),
        grupo:grupos(
          *,
          curso:cursos(*),
          periodo:periodos_academicos(*)
        ),
        respuestas_evaluacion(
          *,
          pregunta:preguntas_evaluacion(*)
        )
      `)
      .eq('estudiante_id', studentId)
      .order('fecha_creacion', { ascending: false })

    if (error) throw error
    return data
  }

  async getCompletedEvaluations(filters: Record<string, unknown>) {
    const { data, error } = await supabaseAdmin
      .from('evaluaciones')
      .select(`
        *,
        estudiante:estudiantes(
          *,
          usuario:usuarios(nombre, apellido)
        ),
        profesor:profesores(
          *,
          usuario:usuarios(nombre, apellido)
        ),
        grupo:grupos(
          *,
          curso:cursos(*),
          periodo:periodos_academicos(*)
        ),
        respuestas_evaluacion(
          *,
          pregunta:preguntas_evaluacion(*)
        )
      `)
      .match(filters)
      .eq('completada', true)
      .order('fecha_completada', { ascending: false })

    if (error) throw error
    return data
  }

  async getEvaluationRatings(filters: Record<string, unknown>) {
    const { data, error } = await supabaseAdmin
      .from('evaluaciones')
      .select('calificacion_promedio, fecha_completada')
      .match(filters)
      .eq('completada', true)
      .not('calificacion_promedio', 'is', null)

    if (error) throw error
    return data
  }
}

export const evaluationsRepository = new EvaluationsRepository()
