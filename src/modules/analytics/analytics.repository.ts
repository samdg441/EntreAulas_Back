import { supabaseAdmin } from '../../config/supabase-only'

/** Acceso a datos de analítica / reportes (Supabase aislado). */
export class AnalyticsRepository {
  get admin() {
    return supabaseAdmin
  }

  async getCompletedEvaluationsByProfessor(profesorId: string) {
    const { data, error } = await supabaseAdmin
      .from('evaluaciones')
      .select('id, calificacion_promedio, fecha_completada, profesor_id, grupo_id')
      .eq('profesor_id', profesorId)
      .eq('completada', true)

    if (error) throw error
    return data || []
  }

  async getActiveProfessors() {
    const { data, error } = await supabaseAdmin
      .from('profesores')
      .select('id, usuario_id, activo, usuario:usuarios(id, nombre, apellido, email)')
      .eq('activo', true)

    if (error) throw error
    return data || []
  }
}

export const analyticsRepository = new AnalyticsRepository()
