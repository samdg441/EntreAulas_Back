import { supabaseAdmin } from '../../config/supabase-only'
import { one } from '../../shared/supabase-result'
import type { CoordinadorInfo, DecanoPorFacultad, DecanoPorUsuario } from './role.types'

const DECANO_POR_USUARIO = `
  id,
  usuario_id,
  facultad_id,
  fecha_nombramiento,
  activo,
  observaciones,
  facultades:facultades!facultad_id(
    id,
    nombre,
    codigo,
    descripcion
  )
`

const DECANO_POR_FACULTAD = `
  id,
  usuario_id,
  facultad_id,
  fecha_nombramiento,
  activo,
  observaciones,
  usuarios:usuarios!usuario_id(
    id,
    nombre,
    apellido,
    email,
    activo
  ),
  facultades:facultades!facultad_id(
    id,
    nombre,
    codigo,
    descripcion
  )
`

/** Acceso a datos de roles, coordinadores y decanos. */
export class RoleRepository {
  async upsertRol(usuarioId: string, rol: string) {
    const { error } = await supabaseAdmin.from('usuario_roles').upsert(
      {
        usuario_id: usuarioId,
        rol,
        activo: true,
        fecha_asignacion: new Date().toISOString(),
      },
      { onConflict: 'usuario_id,rol' }
    )
    if (error) throw error
  }

  async desactivarRol(usuarioId: string, rol: string) {
    const { error } = await supabaseAdmin
      .from('usuario_roles')
      .update({ activo: false })
      .eq('usuario_id', usuarioId)
      .eq('rol', rol)
    if (error) throw error
  }

  async listRolesActivos(usuarioId: string): Promise<string[]> {
    const { data, error } = await supabaseAdmin
      .from('usuario_roles')
      .select('rol')
      .eq('usuario_id', usuarioId)
      .eq('activo', true)
      .order('rol')
    if (error) throw error
    return data?.map((item: { rol: string }) => item.rol) || []
  }

  async findRolActivo(usuarioId: string, rol: string) {
    const { data, error } = await supabaseAdmin
      .from('usuario_roles')
      .select('id')
      .eq('usuario_id', usuarioId)
      .eq('rol', rol)
      .eq('activo', true)
      .single()
    return one(data, error)
  }

  async insertUsuarioProfesor(row: {
    email: string
    password: string
    nombre: string
    apellido: string
  }) {
    const { data, error } = await supabaseAdmin
      .from('usuarios')
      .insert({
        ...row,
        tipo_usuario: 'profesor',
        activo: true,
      })
      .select('id')
      .single()
    if (error) throw error
    return data as { id: string }
  }

  async insertCoordinador(row: {
    usuario_id: string
    carrera_id?: number
    departamento?: string
    fecha_nombramiento: string
  }) {
    const { error } = await supabaseAdmin.from('coordinadores').insert({
      ...row,
      activo: true,
    })
    if (error) throw error
  }

  async listCoordinadoresActivos(): Promise<CoordinadorInfo[]> {
    const { data, error } = await supabaseAdmin
      .from('vista_coordinadores_completa')
      .select('*')
      .eq('coordinador_activo', true)
    if (error) throw error
    return (data || []) as CoordinadorInfo[]
  }

  async findCoordinadorPorUsuario(usuarioId: string): Promise<CoordinadorInfo | null> {
    const { data, error } = await supabaseAdmin
      .from('coordinadores')
      .select('*')
      .eq('usuario_id', usuarioId)
      .eq('activo', true)
      .single()
    return one(data, error) as CoordinadorInfo | null
  }

  async findTipoUsuario(usuarioId: string) {
    const { data, error } = await supabaseAdmin
      .from('usuarios')
      .select('tipo_usuario')
      .eq('id', usuarioId)
      .single()
    return one<{ tipo_usuario: string }>(data, error)
  }

  async findDecanoPorUsuario(usuarioId: string): Promise<DecanoPorUsuario | null> {
    const { data, error } = await supabaseAdmin
      .from('decanos')
      .select(DECANO_POR_USUARIO)
      .eq('usuario_id', usuarioId)
      .eq('activo', true)
      .single()
    return one<DecanoPorUsuario>(data as DecanoPorUsuario | null, error)
  }

  async findDecanoPorFacultad(facultadId: number): Promise<DecanoPorFacultad | null> {
    const { data, error } = await supabaseAdmin
      .from('decanos')
      .select(DECANO_POR_FACULTAD)
      .eq('facultad_id', facultadId)
      .eq('activo', true)
      .eq('usuarios.activo', true)
      .single()
    return one<DecanoPorFacultad>(data as DecanoPorFacultad | null, error)
  }
}

export const roleRepository = new RoleRepository()
