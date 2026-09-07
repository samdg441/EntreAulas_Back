import { decidirCreacionUsuario, validarCamposCreacionUsuario } from './auth'

export const TIPOS_USUARIO_PERMITIDOS = [
  'estudiante',
  'profesor',
  'docente',
  'coordinador',
  'admin',
  'decano',
] as const

export const BODY_ALTA_VALIDO = {
  email: 'nuevo@test.com',
  password: 'password123',
  nombre: 'Ana',
  apellido: 'Perez',
  tipo_usuario: 'estudiante',
}

export { decidirCreacionUsuario, validarCamposCreacionUsuario }

export function usuarioSinPassword<T extends { password?: unknown }>(user: T) {
  const { password: _password, ...rest } = user
  return rest
}

export function validarActualizacionUsuario(params: {
  id?: string
  existe: boolean
  email?: string
  nombre?: string
  apellido?: string
  tipo_usuario?: string
  activo?: boolean
  password?: string
  emailDeOtro?: boolean
}): { ok: boolean; status: number; error?: string; updates?: Record<string, unknown> } {
  if (!params.id) {
    return { ok: false, status: 400, error: 'ID de usuario requerido' }
  }
  if (!params.existe) {
    return { ok: false, status: 404, error: 'Usuario no encontrado' }
  }

  const updates: Record<string, unknown> = {}
  if (typeof params.email === 'string' && params.email.trim()) {
    updates.email = params.email.trim().toLowerCase()
  }
  if (typeof params.nombre === 'string' && params.nombre.trim()) {
    updates.nombre = params.nombre.trim()
  }
  if (typeof params.apellido === 'string' && params.apellido.trim()) {
    updates.apellido = params.apellido.trim()
  }
  if (typeof params.tipo_usuario === 'string') {
    if (!(TIPOS_USUARIO_PERMITIDOS as readonly string[]).includes(params.tipo_usuario)) {
      return { ok: false, status: 400, error: 'tipo_usuario inválido' }
    }
    updates.tipo_usuario = params.tipo_usuario
  }
  if (typeof params.activo === 'boolean') updates.activo = params.activo

  if (typeof params.password === 'string' && params.password.length > 0) {
    if (params.password.length < 8) {
      return { ok: false, status: 400, error: 'La contraseña debe tener al menos 8 caracteres' }
    }
    updates.password = params.password
  }

  if (Object.keys(updates).length === 0) {
    return { ok: false, status: 400, error: 'No hay campos para actualizar' }
  }
  if (params.emailDeOtro) {
    return { ok: false, status: 400, error: 'El email ya está registrado' }
  }
  return { ok: true, status: 200, updates }
}

export function decidirActualizacionUsuario(params: {
  autenticado: boolean
  esAdmin: boolean
  id?: string
  existe: boolean
  email?: string
  nombre?: string
  apellido?: string
  tipo_usuario?: string
  activo?: boolean
  password?: string
  emailDeOtro?: boolean
}): {
  ok: boolean
  status: number
  error?: string
  code?: string
  data?: { message: string; user: { email?: string; nombre?: string; activo?: boolean } }
} {
  if (!params.autenticado) {
    return { ok: false, status: 401, error: 'Token de acceso requerido', code: 'NO_TOKEN' }
  }
  if (!params.esAdmin) {
    return { ok: false, status: 403, error: 'Permisos insuficientes', code: 'FORBIDDEN_ROLE' }
  }
  const v = validarActualizacionUsuario(params)
  if (!v.ok) return { ok: false, status: v.status, error: v.error }
  return {
    ok: true,
    status: 200,
    data: {
      message: 'Usuario actualizado',
      user: {
        email: typeof v.updates?.email === 'string' ? v.updates.email : params.email,
        nombre: typeof v.updates?.nombre === 'string' ? v.updates.nombre : params.nombre,
        activo: typeof v.updates?.activo === 'boolean' ? v.updates.activo : true,
      },
    },
  }
}

export function decidirDesactivacionUsuario(params: {
  autenticado: boolean
  esAdmin: boolean
  id?: string
  existe: boolean
  adminId?: string
}): {
  ok: boolean
  status: number
  error?: string
  code?: string
  data?: { message: string; user: { activo: boolean } }
} {
  if (!params.autenticado) {
    return { ok: false, status: 401, error: 'Token de acceso requerido', code: 'NO_TOKEN' }
  }
  if (!params.esAdmin) {
    return { ok: false, status: 403, error: 'Permisos insuficientes', code: 'FORBIDDEN_ROLE' }
  }
  if (!params.id) {
    return { ok: false, status: 400, error: 'ID de usuario requerido' }
  }
  if (!params.existe) {
    return { ok: false, status: 404, error: 'Usuario no encontrado' }
  }
  if (params.adminId && params.adminId === params.id) {
    return { ok: false, status: 400, error: 'No puedes desactivar tu propia cuenta' }
  }
  return {
    ok: true,
    status: 200,
    data: { message: 'Usuario desactivado', user: { activo: false } },
  }
}
