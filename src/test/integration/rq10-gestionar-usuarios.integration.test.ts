/**
 * Integración RQ10: el grafo completo vive en `src/test/unit/rq10-*.test.ts`.
 * Contrato HTTP de auth (C1), alta (C3) y desactivación (C7).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'

const { findUserByIdMock, findUserByEmailMock, createUserWithTypeMock, deactivateUserMock } =
  vi.hoisted(() => ({
    findUserByIdMock: vi.fn(),
    findUserByEmailMock: vi.fn(),
    createUserWithTypeMock: vi.fn(),
    deactivateUserMock: vi.fn(),
  }))

vi.mock('../../config/supabase-only', () => ({
  SupabaseDB: {
    supabaseAdmin: { from: vi.fn() },
    findUserById: findUserByIdMock,
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
    findUserByEmail: (...args: unknown[]) => findUserByEmailMock(...args),
    createUserWithType: (...args: unknown[]) => createUserWithTypeMock(...args),
    updateUser: vi.fn(),
    findUserById: (...args: unknown[]) => findUserByIdMock(...args),
    countUsers: vi.fn(),
  },
}))

vi.mock('../../modules/academic/academic.service', () => ({
  academicService: {
    updateUser: vi.fn(),
    deactivateUser: (...args: unknown[]) => deactivateUserMock(...args),
    listUsersSummary: vi.fn(),
    getAcademicStructure: vi.fn(),
    getDashboardStats: vi.fn(),
    getGruposConProfesorByCareer: vi.fn(),
  },
  AcademicService: class {},
}))

import { app } from '../../app'
import { RoleService } from '../../modules/auth/role.service'

const createBody = {
  email: 'nuevo@test.com',
  password: 'password123',
  nombre: 'Luis',
  apellido: 'Gomez',
  tipo_usuario: 'estudiante',
}

describe('RQ10 integration — smoke gestionar usuarios', () => {
  beforeEach(() => {
    findUserByIdMock.mockReset()
    findUserByEmailMock.mockReset()
    createUserWithTypeMock.mockReset()
    deactivateUserMock.mockReset()
    vi.restoreAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('C1 HTTP: sin token → 401', async () => {
    const res = await request(app).post('/api/auth/create-user').send(createBody)
    expect(res.status).toBe(401)
    expect(res.body.code).toBe('NO_TOKEN')
  })

  it('C3 HTTP: 201 usuario creado', async () => {
    findUserByIdMock.mockResolvedValue({
      id: 'user-1',
      email: 'admin@test.com',
      tipo_usuario: 'admin',
      activo: true,
    })
    vi.spyOn(RoleService, 'obtenerRolesUsuario').mockResolvedValue(['admin'])
    vi.spyOn(RoleService, 'obtenerPermisosUsuario').mockResolvedValue([])
    findUserByEmailMock.mockResolvedValue(null)
    createUserWithTypeMock.mockResolvedValue({
      id: 'new-1',
      ...createBody,
      password: undefined,
      activo: true,
    })

    const token = jwt.sign({ userId: 'user-1' }, process.env.JWT_SECRET as string)
    const res = await request(app)
      .post('/api/auth/create-user')
      .set('Authorization', `Bearer ${token}`)
      .send(createBody)

    expect(res.status).toBe(201)
    expect(res.body.message).toBe('Usuario creado exitosamente')
    expect(res.body.user.id).toBe('new-1')
  })

  it('C7 HTTP: 200 usuario desactivado', async () => {
    findUserByIdMock.mockImplementation(async (id: string) => {
      if (id === 'user-1') {
        return { id: 'user-1', email: 'admin@test.com', tipo_usuario: 'admin', activo: true }
      }
      if (id === 'other-1') {
        return {
          id: 'other-1',
          email: 'ana@test.com',
          nombre: 'Ana',
          apellido: 'Perez',
          tipo_usuario: 'estudiante',
          activo: true,
        }
      }
      return null
    })
    vi.spyOn(RoleService, 'obtenerRolesUsuario').mockResolvedValue(['admin'])
    vi.spyOn(RoleService, 'obtenerPermisosUsuario').mockResolvedValue([])
    deactivateUserMock.mockResolvedValue({
      id: 'other-1',
      email: 'ana@test.com',
      nombre: 'Ana',
      apellido: 'Perez',
      tipo_usuario: 'estudiante',
      activo: false,
    })

    const token = jwt.sign({ userId: 'user-1' }, process.env.JWT_SECRET as string)
    const res = await request(app)
      .delete('/api/users/other-1')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.message).toBe('Usuario desactivado')
    expect(res.body.user.activo).toBe(false)
  })
})
