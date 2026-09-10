import { supabaseAdmin } from '../../config/supabase-only'

type SbError = { code?: string } | null

function one<T>(data: T | null, error: SbError): T | null {
  if (error && error.code !== 'PGRST116') throw error
  return data ?? null
}

function many<T>(data: T[] | null, error: SbError): T[] {
  if (error) throw error
  return data || []
}

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

    return one<{ id: string }>(data, error)
  }

  async findProfessorById(profesorId: string) {
    const { data, error } = await supabaseAdmin
      .from('profesores')
      .select('id, activo, usuario_id')
      .eq('id', profesorId)
      .single()

    return one<{ id: string; activo: boolean; usuario_id: string }>(data, error)
  }

  async findByUsuarioId(usuarioId: string) {
    const { data, error } = await supabaseAdmin
      .from('profesores')
      .select('id')
      .eq('usuario_id', usuarioId)
      .single()

    return one<{ id: string }>(data, error)
  }

  async findActiveByUsuarioId(usuarioId: string) {
    const { data, error } = await supabaseAdmin
      .from('profesores')
      .select('id, carrera_id')
      .eq('usuario_id', usuarioId)
      .eq('activo', true)
      .single()

    return one<{ id: string; carrera_id: number | null }>(data, error)
  }

  async findTeacherInfoByUsuarioId(usuarioId: string) {
    const { data, error } = await supabaseAdmin
      .from('profesores')
      .select(`
        id,
        usuario_id,
        carrera_id,
        carrera:carreras(id, nombre)
      `)
      .eq('usuario_id', usuarioId)
      .single()

    return one<{
      id: string
      usuario_id: string
      carrera_id: number | null
      carrera: unknown
    }>(data, error)
  }

  async findUsuarioId(profesorId: string) {
    const { data, error } = await supabaseAdmin
      .from('profesores')
      .select('usuario_id')
      .eq('id', profesorId)
      .single()

    const row = one<{ usuario_id: string }>(data, error)
    return row?.usuario_id ?? null
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

    return many(data, error)
  }

  async listActiveByCareer(carreraId: number | string) {
    const { data, error } = await supabaseAdmin
      .from('profesores')
      .select('id, usuario_id, activo')
      .eq('carrera_id', carreraId)
      .eq('activo', true)

    return many(data, error)
  }

  async listIdsByCareer(carreraId: number | string, onlyActive = true) {
    let query = supabaseAdmin.from('profesores').select('id').eq('carrera_id', carreraId)
    if (onlyActive) query = query.eq('activo', true)
    const { data, error } = await query
    return many(data, error).map((p: { id: string | number }) => p.id).filter(Boolean)
  }

  async listActiveWithUsuario(ids?: Array<string | number>) {
    let query = supabaseAdmin
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
    if (ids && ids.length > 0) query = query.in('id', ids)
    const { data, error } = await query
    return many(data, error)
  }

  async listByCareerDetailed(carreraId: string | number) {
    const { data, error } = await supabaseAdmin
      .from('profesores')
      .select(`
        id,
        usuario_id,
        codigo_profesor,
        activo,
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
      .eq('carrera_id', carreraId)
    return many(data, error)
  }

  async listSample(limit = 10) {
    const { data, error } = await supabaseAdmin
      .from('profesores')
      .select('id, activo, usuario_id, usuario:usuarios(nombre, apellido, email)')
      .limit(limit)
    return many(data, error)
  }

  async listActiveById(profesorId: string) {
    const { data, error } = await supabaseAdmin
      .from('profesores')
      .select('id, usuario_id, carrera_id')
      .eq('id', profesorId)
      .eq('activo', true)
    if (error) throw error
    return data || []
  }

  async findWithUsuario(profesorId: string) {
    const { data, error } = await supabaseAdmin
      .from('profesores')
      .select('id, activo, usuario_id, usuario:usuarios(nombre, apellido, email)')
      .eq('id', profesorId)
      .single()
    return { data, error }
  }

  async listByIdsWithUsuario(ids: Array<string | number>) {
    if (!ids.length) return []
    const { data, error } = await supabaseAdmin
      .from('profesores')
      .select('id, usuario:usuarios(nombre, apellido)')
      .in('id', ids)
    return many(data, error)
  }
}

export const teachersRepository = new TeachersRepository()
