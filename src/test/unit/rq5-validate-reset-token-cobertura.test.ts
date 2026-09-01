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

const validar = (token: string, email?: string) => {
  const req = request(app).get(`/api/auth/validate-reset-token/${token}`)
  return email === undefined ? req : req.query({ email })
}

const futuro = new Date(Date.now() + 60 * 60 * 1000).toISOString()
const pasado = new Date(Date.now() - 60 * 60 * 1000).toISOString()

beforeEach(() => fakeDb.reset())
afterEach(() => vi.restoreAllMocks())

describe('RQ5 — validate-reset-token (cobertura estructural, Fake Supabase)', () => {
  it('N2→N3: sin email → 400 "requerido"', async () => {
    const res = await validar('t-ok')
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'El correo electrónico es requerido' })
  })

  it('N5→N6: token no existe → 400 "Token inválido o ya utilizado" (rama !tokenData)', async () => {
    const res = await validar('t-desconocido', 'user@test.com')
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Token inválido o ya utilizado' })
  })

  it('N5→N6: error de BD → 400 (rama tokenError)', async () => {
    fakeDb.fail('password_reset_tokens', { message: 'sin conexión' })
    const res = await validar('t-ok', 'user@test.com')
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Token inválido o ya utilizado' })
  })

  it('N7→N8: token expirado → 400 "El token ha expirado"', async () => {
    fakeDb.seed('password_reset_tokens', [
      { id: 'k1', token: 't-exp', email: 'user@test.com', used: false, expires_at: pasado },
    ])
    const res = await validar('t-exp', 'user@test.com')
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'El token ha expirado. Solicita uno nuevo.' })
  })

  it('N9: token válido y vigente → 200 "Token válido"', async () => {
    fakeDb.seed('password_reset_tokens', [
      { id: 'k2', token: 't-ok', email: 'user@test.com', used: false, expires_at: futuro },
    ])
    const res = await validar('t-ok', 'user@test.com')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ message: 'Token válido', valid: true })
  })

  it('N10: excepción no controlada → catch → 500', async () => {
    vi.spyOn(fakeDb, 'from').mockImplementationOnce(() => {
      throw new Error('caída inesperada')
    })
    const res = await validar('t-ok', 'user@test.com')
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Error interno del servidor' })
  })
})
