import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'

const {
  findUserByIdMock,
  findUserByEmailMock,
  createUserWithTypeMock,
  updateUserMock,
  deactivateUserMock,
  listUsersSummaryMock,
  getAcademicStructureMock,
  getDashboardStatsMock,
  getGruposMock,
  updateAuthUserMock,
} = vi.hoisted(() => ({
  findUserByIdMock: vi.fn(),
  findUserByEmailMock: vi.fn(),
  createUserWithTypeMock: vi.fn(),
  updateUserMock: vi.fn(),
  deactivateUserMock: vi.fn(),
  listUsersSummaryMock: vi.fn(),
  getAcademicStructureMock: vi.fn(),
  getDashboardStatsMock: vi.fn(),
  getGruposMock: vi.fn(),
  updateAuthUserMock: vi.fn(),
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
    updateUser: (...args: unknown[]) => updateAuthUserMock(...args),
    findUserById: (...args: unknown[]) => findUserByIdMock(...args),
    countUsers: vi.fn(),
  },
}))

vi.mock('../../modules/academic/academic.service', () => ({
  academicService: {
    updateUser: (...args: unknown[]) => updateUserMock(...args),
    deactivateUser: (...args: unknown[]) => deactivateUserMock(...args),
    listUsersSummary: (...args: unknown[]) => listUsersSummaryMock(...args),
    getAcademicStructure: (...args: unknown[]) => getAcademicStructureMock(...args),
    getDashboardStats: (...args: unknown[]) => getDashboardStatsMock(...args),
    getGruposConProfesorByCareer: (...args: unknown[]) => getGruposMock(...args),
  },
  AcademicService: class {},
}))

import { app } from '../../app'
import { RoleService } from '../../modules/auth/role.service'
import { hashPassword } from '../../utils/passwordSecurity'

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
    listUsersSummaryMock.mockReset()
    getAcademicStructureMock.mockReset()
    getDashboardStatsMock.mockReset()
    getGruposMock.mockReset()
    updateAuthUserMock.mockReset()
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

const loginUser = {
  id: 'login-1',
  email: 'login@test.com',
  nombre: 'Ana',
  apellido: 'Perez',
  tipo_usuario: 'estudiante',
  activo: true,
}

