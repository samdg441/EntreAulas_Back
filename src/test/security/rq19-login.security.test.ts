/**
 * RQ19 — El login no debe ayudar a un atacante: misma respuesta para correo inexistente,
 * clave incorrecta o cuenta inactiva (sin enumeración de usuarios), y entradas raras → 4xx, nunca 500.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { supabaseModuleMock } from '../helpers/supabase-mock'
import { hashPassword } from '../../utils/passwordSecurity'

const { repo } = vi.hoisted(() => ({
  repo: { findUserByEmail: vi.fn(), findUserById: vi.fn(), updateUser: vi.fn(), createUserWithType: vi.fn(), countUsers: vi.fn() },
}))

vi.mock('../../config/supabase-only', () => supabaseModuleMock)
vi.mock('../../config/supabaseClient', () => supabaseModuleMock)
vi.mock('../../modules/auth/auth.repository', () => ({ authRepository: repo }))

import { app } from '../../app'

const CLAVE = 'Clave-Segura2026!'
let hash = ''

const login = (body: unknown) => request(app).post('/api/auth/login').send(body as object)

describe('RQ19 — Seguridad del login', () => {
  beforeEach(async () => {
    hash ||= await hashPassword(CLAVE)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
    repo.findUserByEmail.mockReset()
  })

  it('correo inexistente, clave incorrecta y cuenta inactiva responden exactamente igual', async () => {
    const cuenta = { id: 'u-1', email: 'ana@udemedellin.edu.co', tipo_usuario: 'estudiante', activo: true, password: hash }

    repo.findUserByEmail.mockResolvedValueOnce(null)
    const inexistente = await login({ email: 'nadie@udemedellin.edu.co', password: CLAVE })

    repo.findUserByEmail.mockResolvedValueOnce(cuenta)
    const claveMala = await login({ email: cuenta.email, password: 'Otra-Clave2026!' })

    repo.findUserByEmail.mockResolvedValueOnce({ ...cuenta, activo: false })
    const inactiva = await login({ email: cuenta.email, password: CLAVE })

    for (const res of [inexistente, claveMala, inactiva]) {
      expect(res.status).toBe(401)
      expect(res.body).toEqual({ error: 'Credenciales inválidas' })
    }
  })

  it.each([
    ['correo como objeto (inyección NoSQL)', { email: { $ne: null }, password: CLAVE }],
    ['correo con comillas SQL', { email: "' OR '1'='1", password: CLAVE }],
    ['clave como arreglo', { email: 'ana@udemedellin.edu.co', password: [CLAVE] }],
    ['body vacío', {}],
  ])('%s → 400 sin consultar la base', async (_caso, body) => {
    const res = await login(body)

    expect(res.status).toBe(400)
    expect(repo.findUserByEmail).not.toHaveBeenCalled()
  })

  it('una clave de 10.000 caracteres no tumba el servidor', async () => {
    repo.findUserByEmail.mockResolvedValue({ id: 'u-1', email: 'ana@udemedellin.edu.co', tipo_usuario: 'estudiante', activo: true, password: hash })

    const res = await login({ email: 'ana@udemedellin.edu.co', password: 'A'.repeat(10_000) })

    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(res.status).toBeLessThan(500)
  })

  it('un JSON mal formado → 400', async () => {
    const res = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{"email": "a@b.co",')

    expect(res.status).toBe(400)
  })
})
