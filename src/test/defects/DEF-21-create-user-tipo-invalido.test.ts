/**
 * DEF-21 — create-user no valida tipo_usuario (RQ10)
 *
 * Severidad: Alta | Estado: ABIERTO
 *
 * PUT /api/users/:id rechaza tipos fuera de ALLOWED_USER_TYPES con
 * `{ error: 'tipo_usuario inválido' }`. POST /auth/create-user solo exige
 * que el campo exista y persiste `superadmin`, `root`, etc.
 *
 * Esta prueba expresa el comportamiento CORRECTO esperado y falla a propósito.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { setTestUser } from '../helpers/test-user'
import { adminUser } from '../fixtures/users'

const { findUserByEmailMock, createUserWithTypeMock } = vi.hoisted(() => ({
  findUserByEmailMock: vi.fn(),
  createUserWithTypeMock: vi.fn(),
}))

vi.mock('../../config/supabase-only', () => ({
  SupabaseDB: { supabaseAdmin: { from: vi.fn() }, findUserById: vi.fn() },
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
    findUserByEmail: (...args: unknown[]) => findUserByEmailMock(...args),
    createUserWithType: (...args: unknown[]) => createUserWithTypeMock(...args),
    updateUser: vi.fn(),
    findUserById: vi.fn(),
    countUsers: vi.fn(),
  },
}))
vi.mock('../../middleware/auth', () => import('../helpers/auth-mock'))

import { app } from '../../app'

const bodySuperadmin = {
  email: 'hack@test.com',
  password: 'password123',
  nombre: 'X',
  apellido: 'Y',
  tipo_usuario: 'superadmin',
}

describe('DEF-21 — create-user debe rechazar tipo_usuario fuera del enum', () => {
  beforeEach(() => {
    findUserByEmailMock.mockReset()
    createUserWithTypeMock.mockReset()
    setTestUser(adminUser)
    findUserByEmailMock.mockResolvedValue(null)
    createUserWithTypeMock.mockResolvedValue({
      id: 'new-1',
      email: bodySuperadmin.email,
      nombre: bodySuperadmin.nombre,
      apellido: bodySuperadmin.apellido,
      tipo_usuario: bodySuperadmin.tipo_usuario,
      activo: true,
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it("tipo_usuario 'superadmin' debe responder 400 y no persistir", async () => {
    const res = await request(app).post('/api/auth/create-user').send(bodySuperadmin)

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'tipo_usuario inválido' })
    expect(createUserWithTypeMock).not.toHaveBeenCalled()
  })
})
