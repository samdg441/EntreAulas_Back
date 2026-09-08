export interface UserRole {
  id: number
  usuario_id: string
  rol: string
  activo: boolean
  fecha_asignacion: string
}

export interface CoordinadorInfo {
  id: number
  usuario_id: string
  carrera_id?: number
  carrera_nombre?: string
  departamento?: string
  fecha_nombramiento?: string
  activo: boolean
  profesor_id?: number
  profesor_activo?: boolean
}

export interface DecanoPorUsuario {
  id: number
  usuario_id: string
  facultad_id: number
  fecha_nombramiento?: string
  activo: boolean
  observaciones?: string
  facultades?: {
    id: number
    nombre: string
    codigo?: string
    descripcion?: string
  } | null
}

export interface DecanoPorFacultad extends DecanoPorUsuario {
  usuarios?: {
    id: string
    nombre: string
    apellido: string
    email: string
    activo: boolean
  } | null
}
