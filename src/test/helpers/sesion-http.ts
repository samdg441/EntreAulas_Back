import jwt from 'jsonwebtoken'
import { vi } from 'vitest'
import { supabaseModuleMock } from './supabase-mock'
import { RoleService } from '../../modules/auth/role.service'

/**
 * Sesión real para pruebas HTTP con Supertest: el JWT se firma con el JWT_SECRET de pruebas y
 * pasa por el middleware `authenticateToken` verdadero. Solo se simula la base de datos.
 *
 * Requiere en el archivo de prueba:
 *   vi.mock('../../config/supabase-only', () => supabaseModuleMock)
 *   vi.mock('../../config/supabaseClient', () => supabaseModuleMock)
 */
export type UsuarioSesion = {
  id: string
  email: string
  tipo_usuario: string
  roles: string[]
  permisos?: string[]
}

const findUserById = supabaseModuleMock.SupabaseDB.findUserById as ReturnType<typeof vi.fn>

export function firmarToken(
  payload: Record<string, unknown>,
  opciones: jwt.SignOptions & { secreto?: string } = {}
) {
  const { secreto, ...firma } = opciones
  return jwt.sign(payload, secreto ?? (process.env.JWT_SECRET as string), { expiresIn: '10m', ...firma })
}

/** Deja al usuario activo en la "base" y devuelve el header Authorization listo para usar. */
export function iniciarSesion(usuario: UsuarioSesion, { activo = true } = {}) {
  findUserById.mockImplementation(async (id: string) => (id === usuario.id ? { ...usuario, activo } : null))
  vi.spyOn(RoleService, 'obtenerRolesUsuario').mockResolvedValue(usuario.roles)
  vi.spyOn(RoleService, 'obtenerPermisosUsuario').mockResolvedValue(usuario.permisos ?? [])
  return `Bearer ${firmarToken({ userId: usuario.id })}`
}

export function reiniciarSesion() {
  findUserById.mockReset()
}
