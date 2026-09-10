import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'

const {
  findUserByIdMock,
  findUserByEmailMock,
  createUserWithTypeMock,
  updateUserMock,
  deactivateUserMock,
} = vi.hoisted(() => ({
  findUserByIdMock: vi.fn(),
  findUserByEmailMock: vi.fn(),
  createUserWithTypeMock: vi.fn(),
  updateUserMock: vi.fn(),
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
    updateUser: (...args: unknown[]) => updateUserMock(...args),
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

function signToken(userId: string) {
  return jwt.sign({ userId }, process.env.JWT_SECRET as string)
}

const adminRecord = {
  id: 'user-1',
  email: 'admin@test.com',
  tipo_usuario: 'admin',
  activo: true,
  nombre: 'Ada',
  apellido: 'Admin',
}

const otherUser = {
  id: 'other-1',
  email: 'ana@test.com',
  nombre: 'Ana',
  apellido: 'Perez',
  tipo_usuario: 'estudiante',
  activo: true,
}

function mockAuthenticatedUser(tipo_usuario: string, roles: string[], id = 'user-1') {
  findUserByIdMock.mockImplementation(async (lookupId: string) => {
    if (lookupId === id) {
      return { ...adminRecord, id, tipo_usuario, email: `${tipo_usuario}@test.com` }
    }
    if (lookupId === otherUser.id) return { ...otherUser }
    return null
  })
  vi.spyOn(RoleService, 'obtenerRolesUsuario').mockResolvedValue(roles)
  vi.spyOn(RoleService, 'obtenerPermisosUsuario').mockResolvedValue([])
  return signToken(id)
}

const createBody = {
  email: 'nuevo@test.com',
  password: 'password123',
  nombre: 'Luis',
  apellido: 'Gomez',
  tipo_usuario: 'estudiante',
}

/**
 * RQ10 Backend — Gestionar usuarios (POST create-user, PUT/DELETE /api/users/:id)
 * C1 1-2-3-4-5-18 → 401/403
 * C2 1-2-3-4-6-7-8-9-18 → 400 alta
 * C3 1-2-3-4-6-7-8-10-18 → 201
 * C4 1-2-3-4-6-11-12-13-14-18 → 400/404 update
 * C5 1-2-3-4-6-11-12-13-15-18 → 200 update
 * C6 1-2-3-4-6-11-16-14-18 → 400/404 delete
 * C7 1-2-3-4-6-11-16-17-18 → 200 soft-delete
 */
describe('RQ10 unit — Gestionar usuarios (admin)', () => {
  beforeEach(() => {
    findUserByIdMock.mockReset()
    findUserByEmailMock.mockReset()
    createUserWithTypeMock.mockReset()
    updateUserMock.mockReset()
    deactivateUserMock.mockReset()
    vi.restoreAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  describe('caminos que fallan', () => {
    it('C1 (1-2-3-4-5-18): sin JWT, inactivo o no admin → 401/403', async () => {
      const sinToken = await request(app).post('/api/auth/create-user').send(createBody)
      expect(sinToken.status).toBe(401)
      expect(sinToken.body.code).toBe('NO_TOKEN')

      const tokenEstudiante = mockAuthenticatedUser('estudiante', ['estudiante'])
      const noAdmin = await request(app)
        .post('/api/auth/create-user')
        .set('Authorization', `Bearer ${tokenEstudiante}`)
        .send(createBody)
      expect(noAdmin.status).toBe(403)
      expect(noAdmin.body.code).toBe('FORBIDDEN_ROLE')
    })

    it('C2 (1-2-3-4-6-7-8-9-18): alta inválida (campos, password o email) → 400', async () => {
      const token = mockAuthenticatedUser('admin', ['admin'])

      const faltan = await request(app)
        .post('/api/auth/create-user')
        .set('Authorization', `Bearer ${token}`)
        .send({ email: 'a@test.com' })
      expect(faltan.status).toBe(400)
      expect(faltan.body).toEqual({ error: 'Todos los campos son requeridos' })

      const corta = await request(app)
        .post('/api/auth/create-user')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...createBody, password: 'short1' })
      expect(corta.status).toBe(400)
      expect(corta.body).toEqual({ error: 'La contraseña debe tener al menos 8 caracteres' })

      findUserByEmailMock.mockResolvedValue({ id: 'existing-1', email: createBody.email })
      const duplicado = await request(app)
        .post('/api/auth/create-user')
        .set('Authorization', `Bearer ${token}`)
        .send(createBody)
      expect(duplicado.status).toBe(400)
      expect(duplicado.body).toEqual({ error: 'El email ya está registrado' })
      expect(createUserWithTypeMock).not.toHaveBeenCalled()
    })

    it('C4 (1-2-3-4-6-11-12-13-14-18): PUT inválido → 400/404', async () => {
      const token = mockAuthenticatedUser('admin', ['admin'])

      const noExiste = await request(app)
        .put('/api/users/missing-id')
        .set('Authorization', `Bearer ${token}`)
        .send({ nombre: 'X' })
      expect(noExiste.status).toBe(404)
      expect(noExiste.body).toEqual({ error: 'Usuario no encontrado' })

      const tipoInvalido = await request(app)
        .put(`/api/users/${otherUser.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ tipo_usuario: 'superadmin' })
      expect(tipoInvalido.status).toBe(400)
      expect(tipoInvalido.body).toEqual({ error: 'tipo_usuario inválido' })
      expect(updateUserMock).not.toHaveBeenCalled()
    })

    it('C6 (1-2-3-4-6-11-16-14-18): DELETE inexistente o auto-desactivación → 400/404', async () => {
      const token = mockAuthenticatedUser('admin', ['admin'])

      const noExiste = await request(app)
        .delete('/api/users/missing-id')
        .set('Authorization', `Bearer ${token}`)
      expect(noExiste.status).toBe(404)
      expect(noExiste.body).toEqual({ error: 'Usuario no encontrado' })

      const propio = await request(app)
        .delete('/api/users/user-1')
        .set('Authorization', `Bearer ${token}`)
      expect(propio.status).toBe(400)
      expect(propio.body).toEqual({ error: 'No puedes desactivar tu propia cuenta' })
      expect(deactivateUserMock).not.toHaveBeenCalled()
    })
  })

  describe('caminos que funcionan', () => {
    it('C3 (1-2-3-4-6-7-8-10-18): alta válida → 201 sin password', async () => {
      const token = mockAuthenticatedUser('admin', ['admin'])
      findUserByEmailMock.mockResolvedValue(null)
      createUserWithTypeMock.mockResolvedValue({
        id: 'new-1',
        email: createBody.email,
        nombre: createBody.nombre,
        apellido: createBody.apellido,
        tipo_usuario: createBody.tipo_usuario,
        activo: true,
      })

      const res = await request(app)
        .post('/api/auth/create-user')
        .set('Authorization', `Bearer ${token}`)
        .send(createBody)

      expect(res.status).toBe(201)
      expect(res.body).toEqual({
        message: 'Usuario creado exitosamente',
        user: {
          id: 'new-1',
          email: createBody.email,
          nombre: createBody.nombre,
          apellido: createBody.apellido,
          tipo_usuario: createBody.tipo_usuario,
          activo: true,
        },
      })
      expect(res.body.user.password).toBeUndefined()
    })

    it('C5 (1-2-3-4-6-11-12-13-15-18): PUT válido → 200 usuario actualizado', async () => {
      const token = mockAuthenticatedUser('admin', ['admin'])
      updateUserMock.mockResolvedValue({
        ...otherUser,
        nombre: 'Ana Maria',
      })

      const res = await request(app)
        .put(`/api/users/${otherUser.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ nombre: 'Ana Maria' })

      expect(res.status).toBe(200)
      expect(res.body.message).toBe('Usuario actualizado')
      expect(res.body.user.nombre).toBe('Ana Maria')
      expect(updateUserMock).toHaveBeenCalledWith(otherUser.id, { nombre: 'Ana Maria' })
    })

    it('C7 (1-2-3-4-6-11-16-17-18): DELETE de otro usuario → 200 activo false', async () => {
      const token = mockAuthenticatedUser('admin', ['admin'])
      deactivateUserMock.mockResolvedValue({ ...otherUser, activo: false })

      const res = await request(app)
        .delete(`/api/users/${otherUser.id}`)
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({
        message: 'Usuario desactivado',
        user: {
          id: otherUser.id,
          email: otherUser.email,
          nombre: otherUser.nombre,
          apellido: otherUser.apellido,
          tipo_usuario: otherUser.tipo_usuario,
          activo: false,
        },
      })
      expect(deactivateUserMock).toHaveBeenCalledWith(otherUser.id)
    })
  })
})
