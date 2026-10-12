import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { hashPassword } from '../../utils/passwordSecurity'
import { supabaseModuleMock } from '../helpers/supabase-mock'
import { firmarToken } from '../helpers/sesion-http'
import { expectContrato, ErrorApi, RespuestaLogin, RespuestaLoginConRol, RespuestaLoginMultirol, RespuestaMe } from '../helpers/contrato'

const { repo } = vi.hoisted(() => ({
  repo: { findUserByEmail: vi.fn(), findUserById: vi.fn(), updateUser: vi.fn(), createUserWithType: vi.fn(), countUsers: vi.fn() },
}))
vi.mock('../../config/supabase-only', () => supabaseModuleMock)
vi.mock('../../config/supabaseClient', () => supabaseModuleMock)
vi.mock('../../modules/auth/auth.repository', () => ({ authRepository: repo }))

import { app } from '../../app'
import { RoleService } from '../../modules/auth/role.service'

const CLAVE = 'Clave-Segura2026!'
const EMAIL = 'ana@udemedellin.edu.co'
let hash = ''
const cuenta = (extra: Record<string, unknown> = {}) => ({
  id: 'u-1', email: EMAIL, nombre: 'ANA', apellido: 'PÉREZ', tipo_usuario: 'profesor', activo: true, password: hash, created_at: '2026-01-01T00:00:00Z', ...extra,
})
const roles = (lista: string[], dashboard = '/dashboard-profesor') => {
  vi.spyOn(RoleService, 'obtenerRolesUsuario').mockResolvedValue(lista)
  vi.spyOn(RoleService, 'obtenerDashboardUsuario').mockResolvedValue(dashboard)
}
const login = (body: unknown) => request(app).post('/api/auth/login').send(body as object)
const loginConRol = (body: unknown) => request(app).post('/api/auth/login-with-role').send(body as object)

