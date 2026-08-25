import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'

const { findUserByIdMock, findUserByEmailMock, createUserWithTypeMock } = vi.hoisted(() => ({
  findUserByIdMock: vi.fn(),
  findUserByEmailMock: vi.fn(),
  createUserWithTypeMock: vi.fn(),
}))

vi.mock('../../config/supabase-only', () => ({
  SupabaseDB: { supabaseAdmin: { from: vi.fn() }, findUserById: findUserByIdMock, findUserByEmail: vi.fn() },
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

import { app } from '../../app'
import { RoleService } from '../../modules/auth/role.service'

/** Firma un token real con el JWT_SECRET de test (ver src/test/setup.ts). */
function signToken(userId: string) {
  return jwt.sign({ userId }, process.env.JWT_SECRET as string)
}

/** Simula un usuario autenticado con el tipo/roles dados (rama feliz de authenticateToken). */
function mockAuthenticatedUser(tipo_usuario: string, roles: string[]) {
  findUserByIdMock.mockResolvedValue({
    id: 'user-1',
    email: 'admin@test.com',
    tipo_usuario,
    activo: true,
  })
  vi.spyOn(RoleService, 'obtenerRolesUsuario').mockResolvedValue(roles)
  vi.spyOn(RoleService, 'obtenerPermisosUsuario').mockResolvedValue([])
  return signToken('user-1')
}

const validBody = {
  email: 'nuevo@test.com',
  password: 'password123',
  nombre: 'Ana',
  apellido: 'Perez',
  tipo_usuario: 'estudiante',
}

describe('RQ1 unit — Crear usuario como administrador', () => {
  beforeEach(() => {
    findUserByIdMock.mockReset()
    findUserByEmailMock.mockReset()
    createUserWithTypeMock.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('C1: campos requeridos faltantes → 400', async () => {
    const token = mockAuthenticatedUser('admin', ['admin'])
    const { password, ...bodySinPassword } = validBody

    const res = await request(app)
      .post('/api/auth/create-user')
      .set('Authorization', `Bearer ${token}`)
      .send(bodySinPassword)

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Todos los campos son requeridos' })
    expect(createUserWithTypeMock).not.toHaveBeenCalled()
  })

  it('C2: contraseña corta → 400', async () => {
    const token = mockAuthenticatedUser('admin', ['admin'])

    const res = await request(app)
      .post('/api/auth/create-user')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...validBody, password: 'short1' })

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'La contraseña debe tener al menos 8 caracteres' })
    expect(createUserWithTypeMock).not.toHaveBeenCalled()
  })

  it('C3: email ya registrado → 400', async () => {
    const token = mockAuthenticatedUser('admin', ['admin'])
    findUserByEmailMock.mockResolvedValue({ id: 'existing-1', email: validBody.email })

    const res = await request(app)
      .post('/api/auth/create-user')
      .set('Authorization', `Bearer ${token}`)
      .send(validBody)

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'El email ya está registrado' })
    expect(createUserWithTypeMock).not.toHaveBeenCalled()
  })

  it('C4: camino ideal, todos los campos correctos → 201', async () => {
    const token = mockAuthenticatedUser('admin', ['admin'])
    findUserByEmailMock.mockResolvedValue(null)
    createUserWithTypeMock.mockResolvedValue({
      id: 'new-1',
      email: validBody.email,
      nombre: validBody.nombre,
      apellido: validBody.apellido,
      tipo_usuario: validBody.tipo_usuario,
      activo: true,
    })

    const res = await request(app)
      .post('/api/auth/create-user')
      .set('Authorization', `Bearer ${token}`)
      .send(validBody)

    expect(res.status).toBe(201)
    expect(res.body).toEqual({
      message: 'Usuario creado exitosamente',
      user: {
        id: 'new-1',
        email: validBody.email,
        nombre: validBody.nombre,
        apellido: validBody.apellido,
        tipo_usuario: validBody.tipo_usuario,
        activo: true,
      },
    })
  })

  it('C5: rol inválido (no admin) → 403', async () => {
    const token = mockAuthenticatedUser('estudiante', ['estudiante'])

    const res = await request(app)
      .post('/api/auth/create-user')
      .set('Authorization', `Bearer ${token}`)
      .send(validBody)

    expect(res.status).toBe(403)
    expect(res.body).toEqual({ error: 'Permisos insuficientes', code: 'FORBIDDEN_ROLE' })
    expect(findUserByEmailMock).not.toHaveBeenCalled()
  })

  it('C6: token inválido → 401', async () => {
    const res = await request(app)
      .post('/api/auth/create-user')
      .set('Authorization', 'Bearer not-a-real-jwt')
      .send(validBody)

    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: 'Token inválido', code: 'TOKEN_INVALID' })
    expect(findUserByEmailMock).not.toHaveBeenCalled()
  })

  it('C7: error interno del servidor → 500', async () => {
    const token = mockAuthenticatedUser('admin', ['admin'])
    findUserByEmailMock.mockResolvedValue(null)
    createUserWithTypeMock.mockRejectedValue(new Error('DB down'))

    const res = await request(app)
      .post('/api/auth/create-user')
      .set('Authorization', `Bearer ${token}`)
      .send(validBody)

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Error interno del servidor' })
  })

  it('C8: sin token → 401', async () => {
    const res = await request(app).post('/api/auth/create-user').send(validBody)

    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: 'Token de acceso requerido', code: 'NO_TOKEN' })
    expect(findUserByEmailMock).not.toHaveBeenCalled()
  })
})


describe('RQ1 unit — Fallas intencionales (evidencia solicitada)', () => {
  beforeEach(() => {
    findUserByIdMock.mockReset()
    findUserByEmailMock.mockReset()
    createUserWithTypeMock.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('FALLA C1: campos faltantes — se espera (mal) 201 en vez de 400', async () => {
    const token = mockAuthenticatedUser('admin', ['admin'])
    const { password, ...bodySinPassword } = validBody

    const res = await request(app)
      .post('/api/auth/create-user')
      .set('Authorization', `Bearer ${token}`)
      .send(bodySinPassword)

    expect(res.status).toBe(201) // esperado real: 400
  })

  it('FALLA C4: camino ideal — se espera (mal) 400 en vez de 201', async () => {
    const token = mockAuthenticatedUser('admin', ['admin'])
    findUserByEmailMock.mockResolvedValue(null)
    createUserWithTypeMock.mockResolvedValue({
      id: 'new-1',
      email: validBody.email,
      nombre: validBody.nombre,
      apellido: validBody.apellido,
      tipo_usuario: validBody.tipo_usuario,
      activo: true,
    })

    const res = await request(app)
      .post('/api/auth/create-user')
      .set('Authorization', `Bearer ${token}`)
      .send(validBody)

    expect(res.status).toBe(400) // esperado real: 201
  })

  it('FALLA C7: error interno — se espera (mal) un mensaje distinto al real', async () => {
    const token = mockAuthenticatedUser('admin', ['admin'])
    findUserByEmailMock.mockResolvedValue(null)
    createUserWithTypeMock.mockRejectedValue(new Error('DB down'))

    const res = await request(app)
      .post('/api/auth/create-user')
      .set('Authorization', `Bearer ${token}`)
      .send(validBody)

    expect(res.body).toEqual({ error: 'Usuario creado exitosamente' }) // esperado real: { error: 'Error interno del servidor' }
  })
})
