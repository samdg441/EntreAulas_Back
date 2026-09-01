
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import express from 'express'
import request from 'supertest'

vi.mock('../../config/supabase-only', () => import('../helpers/dobles-supabase'))
vi.mock('../../config/supabaseClient', () => import('../helpers/dobles-supabase'))

import passwordResetRoutes from '../../modules/auth/password-reset.routes'
import { fakeDb } from '../helpers/fake-supabase'

const app = express()
app.use(express.json())
app.use('/api/auth', passwordResetRoutes)

const forgot = (body: unknown) =>
  request(app).post('/api/auth/forgot-password').send(body as object)

const MENSAJE_GENERICO =
  'Si el correo electrónico existe en nuestro sistema, recibirás un enlace de recuperación'

const USUARIO_ACTIVO = {
  id: 'u-1',
  email: 'activo@entreaulas.test',
  nombre: 'Ana',
  apellido: 'Pérez',
  activo: true,
}

const ENV_KEYS = ['PASSWORD_RESET_DEBUG_RESPONSE', 'NODE_ENV', 'FRONTEND_URL'] as const
let envPrevio: Record<string, string | undefined> = {}

beforeEach(() => {
  fakeDb.reset()
  envPrevio = {}
  for (const k of ENV_KEYS) envPrevio[k] = process.env[k]
})

afterEach(() => {
  vi.restoreAllMocks()
  for (const k of ENV_KEYS) {
    if (envPrevio[k] === undefined) delete process.env[k]
    else process.env[k] = envPrevio[k] as string
  }
})

describe('RQ3 — forgot-password (cobertura estructural, Fake Supabase)', () => {
  it('N3→N4: sin email → 400 "requerido"', async () => {
    const res = await forgot({})
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'El correo electrónico es requerido' })
  })

  it('N5→N6: formato de email inválido → 400 "Formato…inválido"', async () => {
    const res = await forgot({ email: 'no-es-un-email' })
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Formato de correo electrónico inválido' })
  })

  it('N8→N9: usuario no existe → 200 genérico (rama !user)', async () => {
    const res = await forgot({ email: 'desconocido@entreaulas.test' })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ message: MENSAJE_GENERICO })
    expect(res.body).not.toHaveProperty('resetToken')
  })

  it('N8→N9: error de BD al buscar usuario → 200 genérico (rama userError)', async () => {
    fakeDb.fail('usuarios', { message: 'fallo de conexión' })
    const res = await forgot({ email: USUARIO_ACTIVO.email })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ message: MENSAJE_GENERICO })
  })

  it('N10→N16: usuario activo, sin debug → 200 genérico y token guardado en BD', async () => {
    fakeDb.seed('usuarios', [USUARIO_ACTIVO])
    delete process.env.PASSWORD_RESET_DEBUG_RESPONSE
    process.env.NODE_ENV = 'test'

    const res = await forgot({ email: USUARIO_ACTIVO.email })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ message: MENSAJE_GENERICO })
    const tokens = fakeDb.filas('password_reset_tokens')
    expect(tokens).toHaveLength(1)
    expect(tokens[0]).toMatchObject({ email: USUARIO_ACTIVO.email, used: false })
    expect(String(tokens[0].token)).toMatch(/^[0-9a-f]{64}$/)
  })

  it('N16 (debug): flag=true + NODE_ENV=test + FRONTEND_URL → resetToken y resetLink', async () => {
    fakeDb.seed('usuarios', [USUARIO_ACTIVO])
    process.env.PASSWORD_RESET_DEBUG_RESPONSE = 'true'
    process.env.NODE_ENV = 'test'
    process.env.FRONTEND_URL = 'https://app.entreaulas.com'

    const res = await forgot({ email: USUARIO_ACTIVO.email })

    expect(res.status).toBe(200)
    expect(res.body.message).toBe(MENSAJE_GENERICO)
    expect(res.body.resetToken).toMatch(/^[0-9a-f]{64}$/)
    expect(res.body.resetLink).toBe(
      `https://app.entreaulas.com/forgot-password?token=${res.body.resetToken}` +
        `&email=${encodeURIComponent(USUARIO_ACTIVO.email)}`
    )
  })

  it('N16 (debug): sin FRONTEND_URL → resetLink cae en http://localhost:5173 (rama || derecha)', async () => {
    fakeDb.seed('usuarios', [USUARIO_ACTIVO])
    process.env.PASSWORD_RESET_DEBUG_RESPONSE = 'true'
    process.env.NODE_ENV = 'test'
    delete process.env.FRONTEND_URL

    const res = await forgot({ email: USUARIO_ACTIVO.email })

    expect(res.status).toBe(200)
    expect(res.body.resetLink.startsWith('http://localhost:5173/forgot-password?')).toBe(true)
  })

  it('N4 (&&): flag=true pero NODE_ENV=production → 200 sin token (rama && derecha falsa)', async () => {
    fakeDb.seed('usuarios', [USUARIO_ACTIVO])
    process.env.PASSWORD_RESET_DEBUG_RESPONSE = 'true'
    process.env.NODE_ENV = 'production'

    const res = await forgot({ email: USUARIO_ACTIVO.email })

    expect(res.status).toBe(200)
    expect(res.body).not.toHaveProperty('resetToken')
  })

  it('N13→N14: falla el INSERT del token → 500 "Error interno del servidor"', async () => {
    fakeDb.seed('usuarios', [USUARIO_ACTIVO])
    fakeDb.fail('password_reset_tokens', { message: 'insert bloqueado' })

    const res = await forgot({ email: USUARIO_ACTIVO.email })

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Error interno del servidor' })
  })

  it('N17: excepción no controlada → catch → 500', async () => {
    vi.spyOn(fakeDb, 'from').mockImplementationOnce(() => {
      throw new Error('caída inesperada')
    })
    const res = await forgot({ email: USUARIO_ACTIVO.email })
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Error interno del servidor' })
  })
})
