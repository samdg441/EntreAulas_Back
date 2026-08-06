import { supabaseAdmin } from '../../config/supabase-only'
import { SupabaseDB } from '../../config/supabase-only'

export class AcademicRepository {
  async listUsersSummary() {
    return SupabaseDB.listUsersSummary()
  }

  async updateUser(
    id: string,
    updates: Partial<{
      email: string
      nombre: string
      apellido: string
      tipo_usuario: string
      activo: boolean
    }>
  ) {
    return SupabaseDB.updateUser(id, updates)
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

  /** Facultades con sus carreras (consulta de estructura universitaria). */
  async getAcademicStructure() {
    const { data: facultades, error: facError } = await supabaseAdmin
      .from('facultades')
      .select('id, nombre, codigo, descripcion')
      .order('nombre')

    if (facError) throw facError

    const { data: carreras, error: carError } = await supabaseAdmin
      .from('carreras')
      .select('id, nombre, codigo, facultad_id, activa')
      .order('nombre')

    if (carError) throw carError

    const byFacultad = new Map<number, typeof carreras>()
    for (const c of carreras || []) {
      const fid = Number(c.facultad_id)
      if (!byFacultad.has(fid)) byFacultad.set(fid, [])
      byFacultad.get(fid)!.push(c)
    }

    return (facultades || []).map((f) => ({
      id: f.id,
      nombre: f.nombre,
      codigo: f.codigo,
      descripcion: f.descripcion,
      carreras: byFacultad.get(Number(f.id)) || [],
    }))
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
