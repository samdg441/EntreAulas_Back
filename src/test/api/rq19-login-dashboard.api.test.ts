/**
 * RQ19 — El login decide el dashboard según los roles, y el perfil respeta la sesión.
 * Contrato HTTP de POST /api/auth/login, /login-with-role y GET /api/auth/profile.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { hashPassword } from '../../utils/passwordSecurity'
import { supabaseModuleMock } from '../helpers/supabase-mock'
import { iniciarSesion, reiniciarSesion } from '../helpers/sesion-http'
import { coordinadorUser } from '../fixtures/users'

const { repo } = vi.hoisted(() => ({
  repo: { findUserByEmail: vi.fn(), findUserById: vi.fn(), updateUser: vi.fn(), createUserWithType: vi.fn(), countUsers: vi.fn() },
}))

vi.mock('../../config/supabase-only', () => supabaseModuleMock)
vi.mock('../../config/supabaseClient', () => supabaseModuleMock)
vi.mock('../../modules/auth/auth.repository', () => ({ authRepository: repo }))

import { app } from '../../app'
import { RoleService } from '../../modules/auth/role.service'

const CLAVE = 'Clave-Segura2026!'
let hash = ''

function usuarioEnBase(extra: Record<string, unknown> = {}) {
  return {
    id: 'u-1',
    email: 'ana@udemedellin.edu.co',
    nombre: 'ANA',
    apellido: 'PÉREZ',
    tipo_usuario: 'coordinador',
    activo: true,
    password: hash,
    ...extra,
  }
}

describe('RQ19 — API de login y dashboard por rol', () => {
  beforeEach(async () => {
    hash ||= await hashPassword(CLAVE)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(RoleService, 'obtenerPermisosUsuario').mockResolvedValue([])
  })
  afterEach(() => {
    vi.restoreAllMocks()
    Object.values(repo).forEach((fn) => fn.mockReset())
    reiniciarSesion()
  })

  it('un coordinador recibe token y el dashboard de coordinador', async () => {
    repo.findUserByEmail.mockResolvedValue(usuarioEnBase())
    vi.spyOn(RoleService, 'obtenerRolesUsuario').mockResolvedValue(['coordinador'])
    vi.spyOn(RoleService, 'obtenerDashboardUsuario').mockResolvedValue('/dashboard-coordinador')

    const res = await request(app).post('/api/auth/login').send({ email: 'ana@udemedellin.edu.co', password: CLAVE })

    expect(res.status).toBe(200)
    expect(res.body.user).toMatchObject({ id: 'u-1', dashboard: '/dashboard-coordinador', roles: ['coordinador'] })
    expect(res.body.user).not.toHaveProperty('password')
    expect(jwt.verify(res.body.token, process.env.JWT_SECRET as string)).toMatchObject({ userId: 'u-1' })
  })

  it('Regresión RQ19: con varios roles no entrega token hasta elegir uno', async () => {
    repo.findUserByEmail.mockResolvedValue(usuarioEnBase({ tipo_usuario: 'estudiante' }))
    vi.spyOn(RoleService, 'obtenerRolesUsuario').mockResolvedValue(['estudiante', 'admin'])

    const res = await request(app).post('/api/auth/login').send({ email: 'ana@udemedellin.edu.co', password: CLAVE })

    expect(res.status).toBe(200)
    expect(res.body.requires_role_selection).toBe(true)
    expect(res.body.available_roles).toEqual(['estudiante', 'admin'])
    expect(res.body).not.toHaveProperty('token')
  })

  it('login-with-role con un rol que sí tiene → dashboard de ese rol', async () => {
    repo.findUserByEmail.mockResolvedValue(usuarioEnBase({ tipo_usuario: 'estudiante' }))
    vi.spyOn(RoleService, 'obtenerRolesUsuario').mockResolvedValue(['estudiante', 'admin'])

    const res = await request(app)
      .post('/api/auth/login-with-role')
      .send({ email: 'ana@udemedellin.edu.co', password: CLAVE, selectedRole: 'estudiante' })

    expect(res.status).toBe(200)
    expect(res.body.user).toMatchObject({ selected_role: 'estudiante', dashboard: '/dashboard-estudiante' })
  })

  it('Regresión RQ19: login-with-role con un rol que NO tiene → 401 y sin token', async () => {
    repo.findUserByEmail.mockResolvedValue(usuarioEnBase({ tipo_usuario: 'estudiante' }))
    vi.spyOn(RoleService, 'obtenerRolesUsuario').mockResolvedValue(['estudiante'])

    const res = await request(app)
      .post('/api/auth/login-with-role')
      .send({ email: 'ana@udemedellin.edu.co', password: CLAVE, selectedRole: 'admin' })

    expect(res.status).toBe(401)
    expect(res.body).not.toHaveProperty('token')
  })

  it('un body sin correo → 400 con el detalle de validación', async () => {
    const res = await request(app).post('/api/auth/login').send({ password: CLAVE })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Datos inválidos')
    expect(repo.findUserByEmail).not.toHaveBeenCalled()
  })

  it('GET /profile devuelve los roles de la sesión y nunca el hash', async () => {
    const auth = iniciarSesion(coordinadorUser)
    repo.findUserById.mockResolvedValue({ ...coordinadorUser, nombre: 'C', apellido: 'C', activo: true, password: hash })

    const res = await request(app).get('/api/auth/profile').set('Authorization', auth)

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ id: coordinadorUser.id, roles: ['coordinador'] })
    expect(res.body).not.toHaveProperty('password')
  })
})
