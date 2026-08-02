import { supabaseAdmin } from '../../config/supabase-only'

/** Acceso a datos del dominio académico de profesores. */
export class TeachersRepository {
  get admin() {
    return supabaseAdmin
  }

  async findActiveProfessor(profesorId: string) {
    const { data, error } = await supabaseAdmin
      .from('profesores')
      .select('id')
      .eq('id', profesorId)
      .eq('activo', true)
      .single()

    if (error) throw error
    return data
  }

  async listActiveProfessors() {
    const { data, error } = await supabaseAdmin
      .from('profesores')
      .select(`
        id,
        usuario_id,
        activo,
        usuario:usuarios(id, nombre, apellido, email)
      `)
      .eq('activo', true)

    if (error) throw error
    return data || []
  }
}

export const teachersRepository = new TeachersRepository()
