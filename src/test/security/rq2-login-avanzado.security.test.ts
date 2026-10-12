
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { supabaseModuleMock } from '../helpers/supabase-mock'
import { firmarToken } from '../helpers/sesion-http'
import { hashPassword } from '../../utils/passwordSecurity'
import { RoleService } from '../../modules/auth/role.service'

const { repo } = vi.hoisted(() => ({
  repo: { findUserByEmail: vi.fn(), findUserById: vi.fn(), updateUser: vi.fn(), createUserWithType: vi.fn(), countUsers: vi.fn() },
}))

vi.mock('../../config/supabase-only', () => supabaseModuleMock)
vi.mock('../../config/supabaseClient', () => supabaseModuleMock)
vi.mock('../../modules/auth/auth.repository', () => ({ authRepository: repo }))

import { app } from '../../app'

const CLAVE = 'Clave-Segura2026!'
const EMAIL = 'ana@soyudemedellin.edu.co'
let hash = ''
const base64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
const cuenta = () => ({ id: 'u-1', email: EMAIL, nombre: 'Ana', apellido: 'Gómez', tipo_usuario: 'estudiante', activo: true, password: hash, created_at: '2026-01-01' })

describe('RQ2 — Seguridad avanzada del login', () => {
  beforeEach(async () => {
    hash ||= await hashPassword(CLAVE)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(RoleService, 'obtenerRolesUsuario').mockResolvedValue(['estudiante'])
    vi.spyOn(RoleService, 'obtenerPermisosUsuario').mockResolvedValue([])
    vi.spyOn(RoleService, 'obtenerDashboardUsuario').mockResolvedValue('/dashboard-estudiante')
  })
  afterEach(() => {
    vi.restoreAllMocks()
    repo.findUserByEmail.mockReset()
  })

  it('la respuesta del login no contiene la contraseña ni su hash', async () => {
    repo.findUserByEmail.mockResolvedValue(cuenta())

    const res = await request(app).post('/api/auth/login').send({ email: EMAIL, password: CLAVE })

    expect(res.status).toBe(200)
    expect(JSON.stringify(res.body)).not.toMatch(/"password"|\$2[aby]\$/)
  })

  it('el JWT emitido vence (exp) en ≤ 24 h y no lleva la contraseña', async () => {
    repo.findUserByEmail.mockResolvedValue(cuenta())

    const res = await request(app).post('/api/auth/login').send({ email: EMAIL, password: CLAVE })
    const payload = jwt.decode(res.body.token) as Record<string, number | string>

    expect(payload.exp).toBeTruthy()
    expect(Number(payload.exp) - Number(payload.iat)).toBeLessThanOrEqual(24 * 3600)
    expect(JSON.stringify(payload)).not.toMatch(/password|\$2[aby]\$/)
  })

  it('el JWT emitido usa HS256 (nunca "none")', async () => {
    repo.findUserByEmail.mockResolvedValue(cuenta())

    const res = await request(app).post('/api/auth/login').send({ email: EMAIL, password: CLAVE })
    const { alg } = JSON.parse(Buffer.from(res.body.token.split('.')[0], 'base64url').toString())

    expect(alg).toBe('HS256')
  })

  it('login-with-role: pedir un rol que la cuenta no tiene → 401 igual que una clave mala', async () => {
    repo.findUserByEmail.mockResolvedValue(cuenta())

    const res = await request(app).post('/api/auth/login-with-role').send({ email: EMAIL, password: CLAVE, selectedRole: 'admin' })

    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: 'Credenciales inválidas' })
  })

  it('login-with-role: un rol repetido en un arreglo o con otro tipo no se acepta', async () => {
    repo.findUserByEmail.mockResolvedValue(cuenta())

    for (const selectedRole of [['estudiante', 'admin'], { $ne: null }, 'ADMIN', ' admin']) {
      const res = await request(app).post('/api/auth/login-with-role').send({ email: EMAIL, password: CLAVE, selectedRole })
      expect(res.status, JSON.stringify(selectedRole)).toBeLessThan(500)
      expect(res.body.token, JSON.stringify(selectedRole)).toBeUndefined()
    }
  })

  it.each([
    ['sin cabecera', undefined],
    ['esquema distinto de Bearer', 'Basic abc'],
    ['basura', 'Bearer abc.def.ghi'],
    ['alg none sin firma', `Bearer ${base64url({ alg: 'none', typ: 'JWT' })}.${base64url({ email: EMAIL })}.`],
    ['firmado con otra clave', `Bearer ${firmarToken({ email: EMAIL }, { secreto: 'clave-del-atacante' })}`],
    ['vencido', `Bearer ${firmarToken({ email: EMAIL }, { expiresIn: -10 })}`],
  ])('GET /me con token %s → 401 sin 500 ni stack', async (_caso, authorization) => {
    const peticion = request(app).get('/api/auth/me')
    if (authorization) peticion.set('Authorization', authorization)

    const res = await peticion

    expect(res.status).toBe(401)
    expect(JSON.stringify(res.body)).not.toMatch(/jsonwebtoken|at .*\.ts|node_modules/)
    expect(repo.findUserByEmail).not.toHaveBeenCalled()
  })

  it('GET /me con un token válido no devuelve la contraseña', async () => {
    repo.findUserByEmail.mockResolvedValue(cuenta())

    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${firmarToken({ email: EMAIL })}`)

    expect(res.status).toBe(200)
    expect(JSON.stringify(res.body)).not.toMatch(/"password"|\$2[aby]\$/)
  })

  it('GET /me de una cuenta desactivada después de emitir el token → 401', async () => {
    repo.findUserByEmail.mockResolvedValue({ ...cuenta(), activo: false })

    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${firmarToken({ email: EMAIL })}`)

    expect(res.status).toBe(401)
  })

  it('un correo con mayúsculas y espacios no abre otra cuenta ni rompe el servidor', async () => {
    repo.findUserByEmail.mockResolvedValue(null)

    const res = await request(app).post('/api/auth/login').send({ email: '  ANA@SOYUDEMEDELLIN.EDU.CO ', password: CLAVE })

    expect(res.status).toBeLessThan(500)
    expect(res.body.token).toBeUndefined()
  })
})
