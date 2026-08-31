import { z } from 'zod'

export const TIPOS_USUARIO_VALIDOS = [
  'estudiante',
  'profesor',
  'docente',
  'coordinador',
  'admin',
  'decano',
] as const

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export type ResultadoRegla<T = unknown> =
  | { ok: true; status: number; data?: T }
  | { ok: false; status: number; error: string; code?: string; details?: unknown }

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validarCamposCreacionUsuario(body: {
  email?: string
  password?: string
  nombre?: string
  apellido?: string
  tipo_usuario?: string
}): ResultadoRegla {
  if (!body.email || !body.password || !body.nombre || !body.apellido || !body.tipo_usuario) {
    return { ok: false, status: 400, error: 'Todos los campos son requeridos' }
  }
  if (!EMAIL_REGEX.test(body.email)) {
    return { ok: false, status: 400, error: 'Correo inválido' }
  }
  if (typeof body.password !== 'string' || body.password.length < 8) {
    return { ok: false, status: 400, error: 'La contraseña debe tener al menos 8 caracteres' }
  }
  return { ok: true, status: 200 }
}

export function decidirCreacionUsuario(params: {
  tieneToken: boolean
  tokenValido: boolean
  esAdmin: boolean
  emailYaExiste: boolean
  errorInterno?: boolean
  body: {
    email?: string
    password?: string
    nombre?: string
    apellido?: string
    tipo_usuario?: string
  }
}): ResultadoRegla {
  if (!params.tieneToken) {
    return { ok: false, status: 401, error: 'Token de acceso requerido', code: 'NO_TOKEN' }
  }
  if (!params.tokenValido) {
    return { ok: false, status: 401, error: 'Token inválido', code: 'TOKEN_INVALID' }
  }
  if (!params.esAdmin) {
    return { ok: false, status: 403, error: 'Permisos insuficientes', code: 'FORBIDDEN_ROLE' }
  }
  const campos = validarCamposCreacionUsuario(params.body)
  if (!campos.ok) return campos
  if (params.emailYaExiste) {
    return { ok: false, status: 400, error: 'El email ya está registrado' }
  }
  if (params.errorInterno) {
    return { ok: false, status: 500, error: 'Error interno del servidor' }
  }
  return { ok: true, status: 201, data: { message: 'Usuario creado exitosamente' } }
}

export function validarDatosLogin(body: unknown): ResultadoRegla<{ email: string; password: string }> {
  const parsed = loginSchema.safeParse(body)
  if (!parsed.success) {
    return { ok: false, status: 400, error: 'Datos inválidos', details: parsed.error.errors }
  }
  return { ok: true, status: 200, data: parsed.data }
}

export function decidirLogin(params: {
  usuario: { activo: boolean; tipo_usuario: string } | null
  passwordOk: boolean
  roles: string[]
  errorInterno?: boolean
}): ResultadoRegla {
  if (params.errorInterno) {
    return { ok: false, status: 500, error: 'Error interno del servidor' }
  }
  if (!params.usuario || !params.usuario.activo) {
    return { ok: false, status: 401, error: 'Credenciales inválidas' }
  }
  if (!params.passwordOk) {
    return { ok: false, status: 401, error: 'Credenciales inválidas' }
  }
  const tipos = TIPOS_USUARIO_VALIDOS as readonly string[]
  const tieneRolValido =
    tipos.includes(params.usuario.tipo_usuario) ||
    params.roles.some((rol) => tipos.includes(rol))
  if (!tieneRolValido) {
    return { ok: false, status: 401, error: 'Tipo de usuario no válido' }
  }
  if (params.roles.length > 1) {
    return {
      ok: true,
      status: 200,
      data: {
        message: 'Usuario con múltiples roles detectado',
        requires_role_selection: true,
        available_roles: params.roles,
      },
    }
  }
  return { ok: true, status: 200, data: { message: 'Login exitoso' } }
}

export function normalizarTipoUsuario(tipoUsuario: string): { userType: string; userRole: string } {
  if (tipoUsuario === 'docente') {
    return { userType: 'profesor', userRole: 'profesor' }
  }
  return { userType: tipoUsuario, userRole: tipoUsuario }
}

export function descripcionRol(tipoUsuario: string): string {
  const tipo = tipoUsuario === 'docente' ? 'profesor' : tipoUsuario
  if (tipo === 'estudiante') return 'Estudiante del sistema'
  if (tipo === 'profesor') return 'Profesor/Docente del sistema'
  if (tipo === 'coordinador') return 'Coordinador del sistema'
  if (tipo === 'admin') return 'Administrador del sistema'
  if (tipo === 'decano') return 'Decano del sistema'
  return `Usuario con rol: ${tipoUsuario}`
}