describe('RQ2 — API de login y /me', () => {
  beforeEach(async () => {
    hash ||= await hashPassword(CLAVE)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(RoleService, 'obtenerPermisosUsuario').mockResolvedValue(['ver_evaluaciones'])
  })
  afterEach(() => {
    vi.restoreAllMocks()
    Object.values(repo).forEach((fn) => fn.mockReset())
  })

  describe('POST /login — positivos', () => {
    it.each([
      ['estudiante', 'estudiante', '/dashboard-estudiante'],
      ['profesor', 'profesor', '/dashboard-profesor'],
      ['coordinador', 'coordinador', '/dashboard-coordinador'],
    ])('RQ2·P1: %s → 200, contrato exacto y dashboard %s', async (tipo, rol, dashboard) => {
      repo.findUserByEmail.mockResolvedValue(cuenta({ tipo_usuario: tipo }))
      roles([rol], dashboard)

      const res = await login({ email: EMAIL, password: CLAVE })

      expect(res.status).toBe(200)
      expectContrato(res, RespuestaLogin)
      expect(res.body.user.dashboard).toBe(dashboard)
      expect(res.body.user.roles).toEqual([rol])
    })

    it('RQ2·P2: el token devuelto es un JWT HS256 que identifica al usuario y vence en ≤ 24 h', async () => {
      repo.findUserByEmail.mockResolvedValue(cuenta())
      roles(['profesor'])

      const res = await login({ email: EMAIL, password: CLAVE })
      const { header } = jwt.decode(res.body.token, { complete: true }) as { header: { alg: string } }
      const payload = jwt.verify(res.body.token, process.env.JWT_SECRET as string) as Record<string, number | string>

      expect(header.alg).toBe('HS256')
      expect(payload.userId).toBe('u-1')
      expect(Number(payload.exp) - Number(payload.iat)).toBeLessThanOrEqual(24 * 3600)
      expect(JSON.stringify(payload)).not.toMatch(/password|\$2[aby]\$/)
    })

    it('RQ2·P3: "docente" se presenta como "profesor" (compatibilidad con el front)', async () => {
      repo.findUserByEmail.mockResolvedValue(cuenta({ tipo_usuario: 'docente' }))
      roles(['docente'])

      const res = await login({ email: EMAIL, password: CLAVE })

      expect(res.body.user.user_type).toBe('profesor')
    })

    it('RQ2·P4: una cuenta con varios roles NO recibe token hasta elegir uno', async () => {
      repo.findUserByEmail.mockResolvedValue(cuenta())
      roles(['profesor', 'coordinador'])

      const res = await login({ email: EMAIL, password: CLAVE })

      expect(res.status).toBe(200)
      expectContrato(res, RespuestaLoginMultirol)
      expect(res.body.token).toBeUndefined()
    })
  })

  describe('POST /login — negativos', () => {
    it('RQ2·N1: correo inexistente, clave incorrecta y cuenta inactiva → 401 con el MISMO cuerpo', async () => {
      repo.findUserByEmail.mockResolvedValueOnce(null)
      const a = await login({ email: 'nadie@udemedellin.edu.co', password: CLAVE })
      repo.findUserByEmail.mockResolvedValueOnce(cuenta())
      const b = await login({ email: EMAIL, password: 'Otra-Clave2026!' })
      repo.findUserByEmail.mockResolvedValueOnce(cuenta({ activo: false }))
      const c = await login({ email: EMAIL, password: CLAVE })

      for (const res of [a, b, c]) {
        expect(res.status).toBe(401)
        expectContrato(res, ErrorApi)
        expect(res.body).toEqual({ error: 'Credenciales inválidas' })
      }
    })

    it.each([
      ['body vacío', {}],
      ['sin contraseña', { email: EMAIL }],
      ['contraseña vacía', { email: EMAIL, password: '' }],
      ['correo mal formado', { email: 'no-es-correo', password: CLAVE }],
      ['correo como objeto', { email: { $ne: null }, password: CLAVE }],
      ['contraseña como arreglo', { email: EMAIL, password: [CLAVE] }],
    ])('RQ2·N2: %s → 400 y no se consulta la base', async (_caso, body) => {
      const res = await login(body)

      expect(res.status).toBe(400)
      expectContrato(res, ErrorApi)
      expect(repo.findUserByEmail).not.toHaveBeenCalled()
    })

    it('RQ2·N3: un fallo de roles inválidos ("tipo de usuario no válido") → 401 sin token', async () => {
      repo.findUserByEmail.mockResolvedValue(cuenta({ tipo_usuario: 'intruso' }))
      roles(['intruso'])

      const res = await login({ email: EMAIL, password: CLAVE })

      expect(res.status).toBe(401)
      expect(res.body.token).toBeUndefined()
    })
  })

  describe('POST /login-with-role', () => {
    it('RQ2·P5: con un rol que la cuenta sí tiene → 200, contrato exacto y dashboard del rol', async () => {
      repo.findUserByEmail.mockResolvedValue(cuenta())
      roles(['profesor', 'coordinador'])

      const res = await loginConRol({ email: EMAIL, password: CLAVE, selectedRole: 'coordinador' })

      expect(res.status).toBe(200)
      expectContrato(res, RespuestaLoginConRol)
      expect(res.body.user.selected_role).toBe('coordinador')
      expect(jwt.decode(res.body.token)).toMatchObject({ selectedRole: 'coordinador' })
    })

    it.each([
      ['rol que no tiene', 'admin'],
      ['rol con mayúsculas', 'COORDINADOR'],
      ['rol vacío', ''],
      ['rol como arreglo', ['profesor', 'admin']],
    ])('RQ2·N4: %s → 401 igual que una clave mala', async (_caso, selectedRole) => {
      repo.findUserByEmail.mockResolvedValue(cuenta())
      roles(['profesor', 'coordinador'])

      const res = await loginConRol({ email: EMAIL, password: CLAVE, selectedRole })

      expect(res.status).toBe(401)
      expect(res.body).toEqual({ error: 'Credenciales inválidas' })
    })

    it('RQ2·N5: clave incorrecta con un rol válido → 401', async () => {
      repo.findUserByEmail.mockResolvedValue(cuenta())
      roles(['profesor'])

      const res = await loginConRol({ email: EMAIL, password: 'Mala-Clave2026!', selectedRole: 'profesor' })

      expect(res.status).toBe(401)
    })
  })

  describe('GET /me', () => {
    const conToken = (payload: Record<string, unknown> = { email: EMAIL }, opciones = {}) => `Bearer ${firmarToken(payload, opciones)}`

    it('RQ2·P6: con token válido → 200, contrato exacto y sin contraseña', async () => {
      repo.findUserByEmail.mockResolvedValue(cuenta())

      const res = await request(app).get('/api/auth/me').set('Authorization', conToken())

      expect(res.status).toBe(200)
      expectContrato(res, RespuestaMe)
      expect(JSON.stringify(res.body)).not.toMatch(/password|\$2[aby]\$/)
    })

    it.each([
      ['sin cabecera', undefined],
      ['esquema distinto de Bearer', 'Basic abc'],
      ['basura', 'Bearer abc.def.ghi'],
      ['firmado con otra clave', `Bearer ${firmarToken({ email: EMAIL }, { secreto: 'otra-clave' })}`],
      ['vencido', `Bearer ${firmarToken({ email: EMAIL }, { expiresIn: -10 })}`],
    ])('RQ2·N6: %s → 401 con ErrorApi', async (_caso, authorization) => {
      const peticion = request(app).get('/api/auth/me')
      if (authorization) peticion.set('Authorization', authorization)

      const res = await peticion

      expect(res.status).toBe(401)
      expectContrato(res, ErrorApi)
      expect(repo.findUserByEmail).not.toHaveBeenCalled()
    })

    it('RQ2·N7: cuenta desactivada después de emitir el token → 401', async () => {
      repo.findUserByEmail.mockResolvedValue(cuenta({ activo: false }))

      const res = await request(app).get('/api/auth/me').set('Authorization', conToken())

      expect(res.status).toBe(401)
    })
  })
})
