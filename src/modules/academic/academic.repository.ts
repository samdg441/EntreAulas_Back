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

    // Schema real: carreras no tiene `codigo` (sí nombre, descripcion, facultad_id, activa)
    const { data: carreras, error: carError } = await supabaseAdmin
      .from('carreras')
      .select('id, nombre, descripcion, facultad_id, activa')
      .order('nombre')

    if (carError) throw carError

    const byFacultad = new Map<number, NonNullable<typeof carreras>>()
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
      carreras: (byFacultad.get(Number(f.id)) || []).map((c) => ({
        id: c.id,
        nombre: c.nombre,
        descripcion: c.descripcion,
        facultad_id: c.facultad_id,
        activa: c.activa,
      })),
    }))
  }

  async getDashboardStats() {
    const [usersRes, facultadesRes, carrerasRes] = await Promise.all([
      supabaseAdmin.from('usuarios').select('id', { count: 'exact', head: true }),
      supabaseAdmin.from('facultades').select('id', { count: 'exact', head: true }),
      supabaseAdmin.from('carreras').select('id', { count: 'exact', head: true }).eq('activa', true),
    ])

    if (usersRes.error) throw usersRes.error
    if (facultadesRes.error) throw facultadesRes.error
    if (carrerasRes.error) throw carrerasRes.error

    return {
      totalUsers: usersRes.count ?? 0,
      totalFacultades: facultadesRes.count ?? 0,
      totalCarreras: carrerasRes.count ?? 0,
    }
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
