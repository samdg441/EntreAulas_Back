import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { supabaseModuleMock } from '../helpers/supabase-mock'

vi.mock('../../config/supabase-only', () => supabaseModuleMock)
vi.mock('../../config/supabaseClient', () => supabaseModuleMock)

const { findUserByEmailMock, updateUserMock, verifyStoredPasswordMock } = vi.hoisted(() => ({
  findUserByEmailMock: vi.fn(),
  updateUserMock: vi.fn(),
  verifyStoredPasswordMock: vi.fn(),
}))

vi.mock('../../modules/auth/auth.repository', () => ({
  authRepository: {
    findUserByEmail: findUserByEmailMock,
    updateUser: updateUserMock,
    createUserWithType: vi.fn(),
    findUserById: vi.fn(),
    countUsers: vi.fn(),
  },
}))

vi.mock('../../utils/passwordSecurity', async () => {
  const actual = await vi.importActual<typeof import('../../utils/passwordSecurity')>(
    '../../utils/passwordSecurity'
  )
  return { ...actual, verifyStoredPassword: verifyStoredPasswordMock }
})

import { app } from '../../app'
import { RoleService } from '../../modules/auth/role.service'

const credenciales = { email: 'user@test.com', password: 'password123' }

const activeUser = {
  id: 'u1',
  email: credenciales.email,
  password: 'hash-almacenado',
  nombre: 'Ana',
  apellido: 'Perez',
  tipo_usuario: 'estudiante',
  activo: true,
}

