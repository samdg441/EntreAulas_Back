
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { supabaseModuleMock } from '../helpers/supabase-mock'
import { firmarToken, iniciarSesion, reiniciarSesion } from '../helpers/sesion-http'
import { adminUser, coordinadorUser, estudianteUser, profesorUser } from '../fixtures/users'

const { repo } = vi.hoisted(() => ({
  repo: { findUserByEmail: vi.fn(), findUserById: vi.fn(), updateUser: vi.fn(), createUserWithType: vi.fn(), countUsers: vi.fn() },
}))

vi.mock('../../config/supabase-only', () => supabaseModuleMock)
vi.mock('../../config/supabaseClient', () => supabaseModuleMock)
vi.mock('../../modules/auth/auth.repository', () => ({ authRepository: repo }))

import { app } from '../../app'

const CLAVE = 'Clave-Segura2026!'
const cuerpoValido = () => ({
  email: 'nuevo.docente@udemedellin.edu.co',
  password: CLAVE,
  nombre: 'Nuevo',
  apellido: 'Docente',
  tipo_usuario: 'profesor',
})
const crear = (auth: string | undefined, body: unknown) => {
  const peticion = request(app).post('/api/auth/create-user')
  if (auth) peticion.set('Authorization', auth)
  return peticion.send(body as object)
}

describe('RQ1 — Seguridad de create-user', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
    repo.findUserByEmail.mockResolvedValue(null)
    repo.createUserWithType.mockImplementation(async (d: Record<string, unknown>) => ({ id: 'nuevo-1', activo: true, ...d }))
  })
  afterEach(() => {
    vi.restoreAllMocks()
    reiniciarSesion()
    repo.findUserByEmail.mockReset()
    repo.createUserWithType.mockReset()
  })

  it('sin token → 401 y no se crea nada', async () => {
    const res = await crear(undefined, cuerpoValido())

    expect(res.status).toBe(401)
    expect(repo.createUserWithType).not.toHaveBeenCalled()
  })

  it.each([
    ['estudiante', estudianteUser],
    ['profesor', profesorUser],
    ['coordinador', coordinadorUser],
  ])('un %s autenticado → 403 y no se crea nada', async (_rol, usuario) => {
    const res = await crear(iniciarSesion(usuario), cuerpoValido())

    expect(res.status).toBe(403)
    expect(repo.createUserWithType).not.toHaveBeenCalled()
  })

  it('declarar "admin" dentro del JWT no escala privilegios: el rol se lee de la base', async () => {
    iniciarSesion(estudianteUser)
    const auth = `Bearer ${firmarToken({ userId: estudianteUser.id, roles: ['admin'], tipo_usuario: 'admin' })}`

    const res = await crear(auth, cuerpoValido())

    expect(res.status).toBe(403)
    expect(repo.createUserWithType).not.toHaveBeenCalled()
  })

  it('token de un admin desactivado → 401', async () => {
    const res = await crear(iniciarSesion(adminUser, { activo: false }), cuerpoValido())

    expect(res.status).toBe(401)
    expect(repo.createUserWithType).not.toHaveBeenCalled()
  })

  it('el admin crea el usuario y la respuesta no incluye contraseña ni hash', async () => {
    const res = await crear(iniciarSesion(adminUser), cuerpoValido())

    expect(res.status).toBe(201)
    expect(JSON.stringify(res.body)).not.toMatch(/password|hash|\$2[aby]\$/i)
    expect(repo.createUserWithType.mock.calls[0][0].password).not.toBe(CLAVE)
    expect(repo.createUserWithType.mock.calls[0][0].password).toMatch(/^\$2[aby]\$/)
  })

  it('mass-assignment: "activo", "id" y "roles" del body se ignoran', async () => {
    const res = await crear(iniciarSesion(adminUser), { ...cuerpoValido(), id: 'robado', activo: false, roles: ['admin'], is_admin: true })

    expect(res.status).toBe(201)
    const enviado = repo.createUserWithType.mock.calls[0][0]
    expect(enviado).not.toHaveProperty('id')
    expect(enviado).not.toHaveProperty('activo')
    expect(enviado).not.toHaveProperty('roles')
    expect(enviado).not.toHaveProperty('is_admin')
  })

  it.each([
    ['CRLF en el correo', 'x@udemedellin.edu.co\r\nBcc: a@evil.co'],
    ['comillas SQL', "' OR '1'='1@udemedellin.edu.co"],
    ['etiqueta script', '<script>alert(1)</script>@udemedellin.edu.co'],
    ['dominio externo', 'intruso@evil.co'],
    ['correo como objeto', { $ne: null }],
    ['correo como arreglo', ['a@udemedellin.edu.co']],
  ])('correo malicioso (%s) → 400 y no se crea nada', async (_caso, email) => {
    const res = await crear(iniciarSesion(adminUser), { ...cuerpoValido(), email })

    expect(res.status).toBe(400)
    expect(repo.createUserWithType).not.toHaveBeenCalled()
  })

  it.each([
    ['corta', 'Ab1!'],
    ['numérica', 12345678901234],
    ['arreglo', [CLAVE]],
  ])('contraseña %s → 400', async (_caso, password) => {
    const res = await crear(iniciarSesion(adminUser), { ...cuerpoValido(), password })

    expect(res.status).toBe(400)
    expect(repo.createUserWithType).not.toHaveBeenCalled()
  })

  it('un correo ya registrado → 400 sin revelar datos del usuario existente', async () => {
    repo.findUserByEmail.mockResolvedValue({ id: 'otro', email: cuerpoValido().email, password: '$2b$12$hash', nombre: 'Secreto' })

    const res = await crear(iniciarSesion(adminUser), cuerpoValido())

    expect(res.status).toBe(400)
    expect(JSON.stringify(res.body)).not.toMatch(/hash|Secreto|otro/)
  })

  it('nombre con HTML se guarda tal cual y la API responde JSON (no HTML ejecutable)', async () => {
    const res = await crear(iniciarSesion(adminUser), { ...cuerpoValido(), nombre: '<img src=x onerror=alert(1)>' })

    expect(res.headers['content-type']).toMatch(/application\/json/)
  })
})
