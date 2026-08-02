import { supabaseAdmin } from '../../config/supabase-only'
import { SupabaseDB } from '../../config/supabase-only'

export class AcademicRepository {
  async listUsersSummary() {
    return SupabaseDB.listUsersSummary()
  }

  async getCoursesByCareer(careerId: string | number) {
    const { data, error } = await supabaseAdmin
      .from('cursos')
      .select(`
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
      `)
      .eq('carrera_id', careerId)
      .order('nombre')

    if (error) throw error
    return data || []
  }

  async getCareers() {
    return SupabaseDB.getCareers()
  }

  async getProfessors() {
    return SupabaseDB.getProfessors()
  }

  get admin() {
    return supabaseAdmin
  }
}

export const academicRepository = new AcademicRepository()
