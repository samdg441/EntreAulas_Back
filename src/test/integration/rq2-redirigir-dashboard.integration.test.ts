import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'

const findUserByEmail = vi.fn()

vi.mock('../../config/supabase-only', () => ({
  SupabaseDB: {
    supabaseAdmin: { from: vi.fn() },
    findUserById: vi.fn(),
    findUserByEmail: vi.fn(),
  },
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
  AuthRepository: class {},
}))

vi.mock('../../utils/passwordSecurity', async () => {
  const actual = await vi.importActual<typeof import('../../utils/passwordSecurity')>(
    '../../utils/passwordSecurity'
  )
  return {
    ...actual,
    verifyStoredPassword: vi.fn().mockResolvedValue({ ok: true }),
  }
})

import { app } from '../../app'
import { RoleService } from '../../modules/auth/role.service'

const baseUser = {
  id: 'user-1',
  email: 'samuel@test.com',
  password: 'hash',
  nombre: 'Samuel',
  apellido: 'Gallego',
  tipo_usuario: 'estudiante',
  activo: true,
}

describe('RQ2 integración — Redirigir al dashboard según el rol', () => {
  beforeEach(() => {
    findUserByEmail.mockReset()
    vi.restoreAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('Camino 1: un solo rol — back calcula path y lo envía en user.dashboard', async () => {
    findUserByEmail.mockResolvedValue(baseUser)
    vi.spyOn(RoleService, 'obtenerRolesUsuario').mockResolvedValue(['estudiante'])
    vi.spyOn(RoleService, 'obtenerDashboardUsuario').mockResolvedValue('/dashboard-estudiante')
    vi.spyOn(RoleService, 'obtenerPermisosUsuario').mockResolvedValue([])

    const res = await request(app).post('/api/auth/login').send({
      email: 'samuel@test.com',
      password: 'secret1',
    })

    expect(res.status).toBe(200)
    expect(res.body.requires_role_selection).toBeFalsy()
    expect(res.body.user.dashboard).toBe('/dashboard-estudiante')
    expect(res.body.token).toBeTruthy()
  })

  it('Camino 2: varios roles — pide selección y login-with-role asigna dashboard elegido', async () => {
    findUserByEmail.mockResolvedValue({
      ...baseUser,
      tipo_usuario: 'profesor',
    })
    vi.spyOn(RoleService, 'obtenerRolesUsuario').mockResolvedValue(['profesor', 'coordinador'])

    const loginRes = await request(app).post('/api/auth/login').send({
      email: 'samuel@test.com',
      password: 'secret1',
    })

    expect(loginRes.status).toBe(200)
    expect(loginRes.body.requires_role_selection).toBe(true)
    expect(loginRes.body.available_roles).toEqual(['profesor', 'coordinador'])

    const roleRes = await request(app).post('/api/auth/login-with-role').send({
      email: 'samuel@test.com',
      password: 'secret1',
      selectedRole: 'coordinador',
    })

    expect(roleRes.status).toBe(200)
    expect(roleRes.body.user.dashboard).toBe('/dashboard-coordinador')
    expect(roleRes.body.user.selected_role).toBe('coordinador')
  })
})