describe('RQ10 unit — auth.routes y listados de usuarios', () => {
  beforeEach(() => {
    findUserByIdMock.mockReset()
    findUserByEmailMock.mockReset()
    createUserWithTypeMock.mockReset()
    updateUserMock.mockReset()
    deactivateUserMock.mockReset()
    listUsersSummaryMock.mockReset()
    getAcademicStructureMock.mockReset()
    getDashboardStatsMock.mockReset()
    getGruposMock.mockReset()
    updateAuthUserMock.mockReset()
    vi.restoreAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('POST /auth/register valida, rechaza duplicado y crea usuario', async () => {
    const invalido = await request(app).post('/api/auth/register').send({ email: 'no-es-email' })
    expect(invalido.status).toBe(400)

    findUserByEmailMock.mockResolvedValue({ id: 'ya' })
    const duplicado = await request(app).post('/api/auth/register').send({
      email: 'nuevo@test.com',
      nombre: 'Luis',
      apellido: 'Gomez',
      tipo_usuario: 'estudiante',
      password: 'password123',
    })
    expect(duplicado.status).toBe(400)

    findUserByEmailMock.mockResolvedValue(null)
    createUserWithTypeMock.mockResolvedValue({
      id: 'new-1',
      email: 'nuevo@test.com',
      nombre: 'Luis',
      apellido: 'Gomez',
      tipo_usuario: 'estudiante',
    })
    const ok = await request(app).post('/api/auth/register').send({
      email: 'nuevo@test.com',
      nombre: 'Luis',
      apellido: 'Gomez',
      tipo_usuario: 'estudiante',
      password: 'password123',
      codigo_estudiante: 'E1',
      carrera_id: 1,
      semestre: '3',
    })
    expect(ok.status).toBe(201)
    expect(ok.body.token).toBeTruthy()
    expect(ok.body.user.email).toBe('nuevo@test.com')
  })

  it('POST /auth/login cubre credenciales, roles y dashboards', async () => {
    const hashed = await hashPassword('password123')
    const body = { email: loginUser.email, password: 'password123' }

    const zod = await request(app).post('/api/auth/login').send({ email: 'x' })
    expect(zod.status).toBe(400)

    findUserByEmailMock.mockResolvedValue(null)
    expect((await request(app).post('/api/auth/login').send(body)).status).toBe(401)

    findUserByEmailMock.mockResolvedValue({ ...loginUser, activo: false, password: hashed })
    expect((await request(app).post('/api/auth/login').send(body)).status).toBe(401)

    findUserByEmailMock.mockResolvedValue({ ...loginUser, password: hashed })
    const malaClave = await request(app)
      .post('/api/auth/login')
      .send({ email: loginUser.email, password: 'otra-clave-1' })
    expect(malaClave.status).toBe(401)

    findUserByEmailMock.mockResolvedValue({ ...loginUser, tipo_usuario: 'desconocido', password: hashed })
    vi.spyOn(RoleService, 'obtenerRolesUsuario').mockResolvedValue([])
    const tipoInvalido = await request(app).post('/api/auth/login').send(body)
    expect(tipoInvalido.status).toBe(401)

    findUserByEmailMock.mockResolvedValue({ ...loginUser, password: hashed })
    vi.spyOn(RoleService, 'obtenerRolesUsuario').mockResolvedValue(['profesor', 'coordinador'])
    const multi = await request(app).post('/api/auth/login').send(body)
    expect(multi.status).toBe(200)
    expect(multi.body.requires_role_selection).toBe(true)

    vi.spyOn(RoleService, 'obtenerRolesUsuario').mockResolvedValue(['estudiante'])
    vi.spyOn(RoleService, 'obtenerDashboardUsuario').mockResolvedValue('/dashboard-estudiante')
    vi.spyOn(RoleService, 'obtenerPermisosUsuario').mockResolvedValue(['view_evaluations'])
    const ok = await request(app).post('/api/auth/login').send(body)
    expect(ok.status).toBe(200)
    expect(ok.body.token).toBeTruthy()
    expect(ok.body.user.dashboard).toBe('/dashboard-estudiante')

    findUserByEmailMock.mockResolvedValue({
      ...loginUser,
      tipo_usuario: 'docente',
      password: hashed,
    })
    vi.spyOn(RoleService, 'obtenerRolesUsuario').mockResolvedValue(['visitante'])
    vi.spyOn(RoleService, 'obtenerDashboardUsuario').mockResolvedValue('/dashboard-profesor')
    vi.spyOn(RoleService, 'obtenerPermisosUsuario').mockResolvedValue([])
    const docente = await request(app).post('/api/auth/login').send(body)
    expect(docente.status).toBe(200)
    expect(docente.body.user.user_type).toBe('profesor')

    findUserByEmailMock.mockResolvedValue({
      ...loginUser,
      tipo_usuario: 'coordinador',
      password: hashed,
    })
    vi.spyOn(RoleService, 'obtenerRolesUsuario').mockResolvedValue(['coordinador'])
    vi.spyOn(RoleService, 'obtenerCoordinadorPorUsuario').mockResolvedValue({
      carrera_id: 3,
    } as never)
    vi.spyOn(RoleService, 'obtenerDecanoPorUsuario').mockResolvedValue(null)
    const coord = await request(app).post('/api/auth/login').send(body)
    expect(coord.status).toBe(200)
    expect(coord.body.user.coordinador).toEqual({ carrera_id: 3 })

    findUserByEmailMock.mockResolvedValue({
      ...loginUser,
      tipo_usuario: 'decano',
      password: hashed,
    })
    vi.spyOn(RoleService, 'obtenerRolesUsuario').mockResolvedValue(['decano'])
    vi.spyOn(RoleService, 'obtenerDecanoPorUsuario').mockResolvedValue({
      facultad_id: 2,
      facultades: { nombre: 'Ingeniería' },
      fecha_nombramiento: '2026-01-01',
    } as never)
    const decano = await request(app).post('/api/auth/login').send(body)
    expect(decano.status).toBe(200)
    expect(decano.body.user.decano.facultad_nombre).toBe('Ingeniería')

    findUserByEmailMock.mockResolvedValue({
      ...loginUser,
      tipo_usuario: 'admin',
      password: hashed,
    })
    vi.spyOn(RoleService, 'obtenerRolesUsuario').mockResolvedValue(['admin'])
    const admin = await request(app).post('/api/auth/login').send(body)
    expect(admin.status).toBe(200)
    expect(admin.body.user.role_description).toMatch(/Administrador/)

    findUserByEmailMock.mockResolvedValue({ ...loginUser, password: 'password123' })
    const prevPlain = process.env.ALLOW_LEGACY_PLAINTEXT_LOGIN
    process.env.ALLOW_LEGACY_PLAINTEXT_LOGIN = 'true'
    vi.spyOn(RoleService, 'obtenerRolesUsuario').mockResolvedValue(['estudiante'])
    const migrado = await request(app).post('/api/auth/login').send(body)
    process.env.ALLOW_LEGACY_PLAINTEXT_LOGIN = prevPlain
    expect(migrado.status).toBe(200)
    expect(updateAuthUserMock).toHaveBeenCalled()

    vi.spyOn(RoleService, 'obtenerCoordinadorPorUsuario').mockRejectedValue(new Error('fail'))
    vi.spyOn(RoleService, 'obtenerDecanoPorUsuario').mockRejectedValue(new Error('fail'))
    findUserByEmailMock.mockResolvedValue({
      ...loginUser,
      tipo_usuario: 'coordinador',
      password: hashed,
    })
    vi.spyOn(RoleService, 'obtenerRolesUsuario').mockResolvedValue(['coordinador'])
    const catchInfo = await request(app).post('/api/auth/login').send(body)
    expect(catchInfo.status).toBe(200)
  })

  it('POST /auth/login-with-role valida usuario, clave y rol', async () => {
    const hashed = await hashPassword('password123')
    const payload = { email: loginUser.email, password: 'password123', selectedRole: 'estudiante' }

    findUserByEmailMock.mockResolvedValue(null)
    expect((await request(app).post('/api/auth/login-with-role').send(payload)).status).toBe(401)

    findUserByEmailMock.mockResolvedValue({ ...loginUser, activo: false, password: hashed })
    expect((await request(app).post('/api/auth/login-with-role').send(payload)).status).toBe(401)

    findUserByEmailMock.mockResolvedValue({ ...loginUser, password: hashed })
    expect(
      (
        await request(app)
          .post('/api/auth/login-with-role')
          .send({ ...payload, password: 'otra-clave-1' })
      ).status,
    ).toBe(401)

    vi.spyOn(RoleService, 'obtenerRolesUsuario').mockResolvedValue(['estudiante'])
    findUserByEmailMock.mockResolvedValue({ ...loginUser, password: hashed })
    const rolAjeno = await request(app)
      .post('/api/auth/login-with-role')
      .send({ ...payload, selectedRole: 'admin' })
    expect(rolAjeno.status).toBe(401)

    const ok = await request(app).post('/api/auth/login-with-role').send(payload)
    expect(ok.status).toBe(200)
    expect(ok.body.user.selected_role).toBe('estudiante')
    expect(ok.body.token).toBeTruthy()
  })

  it('GET /auth/me y /auth/profile cubren token y tipos de usuario', async () => {
    const sin = await request(app).get('/api/auth/me')
    expect(sin.status).toBe(401)

    const malo = await request(app).get('/api/auth/me').set('Authorization', 'Bearer no-es-jwt')
    expect(malo.status).toBe(401)

    const expirado = jwt.sign({ email: loginUser.email }, process.env.JWT_SECRET as string, {
      expiresIn: '-10s',
    })
    const exp = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${expirado}`)
    expect(exp.status).toBe(401)

    const tokenMe = jwt.sign({ email: loginUser.email }, process.env.JWT_SECRET as string)
    findUserByEmailMock.mockResolvedValue(null)
    expect((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${tokenMe}`)).status).toBe(
      401,
    )

    for (const tipo of ['estudiante', 'profesor', 'docente', 'coordinador', 'admin'] as const) {
      findUserByEmailMock.mockResolvedValue({ ...loginUser, tipo_usuario: tipo })
      const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${tokenMe}`)
      expect(res.status).toBe(200)
      expect(res.body.tipo_usuario).toBe(tipo)
    }

    const tokenPerfil = mockAuthenticatedUser('admin', ['admin'])
    let llamadas = 0
    findUserByIdMock.mockImplementation(async () => {
      llamadas += 1
      if (llamadas === 1) return { ...adminRecord, tipo_usuario: 'admin' }
      return null
    })
    const noUser = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', `Bearer ${tokenPerfil}`)
    expect(noUser.status).toBe(404)

    const tokenOk = mockAuthenticatedUser('admin', ['admin'])
    const perfil = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', `Bearer ${tokenOk}`)
    expect(perfil.status).toBe(200)
    expect(perfil.body.email).toBe('admin@test.com')
  })

  it('GET /api/users lista, stats, estructura y grupos', async () => {
    const token = mockAuthenticatedUser('admin', ['admin'])
    listUsersSummaryMock.mockResolvedValue([{ id: 'u1' }])
    getDashboardStatsMock.mockResolvedValue({ total: 1 })
    getAcademicStructureMock.mockResolvedValue([{ id: 1 }])
    getGruposMock.mockResolvedValue([{ id: 9 }])

    const lista = await request(app).get('/api/users').set('Authorization', `Bearer ${token}`)
    expect(lista.status).toBe(200)
    expect(lista.body.users).toEqual([{ id: 'u1' }])

    const stats = await request(app).get('/api/users/stats').set('Authorization', `Bearer ${token}`)
    expect(stats.status).toBe(200)
    expect(stats.body.total).toBe(1)

    const estructura = await request(app)
      .get('/api/users/academic-structure')
      .set('Authorization', `Bearer ${token}`)
    expect(estructura.status).toBe(200)
    expect(estructura.body.facultades).toEqual([{ id: 1 }])

    const grupos = await request(app)
      .get('/api/users/grupos-by-career/4')
      .set('Authorization', `Bearer ${token}`)
    expect(grupos.status).toBe(200)
    expect(grupos.body).toEqual([{ id: 9 }])
    expect(getGruposMock).toHaveBeenCalledWith(4)

    const invalido = await request(app)
      .get('/api/users/grupos-by-career/no-num')
      .set('Authorization', `Bearer ${token}`)
    expect(invalido.status).toBe(400)

    listUsersSummaryMock.mockRejectedValue(new Error('db'))
    getDashboardStatsMock.mockRejectedValue(new Error('db'))
    getAcademicStructureMock.mockRejectedValue(new Error('db'))
    getGruposMock.mockRejectedValue(new Error('db'))
    expect((await request(app).get('/api/users').set('Authorization', `Bearer ${token}`)).status).toBe(500)
    expect((await request(app).get('/api/users/stats').set('Authorization', `Bearer ${token}`)).status).toBe(
      500,
    )
    expect(
      (await request(app).get('/api/users/academic-structure').set('Authorization', `Bearer ${token}`))
        .status,
    ).toBe(500)
    expect(
      (await request(app).get('/api/users/grupos-by-career/1').set('Authorization', `Bearer ${token}`))
        .status,
    ).toBe(500)
  })
})
