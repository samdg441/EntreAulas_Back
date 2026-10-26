import { authRepository } from './auth.repository'
import { hashPassword } from '../../utils/passwordSecurity'

/**
 * Reglas de sesión compartidas por login, login-with-role y me (RQ2).
 * Se separaron de auth.routes.ts para que las rutas solo orquesten HTTP.
 */

/** Datos extra que el login agrega al usuario según sus roles. */
export interface InfoDeSesion {
  dashboard: string
  permissions: string[]
  roles: string[]
  role_description: string
  coordinador?: { carrera_id: unknown }
  decano?: Record<string, unknown>
}

export const VALID_USER_TYPES = new Set(['estudiante', 'profesor', 'docente', 'coordinador', 'admin', 'decano'])



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

// Normaliza 'docente' a 'profesor' para compatibilidad con el frontend.
export function normalizarTipoUsuario(tipoUsuario: string): string {
  return tipoUsuario === 'docente' ? 'profesor' : tipoUsuario
}

export function describirRolPrincipal(roles: string[], tipoUsuario: string): string {
  if (roles.includes('admin')) return 'Administrador del sistema'
  if (roles.includes('decano')) return 'Decano de la facultad'
  if (roles.includes('coordinador')) return 'Coordinador del sistema'
  if (roles.includes('profesor') || roles.includes('docente')) return 'Profesor/Docente del sistema'
  if (roles.includes('estudiante')) return 'Estudiante del sistema'
  return roles.length > 1
    ? `Usuario con múltiples roles: ${roles.join(', ')}`
    : `Usuario con rol: ${roles[0] || tipoUsuario}`
}

export async function obtenerCoordinadorInfo(
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

export async function obtenerDecanoInfo(
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

const INFO_POR_TIPO: Record<string, Pick<InfoDeSesion, 'dashboard' | 'permissions' | 'role_description'>> = {
  estudiante: {
    dashboard: '/dashboard-estudiante',
    permissions: ['view_evaluations', 'submit_evaluations'],
    role_description: 'Estudiante del sistema',
  },
  profesor: {
    dashboard: '/dashboard-profesor',
    permissions: ['view_evaluations', 'create_evaluations', 'view_reports'],
    role_description: 'Profesor/Docente del sistema',
  },
  coordinador: {
    dashboard: '/dashboard-coordinador',
    permissions: ['view_evaluations', 'create_evaluations', 'view_reports', 'manage_users'],
    role_description: 'Coordinador académico',
  },
  admin: {
    dashboard: '/dashboard-admin',
    permissions: ['all'],
    role_description: 'Administrador del sistema',
  },
}

/** Panel, permisos y descripción para GET /me según el tipo de usuario (docente = profesor). */
export function infoPorTipoDeUsuario(tipoUsuario: string) {
  return INFO_POR_TIPO[normalizarTipoUsuario(tipoUsuario)] ?? {}
}

