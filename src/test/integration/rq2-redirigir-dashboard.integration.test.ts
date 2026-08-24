import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'

const findUserByEmail = vi.fn()

vi.mock('../../config/supabase-only', () => ({
  SupabaseDB: { supabaseAdmin: { from: vi.fn() }, findUserById: vi.fn(), findUserByEmail: vi.fn() },
  supabaseAdmin: { from: vi.fn() },
  default: {},
}))

vi.mock('../../config/supabaseClient', () => ({
  supabaseAdmin: { from: vi.fn() },
  SupabaseDB: { supabaseAdmin: { from: vi.fn() } },
  default: {},
}))

vi.mock('../../modules/auth/auth.repository', () => ({
  authRepository: {
    findUserByEmail: (...args: unknown[]) => findUserByEmail(...args),
    updateUser: vi.fn(),
    findUserById: vi.fn(),
    createUserWithType: vi.fn(),
    countUsers: vi.fn(),
  },
}))

vi.mock('../../utils/passwordSecurity', async () => {
  const actual = await vi.importActual<typeof import('../../utils/passwordSecurity')>(
    '../../utils/passwordSecurity'
  )
  return { ...actual, verifyStoredPassword: vi.fn().mockResolvedValue({ ok: true }) }
})

import { app } from '../../app'
import { RoleService } from '../../modules/auth/role.service'

const user = {
  id: 'u1',
  email: 'samuel@test.com',
  password: 'hash',
  nombre: 'Samuel',
  apellido: 'Gallego',
  tipo_usuario: 'estudiante',
  activo: true,
}

/**
 * RQ2 integración — login usa el cálculo real de dashboard (sin stubear obtenerDashboardUsuario).
 */
describe('RQ2 integration — Redirigir dashboard en login', () => {
  beforeEach(() => {
    findUserByEmail.mockReset()
    // No usar restoreAllMocks: rompe el mock de verifyStoredPassword del módulo.
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('un rol: login calcula dashboard real → user.dashboard', async () => {
    findUserByEmail.mockResolvedValue(user)
    vi.spyOn(RoleService, 'obtenerRolesUsuario').mockResolvedValue(['estudiante'])
    vi.spyOn(RoleService, 'obtenerPermisosUsuario').mockResolvedValue([])

    const res = await request(app).post('/api/auth/login').send({
      email: 'samuel@test.com',
      password: 'secreto123',
    })

    expect(res.status).toBe(200)
    expect(res.body.requires_role_selection).toBeFalsy()
    expect(res.body.user.dashboard).toBe('/dashboard-estudiante')
  })

  it('varios roles: pide selección; login-with-role asigna path del rol', async () => {
    findUserByEmail.mockResolvedValue({ ...user, tipo_usuario: 'profesor' })
    vi.spyOn(RoleService, 'obtenerRolesUsuario').mockResolvedValue(['profesor', 'coordinador'])
    vi.spyOn(RoleService, 'obtenerPermisosUsuario').mockResolvedValue([])

    const loginRes = await request(app).post('/api/auth/login').send({
      email: 'samuel@test.com',
      password: 'secreto123',
    })

    expect(loginRes.status).toBe(200)
    expect(loginRes.body.requires_role_selection).toBe(true)
    expect(loginRes.body.available_roles).toEqual(['profesor', 'coordinador'])

    const roleRes = await request(app).post('/api/auth/login-with-role').send({
      email: 'samuel@test.com',
      password: 'secreto123',
      selectedRole: 'coordinador',
    })

    expect(roleRes.status).toBe(200)
    expect(roleRes.body.user.dashboard).toBe('/dashboard-coordinador')
  })
})