describe('RQ2 unit — Login', () => {
  beforeEach(() => {
    findUserByEmailMock.mockReset()
    updateUserMock.mockReset()
    verifyStoredPasswordMock.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('C1: usuario no existe → 401', async () => {
    findUserByEmailMock.mockResolvedValue(null)

    const res = await request(app).post('/api/auth/login').send(credenciales)

    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: 'Credenciales inválidas' })
    expect(verifyStoredPasswordMock).not.toHaveBeenCalled()
  })

  it('C2: usuario inactivo → 401', async () => {
    findUserByEmailMock.mockResolvedValue({ ...activeUser, activo: false })

    const res = await request(app).post('/api/auth/login').send(credenciales)

    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: 'Credenciales inválidas' })
    expect(verifyStoredPasswordMock).not.toHaveBeenCalled()
  })

  it('C3: contraseña incorrecta (passwordCheck.ok = false) → 401', async () => {
    findUserByEmailMock.mockResolvedValue(activeUser)
    verifyStoredPasswordMock.mockResolvedValue({ ok: false })

    const res = await request(app).post('/api/auth/login').send(credenciales)

    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: 'Credenciales inválidas' })
  })

  it('C4: tipo de usuario no válido → 401', async () => {
    findUserByEmailMock.mockResolvedValue({ ...activeUser, tipo_usuario: 'invitado' })
    verifyStoredPasswordMock.mockResolvedValue({ ok: true })
    vi.spyOn(RoleService, 'obtenerRolesUsuario').mockResolvedValue([])

    const res = await request(app).post('/api/auth/login').send(credenciales)

    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: 'Tipo de usuario no válido' })
  })

  it('C5: login exitoso con un solo rol → 200 con token', async () => {
    findUserByEmailMock.mockResolvedValue(activeUser)
    verifyStoredPasswordMock.mockResolvedValue({ ok: true })
    vi.spyOn(RoleService, 'obtenerRolesUsuario').mockResolvedValue(['estudiante'])

    const res = await request(app).post('/api/auth/login').send(credenciales)

    expect(res.status).toBe(200)
    expect(res.body.message).toBe('Login exitoso')
    expect(res.body.user.requires_role_selection).toBeUndefined()
    expect(res.body.user.tipo_usuario).toBe('estudiante')
    expect(res.body.user.user_type).toBe('estudiante')
    expect(res.body.user.dashboard).toBe('/dashboard-estudiante')
    expect(res.body.user.role_description).toBe('Estudiante del sistema')

    const decoded = jwt.verify(res.body.token, process.env.JWT_SECRET as string) as jwt.JwtPayload
    expect(decoded.userId).toBe(activeUser.id)
    expect(decoded.email).toBe(activeUser.email)
  })

  it('C6: múltiples roles detectados → 200 sin token, requiere selección', async () => {
    findUserByEmailMock.mockResolvedValue(activeUser)
    verifyStoredPasswordMock.mockResolvedValue({ ok: true })
    vi.spyOn(RoleService, 'obtenerRolesUsuario').mockResolvedValue(['estudiante', 'profesor'])

    const res = await request(app).post('/api/auth/login').send(credenciales)

    expect(res.status).toBe(200)
    expect(res.body.message).toBe('Usuario con múltiples roles detectado')
    expect(res.body.requires_role_selection).toBe(true)
    expect(res.body.available_roles).toEqual(['estudiante', 'profesor'])
    expect(res.body.user.multiple_roles).toBe(true)
    expect(res.body.token).toBeUndefined()
  })

  it('C7: falla la migración de contraseña plaintext→hash pero el login continúa → 200', async () => {
    findUserByEmailMock.mockResolvedValue(activeUser)
    verifyStoredPasswordMock.mockResolvedValue({ ok: true, migratePlaintextToHash: 'password123' })
    updateUserMock.mockRejectedValue(new Error('update falló'))
    vi.spyOn(RoleService, 'obtenerRolesUsuario').mockResolvedValue(['estudiante'])

    const res = await request(app).post('/api/auth/login').send(credenciales)

    expect(updateUserMock).toHaveBeenCalledWith(activeUser.id, { password: expect.any(String) })
    expect(console.error).toHaveBeenCalledWith('Error migrando contraseña a bcrypt:', expect.any(Error))
    expect(res.status).toBe(200)
    expect(res.body.message).toBe('Login exitoso')
  })

  it('C8: body inválido (loginSchema.parse falla) → 400', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'no-es-un-email' })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Datos inválidos')
    expect(Array.isArray(res.body.details)).toBe(true)
    expect(findUserByEmailMock).not.toHaveBeenCalled()
  })

  it('C9: error interno del servidor → 500', async () => {
    findUserByEmailMock.mockRejectedValue(new Error('DB caída'))

    const res = await request(app).post('/api/auth/login').send(credenciales)

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Error interno del servidor' })
  })

  it("C10: tipo_usuario 'docente' se normaliza a 'profesor' en la respuesta → 200", async () => {
    findUserByEmailMock.mockResolvedValue({ ...activeUser, tipo_usuario: 'docente' })
    verifyStoredPasswordMock.mockResolvedValue({ ok: true })
    vi.spyOn(RoleService, 'obtenerRolesUsuario').mockResolvedValue(['docente'])

    const res = await request(app).post('/api/auth/login').send(credenciales)

    expect(res.status).toBe(200)
    expect(res.body.user.tipo_usuario).toBe('docente')
    expect(res.body.user.user_type).toBe('profesor')
    expect(res.body.user.user_role).toBe('profesor')
    expect(res.body.user.role_description).toBe('Profesor/Docente del sistema')
  })
})


describe('RQ2 unit — Fallas intencionales (evidencia solicitada)', () => {
  beforeEach(() => {
    findUserByEmailMock.mockReset()
    updateUserMock.mockReset()
    verifyStoredPasswordMock.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('FALLA C1: usuario no existe — se espera (mal) 200 en vez de 401', async () => {
    findUserByEmailMock.mockResolvedValue(null)

    const res = await request(app).post('/api/auth/login').send(credenciales)

    expect(res.status).toBe(200) // esperado real: 401
  })

  it('FALLA C5: login exitoso — se espera (mal) un dashboard distinto al real', async () => {
    findUserByEmailMock.mockResolvedValue(activeUser)
    verifyStoredPasswordMock.mockResolvedValue({ ok: true })
    vi.spyOn(RoleService, 'obtenerRolesUsuario').mockResolvedValue(['estudiante'])

    const res = await request(app).post('/api/auth/login').send(credenciales)

    expect(res.body.user.dashboard).toBe('/dashboard-admin') // esperado real: '/dashboard-estudiante'
  })

  it('FALLA C9: error interno — se espera (mal) 200 en vez de 500', async () => {
    findUserByEmailMock.mockRejectedValue(new Error('DB caída'))

    const res = await request(app).post('/api/auth/login').send(credenciales)

    expect(res.status).toBe(200) // esperado real: 500
  })
})
