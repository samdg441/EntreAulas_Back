/**
 * DEF-16 — login-with-role sin rol seleccionado responde como si la
 * contraseña fuera incorrecta (RQ19, integración)
 *
 * Severidad: Media | Estado: ABIERTO
 *
 * `POST /auth/login-with-role` exige `selectedRole`, pero si falta o va
 * vacío no valida el cuerpo: cae en `roles.includes(selectedRole)` y
 * responde 401 "Credenciales inválidas". El cliente no puede distinguir
 * "olvidé enviar el rol" de "usuario o contraseña malos".
 */
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
  tipo_usuario: 'profesor',
  activo: true,
}

describe('DEF-16 — Falta de rol en login-with-role debe ser 400', () => {
  beforeEach(() => {
    findUserByEmail.mockReset()
    findUserByEmail.mockResolvedValue(user)
    vi.spyOn(RoleService, 'obtenerRolesUsuario').mockResolvedValue(['profesor', 'coordinador'])
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('sin selectedRole debe responder 400, no 401 de credenciales', async () => {
    const res = await request(app).post('/api/auth/login-with-role').send({
      email: 'samuel@test.com',
      password: 'secreto123',
    })

    expect(res.status).toBe(400)
    expect(res.body.error).not.toMatch(/credenciales/i)
  })

  it('selectedRole vacío debe responder 400', async () => {
    const res = await request(app).post('/api/auth/login-with-role').send({
      email: 'samuel@test.com',
      password: 'secreto123',
      selectedRole: '',
    })

    expect(res.status).toBe(400)
  })
})
