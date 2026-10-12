import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { supabaseModuleMock } from '../helpers/supabase-mock'
import { firmarToken, iniciarSesion, reiniciarSesion } from '../helpers/sesion-http'
import { expectContrato, ErrorApi, RespuestaCrearUsuario } from '../helpers/contrato'
import { adminUser, coordinadorUser, estudianteUser, profesorUser } from '../fixtures/users'

const { repo } = vi.hoisted(() => ({
  repo: { findUserByEmail: vi.fn(), findUserById: vi.fn(), updateUser: vi.fn(), createUserWithType: vi.fn(), countUsers: vi.fn() },
}))
vi.mock('../../config/supabase-only', () => supabaseModuleMock)
vi.mock('../../config/supabaseClient', () => supabaseModuleMock)
vi.mock('../../modules/auth/auth.repository', () => ({ authRepository: repo }))

import { app } from '../../app'

const CLAVE = 'Clave-Segura2026!'
const cuerpo = (extra: Record<string, unknown> = {}) => ({
  email: 'nuevo.docente@udemedellin.edu.co',
  password: CLAVE,
  nombre: 'Nuevo',
  apellido: 'Docente',
  tipo_usuario: 'profesor',
  ...extra,
})
const crear = (body: unknown, auth?: string) => {
  const peticion = request(app).post('/api/auth/create-user')
  if (auth) peticion.set('Authorization', auth)
  return peticion.send(body as object)
}

describe('RQ1 — API create-user', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
    repo.findUserByEmail.mockResolvedValue(null)
    repo.createUserWithType.mockImplementation(async (d: Record<string, unknown>) => ({ id: 'nuevo-1', activo: true, ...d }))
  })
  afterEach(() => {
    vi.restoreAllMocks()
    Object.values(repo).forEach((fn) => fn.mockReset())
    reiniciarSesion()
  })

  describe('casos positivos', () => {
    it('RQ1·P1: el admin crea un profesor → 201 con el contrato exacto y sin contraseña', async () => {
      const res = await crear(cuerpo(), iniciarSesion(adminUser))

      expect(res.status).toBe(201)
      expect(res.headers['content-type']).toMatch(/application\/json/)
      expectContrato(res, RespuestaCrearUsuario)
      expect(res.body.user).toMatchObject({ email: 'nuevo.docente@udemedellin.edu.co', tipo_usuario: 'profesor', activo: true })
    })

    it('RQ1·P2: el admin crea un estudiante con correo @soyudemedellin.edu.co', async () => {
      const res = await crear(cuerpo({ email: 'ana.perez@soyudemedellin.edu.co', tipo_usuario: 'estudiante' }), iniciarSesion(adminUser))

      expect(res.status).toBe(201)
      expectContrato(res, RespuestaCrearUsuario)
      expect(res.body.user.email).toBe('ana.perez@soyudemedellin.edu.co')
    })

    it('RQ1·P3: el correo se normaliza (minúsculas y sin espacios) antes de guardarse', async () => {
      await crear(cuerpo({ email: '  Nuevo.Docente@UDEMedellin.edu.co ' }), iniciarSesion(adminUser))

      expect(repo.createUserWithType.mock.calls[0][0].email).toBe('nuevo.docente@udemedellin.edu.co')
    })

    it('RQ1·P4: se guarda un hash bcrypt y nunca la contraseña en claro', async () => {
      await crear(cuerpo(), iniciarSesion(adminUser))

      const guardado = repo.createUserWithType.mock.calls[0][0]
      expect(guardado.password).toMatch(/^\$2[aby]\$12\$/)
      expect(guardado.password).not.toContain(CLAVE)
      expect(repo.createUserWithType).toHaveBeenCalledTimes(1)
    })

    it('RQ1·P5: los campos opcionales de profesor llegan al repositorio', async () => {
      await crear(cuerpo({ codigo_profesor: 'P-100', departamento: 'Ingeniería' }), iniciarSesion(adminUser))

      expect(repo.createUserWithType.mock.calls[0][0]).toMatchObject({ codigo_profesor: 'P-100', departamento: 'Ingeniería' })
    })
  })

  describe('casos negativos', () => {
    it('RQ1·N1: sin token → 401 NO_TOKEN', async () => {
      const res = await crear(cuerpo())

      expect(res.status).toBe(401)
      expectContrato(res, ErrorApi)
      expect(res.body.code).toBe('NO_TOKEN')
    })

    it.each([
      ['basura', 'Bearer abc.def.ghi'],
      ['firmado con otra clave', `Bearer ${firmarToken({ userId: 'user-admin' }, { secreto: 'otra-clave' })}`],
      ['vencido', `Bearer ${firmarToken({ userId: 'user-admin' }, { expiresIn: -10 })}`],
    ])('RQ1·N2: token %s → 401', async (_caso, auth) => {
      const res = await crear(cuerpo(), auth)

      expect(res.status).toBe(401)
      expectContrato(res, ErrorApi)
    })

    it.each([
      ['estudiante', estudianteUser],
      ['profesor', profesorUser],
      ['coordinador', coordinadorUser],
    ])('RQ1·N3: un %s autenticado → 403 FORBIDDEN_ROLE', async (_rol, usuario) => {
      const res = await crear(cuerpo(), iniciarSesion(usuario))

      expect(res.status).toBe(403)
      expectContrato(res, ErrorApi)
      expect(res.body.code).toBe('FORBIDDEN_ROLE')
    })

    it.each(['email', 'password', 'nombre', 'apellido', 'tipo_usuario'])('RQ1·N4: falta "%s" → 400', async (campo) => {
      const body = cuerpo()
      delete (body as Record<string, unknown>)[campo]

      const res = await crear(body, iniciarSesion(adminUser))

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: 'Todos los campos son requeridos' })
    })

    it.each([
      ['7 caracteres', 'Ab1!xyz'],
      ['número', 12345678],
    ])('RQ1·N5: contraseña %s → 400', async (_caso, password) => {
      const res = await crear(cuerpo({ password }), iniciarSesion(adminUser))

      expect(res.status).toBe(400)
      expectContrato(res, ErrorApi)
    })

    it.each([
      ['estudiante con dominio de docente', { email: 'ana@udemedellin.edu.co', tipo_usuario: 'estudiante' }],
      ['docente con dominio de estudiante', { email: 'ana@soyudemedellin.edu.co', tipo_usuario: 'profesor' }],
      ['dominio ajeno', { email: 'ana@gmail.com' }],
      ['con saltos de línea', { email: 'ana@udemedellin.edu.co\r\nBcc: x@evil.co' }],
    ])('RQ1·N6: correo institucional inválido (%s) → 400', async (_caso, extra) => {
      const res = await crear(cuerpo(extra), iniciarSesion(adminUser))

      expect(res.status).toBe(400)
      expectContrato(res, ErrorApi)
    })

    it('RQ1·N7: correo ya registrado → 400 sin revelar datos de la cuenta existente', async () => {
      repo.findUserByEmail.mockResolvedValue({ id: 'otro', email: cuerpo().email, nombre: 'SECRETO', password: '$2b$12$hashexistente' })

      const res = await crear(cuerpo(), iniciarSesion(adminUser))

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: 'El email ya está registrado' })
    })

    it('RQ1·N8: todos los casos negativos dejan la base intacta', async () => {
      const auth = iniciarSesion(adminUser)
      await crear({}, auth)
      await crear(cuerpo({ password: 'corta' }), auth)
      await crear(cuerpo({ email: 'x@evil.co' }), auth)
      await crear(cuerpo())

      expect(repo.createUserWithType).not.toHaveBeenCalled()
    })
  })
})
