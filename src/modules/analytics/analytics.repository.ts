import { supabaseAdmin } from '../../config/supabase-only'

type SbError = { code?: string } | null

function many<T>(data: T[] | null, error: SbError): T[] {
  if (error) throw error
  return data || []
}

/** Acceso a datos de analítica / reportes (Supabase aislado). */
export class AnalyticsRepository {
  get admin() {
    return supabaseAdmin
  }

  async getEvaluacionesStats(profesorId: string) {
    const { data, error } = await supabaseAdmin
      .from('evaluaciones')
      .select(`
        id,
        calificacion_promedio,
        fecha_creacion,
        grupo_id,
        estudiante_id
      `)
      .eq('profesor_id', profesorId)

    return many(data, error)
  }

  async getEvaluacionesHistoricas(
    profesorId: string,
    gte = '2020-01-01',
    lte = '2030-12-31'
  ) {
    const { data, error } = await supabaseAdmin
      .from('evaluaciones')
      .select(`
        id,
        calificacion_promedio,
        fecha_creacion,
        grupo_id,
        estudiante_id
      `)
      .eq('profesor_id', profesorId)
      .gte('fecha_creacion', gte)
      .lte('fecha_creacion', lte)

    return many(data, error)
  }

  async getCompletedEvaluationsByProfessor(profesorId: string) {
    const { data, error } = await supabaseAdmin
      .from('evaluaciones')
      .select('id, calificacion_promedio, fecha_completada, profesor_id, grupo_id')
      .eq('profesor_id', profesorId)
      .eq('completada', true)

    return many(data, error)
  }

  async getCompletedForTeacherStats(profesorId: string) {
    const { data, error } = await supabaseAdmin
      .from('evaluaciones')
      .select('id, calificacion_promedio, grupo_id')
      .eq('profesor_id', profesorId)
      .eq('completada', true)

    return many(data, error)
  }

  async getCompletedInPeriod(
    profesorId: string,
    gte = '2020-01-01',
    lte = '2030-12-31',
    columns = 'id, grupo_id, fecha_creacion'
  ) {
    const { data, error } = await supabaseAdmin
      .from('evaluaciones')
      .select(columns)
      .eq('profesor_id', profesorId)
      .eq('completada', true)
      .gte('fecha_creacion', gte)
      .lte('fecha_creacion', lte)

    return many(data, error)
  }

  async getCompletedByProfesorIds(profesorIds: string[]) {
    const { data, error } = await supabaseAdmin
      .from('evaluaciones')
      .select('profesor_id, calificacion_promedio, completada')
      .in('profesor_id', profesorIds)
      .eq('completada', true)

    return many(data, error)
  }

  async getGruposByIds(grupoIds: Array<string | number>, columns = 'id, curso_id, numero_grupo') {
    const ids = grupoIds.length ? grupoIds : [-1]
    const { data, error } = await supabaseAdmin.from('grupos').select(columns).in('id', ids)
    return many(data, error)
  }

  async getUsuariosByIds(usuarioIds: string[]) {
    const { data, error } = await supabaseAdmin
      .from('usuarios')
      .select('id, nombre, apellido, email')
      .in('id', usuarioIds)

    return many(data, error)
  }

  async getActiveProfessors() {
    const { data, error } = await supabaseAdmin
      .from('profesores')
      .select('id, usuario_id, activo, usuario:usuarios(id, nombre, apellido, email)')
      .eq('activo', true)

    return many(data, error)
  }

  async listEvaluaciones(opts: {
    columns: string
    profesorId?: string | number
    profesorIds?: Array<string | number>
    estudianteId?: string | number
    completada?: boolean
    gte?: string
    lte?: string
    periodoId?: string | number
    grupoId?: string | number
  }) {
    let query = supabaseAdmin.from('evaluaciones').select(opts.columns)
    if (opts.profesorId !== undefined) query = query.eq('profesor_id', opts.profesorId)
    if (opts.profesorIds?.length) query = query.in('profesor_id', opts.profesorIds)
    if (opts.estudianteId !== undefined) query = query.eq('estudiante_id', opts.estudianteId)
    if (opts.completada !== undefined) query = query.eq('completada', opts.completada)
    if (opts.gte) query = query.gte('fecha_creacion', opts.gte)
    if (opts.lte) query = query.lte('fecha_creacion', opts.lte)
    if (opts.periodoId !== undefined) query = query.eq('periodo_id', opts.periodoId)
    if (opts.grupoId !== undefined) query = query.eq('grupo_id', opts.grupoId)
    const { data, error } = await query
    return many(data, error)
  }

  async insertEvaluacion(evaluationData: Record<string, unknown>) {
    const { data, error } = await supabaseAdmin
      .from('evaluaciones')
      .insert(evaluationData)
      .select('id')
      .single()
    if (error) throw error
    return data
  }

  async insertRespuestas(rows: unknown[]) {
    const { error } = await supabaseAdmin.from('respuestas_evaluacion').insert(rows)
    return error
  }

  async findPeriodo(ano: string | number, semestre: string | number) {
    const { data, error } = await supabaseAdmin
      .from('periodos_academicos')
      .select('id, ano, semestre')
      .eq('ano', ano)
      .eq('semestre', semestre)
      .maybeSingle()
    if (error) throw error
    return data
  }

  async listRespuestasByEvaluacionIds(
    evaluacionIds: Array<string | number>,
    columns = 'evaluacion_id, pregunta_id, respuesta_rating, respuesta_texto'
  ) {
    const ids = evaluacionIds.length ? evaluacionIds : [-1]
    const { data, error } = await supabaseAdmin
      .from('respuestas_evaluacion')
      .select(columns)
      .in('evaluacion_id', ids)
    if (error) throw error
    return data || []
  }

  async listRespuestasTextoByEvaluacionIds(evaluacionIds: Array<string | number>) {
    const ids = evaluacionIds.length ? evaluacionIds : [-1]
    const { data, error } = await supabaseAdmin
      .from('respuestas_evaluacion')
      .select('id, evaluacion_id, respuesta_texto, respuesta_rating')
      .in('evaluacion_id', ids)
      .not('respuesta_texto', 'is', null)
    if (error) throw error
    return data || []
  }

  async listPreguntasByIds(ids: Array<string | number>, columns = 'id, categoria_id, texto_pregunta') {
    const useIds = ids.length ? ids : [-1]
    const { data, error } = await supabaseAdmin.from('preguntas_evaluacion').select(columns).in('id', useIds)
    if (error) throw error
    return data || []
  }

  async listCategoriasByIds(ids: Array<string | number>, columns = 'id, nombre') {
    const useIds = ids.length ? ids : [-1]
    const { data, error } = await supabaseAdmin.from('categorias_pregunta').select(columns).in('id', useIds)
    if (error) throw error
    return data || []
  }
}

export const analyticsRepository = new AnalyticsRepository()
