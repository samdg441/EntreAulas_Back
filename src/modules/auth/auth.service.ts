import jwt from 'jsonwebtoken'
import { authRepository } from './auth.repository'
import { hashPassword, verifyStoredPassword } from '../../utils/passwordSecurity'
import { badRequest, unauthorized } from '../../shared/errors'

const VALID_USER_TYPES = new Set(['estudiante', 'profesor', 'docente', 'coordinador', 'admin', 'decano'])

export interface NuevoUsuarioInput {
  email: string
  password: string
  nombre: string
  apellido: string
  tipo_usuario: string
  codigo_profesor?: string
  departamento?: string
  codigo_estudiante?: string
  carrera_id?: number
  semestre?: string
}

export async function migrarPasswordSiHaceFalta(
  userId: string,
  passwordCheck: { migratePlaintextToHash?: string }
): Promise<void> {
  if (!passwordCheck.migratePlaintextToHash) return
  try {
    const hashedPassword = await hashPassword(passwordCheck.migratePlaintextToHash)
    await authRepository.updateUser(userId, { password: hashedPassword })
  } catch (updateError) {
    console.error('Error migrando contraseña a bcrypt:', updateError)
  }
}

export function tieneRolValido(tipoUsuario: string, roles: string[]): boolean {
  return (
    VALID_USER_TYPES.has(tipoUsuario) ||
    roles.some((rol) => VALID_USER_TYPES.has(rol))
  )
}

export function normalizarTipoUsuario(tipoUsuario: string): string {
  return tipoUsuario === 'docente' ? 'profesor' : tipoUsuario
}

function describirRolPrincipal(roles: string[], tipoUsuario: string): string {
  if (roles.includes('admin')) return 'Administrador del sistema'
  if (roles.includes('decano')) return 'Decano de la facultad'
  if (roles.includes('coordinador')) return 'Coordinador del sistema'
  if (roles.includes('profesor') || roles.includes('docente')) return 'Profesor/Docente del sistema'
  if (roles.includes('estudiante')) return 'Estudiante del sistema'
  return roles.length > 1
    ? `Usuario con múltiples roles: ${roles.join(', ')}`
    : `Usuario con rol: ${roles[0] || tipoUsuario}`
}

async function obtenerCoordinadorInfo(
  roles: string[],
  userId: string
): Promise<{ carrera_id: unknown } | null> {
  if (!roles.includes('coordinador')) return null
  try {
    const { RoleService } = await import('./role.service')
    const info = await RoleService.obtenerCoordinadorPorUsuario(userId)
    return info ? { carrera_id: info.carrera_id ?? null } : null
  } catch (e) {
    console.warn('Error obteniendo info del coordinador:', e)
    return null
  }
}

async function obtenerDecanoInfo(
  roles: string[],
  userId: string
): Promise<Record<string, unknown> | null> {
  if (!roles.includes('decano')) return null
  try {
    const { RoleService } = await import('./role.service')
    const info = await RoleService.obtenerDecanoPorUsuario(userId)
    if (!info) return null
    return {
      facultad_id: info.facultad_id ?? null,
      facultad_nombre: info.facultades?.nombre ?? null,
      fecha_nombramiento: info.fecha_nombramiento
    }
  } catch (e) {
    console.warn('Error obteniendo info del decano:', e)
    return null
  }
}

export async function resolverRolesUsuario(userId: string, tipoUsuario: string) {
  const { RoleService } = await import('./role.service')
  const roles: string[] = await RoleService.obtenerRolesUsuario(userId)

  if (!tieneRolValido(tipoUsuario, roles)) {
    throw unauthorized('Tipo de usuario no válido')
  }

  return roles
}

export async function armarPerfilConRoles(userId: string, roles: string[], tipoUsuario: string) {
  const { RoleService } = await import('./role.service')
  const dashboard = await RoleService.obtenerDashboardUsuario(userId)
  const permisos = await RoleService.obtenerPermisosUsuario(userId)
  const coordinadorInfo = await obtenerCoordinadorInfo(roles, userId)
  const decanoInfo = await obtenerDecanoInfo(roles, userId)

  const additionalInfo: Record<string, unknown> = {
    dashboard,
    permissions: permisos,
    roles,
    role_description: describirRolPrincipal(roles, tipoUsuario)
  }

  if (coordinadorInfo) {
    additionalInfo.coordinador = coordinadorInfo
  }

  if (decanoInfo) {
    additionalInfo.decano = decanoInfo
  }

  return additionalInfo
}

export async function autenticarCredenciales(email: string, password: string) {
  const user = await authRepository.findUserByEmail(email)

  if (!user) {
    throw unauthorized('Credenciales inválidas')
  }

  if (!user.activo) {
    throw unauthorized('Credenciales inválidas')
  }

  const passwordCheck = await verifyStoredPassword(password, user.password)

  if (!passwordCheck.ok) {
    throw unauthorized('Credenciales inválidas')
  }

  await migrarPasswordSiHaceFalta(user.id, passwordCheck)

  return user
}

export async function crearUsuarioConTipo(input: NuevoUsuarioInput) {
  const existingUser = await authRepository.findUserByEmail(input.email)

  if (existingUser) {
    throw badRequest('El email ya está registrado')
  }

  const hashedPassword = await hashPassword(input.password)

  return authRepository.createUserWithType({
    email: input.email,
    password: hashedPassword,
    nombre: input.nombre,
    apellido: input.apellido,
    tipo_usuario: input.tipo_usuario,
    codigo_profesor: input.codigo_profesor,
    departamento: input.departamento,
    codigo_estudiante: input.codigo_estudiante,
    carrera_id: input.carrera_id,
    semestre: input.semestre
  })
}

export function generarTokenSesion(payload: Record<string, unknown>): string {
  return jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: '24h' })
}
