/**
 * RQ5 / DEF-42 — Al restablecer la contraseña se revocan los JWT emitidos antes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'

vi.mock('../../../config/supabase-only', () => import('../../helpers/dobles-supabase'))
vi.mock('../../../config/supabaseClient', () => import('../../helpers/dobles-supabase'))

import { app } from '../../../app'
import { fakeDb } from '../../helpers/fake-supabase'
import { authRepository } from '../../../modules/auth/auth.repository'
import { tokenAnteriorAlCambioDeClave } from '../../../utils/passwordSecurity'

const EMAIL = 'ana@soyudemedellin.edu.co'
const CLAVE = 'Nueva-Clave2026!'
const firmar = (iat: number) => jwt.sign({ userId: 'u-1', email: EMAIL, iat }, process.env.JWT_SECRET as string, { expiresIn: '1h' })
const ahoraEnSegundos = () => Math.floor(Date.now() / 1000)

function sembrar(passwordChangedAt?: string) {
  fakeDb.seed('usuarios', [
    { id: 'u-1', email: EMAIL, nombre: 'Ana', apellido: 'G', tipo_usuario: 'estudiante', activo: true, password: 'x', password_changed_at: passwordChangedAt },
  ])
  fakeDb.seed('password_reset_tokens', [{ id: 'k1', token: 't', email: EMAIL, used: false, expires_at: new Date(Date.now() + 3600_000).toISOString() }])
}

describe('tokenAnteriorAlCambioDeClave', () => {
  it.each([
    ['sin cambio de clave registrado', 1_000, undefined, false],
    ['sin iat', undefined, '2026-10-26T10:00:00Z', false],
    ['fecha ilegible', 1_000, 'no-es-fecha', false],
    ['token emitido antes del cambio', Date.parse('2026-10-26T10:00:00Z') / 1000 - 1, '2026-10-26T10:00:00.500Z', true],
    ['token emitido en el mismo segundo del cambio', Date.parse('2026-10-26T10:00:00Z') / 1000, '2026-10-26T10:00:00.900Z', false],
    ['token emitido después del cambio', Date.parse('2026-10-26T10:00:05Z') / 1000, '2026-10-26T10:00:00Z', false],
    ['la fecha llega como Date (driver de Postgres)', 1_000, new Date(2_000_000), true],
    ['tipo inesperado', 1_000, 12345, false],
  ])('%s → %s', (_caso, iat, cambio, esperado) => {
    expect(tokenAnteriorAlCambioDeClave(iat as number | undefined, cambio as unknown)).toBe(esperado)
  })
})

describe('RQ5 — reset-password revoca las sesiones anteriores', () => {
  beforeEach(() => {
    fakeDb.reset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })
  afterEach(() => vi.restoreAllMocks())

  it('guarda password_changed_at junto con la nueva clave', async () => {
    sembrar()
    const res = await request(app).post('/api/auth/reset-password').send({ token: 't', email: EMAIL, newPassword: CLAVE, confirmPassword: CLAVE })
    expect(res.status).toBe(200)
    const [u] = fakeDb.filas('usuarios') as { password_changed_at?: string }[]
    expect(Date.parse(String(u.password_changed_at))).toBeGreaterThan(Date.now() - 5_000)
  })

  it('profile y me rechazan (401) un token anterior al cambio y aceptan uno posterior', async () => {
    sembrar(new Date().toISOString())
    const viejo = firmar(ahoraEnSegundos() - 60)
    const nuevo = firmar(ahoraEnSegundos() + 1)

    const perfilViejo = await request(app).get('/api/auth/profile').set('Authorization', `Bearer ${viejo}`)
    expect(perfilViejo.status).toBe(401)
    expect(perfilViejo.body.code).toBe('TOKEN_REVOKED')
    expect((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${viejo}`)).status).toBe(401)

    expect((await request(app).get('/api/auth/profile').set('Authorization', `Bearer ${nuevo}`)).status).toBe(200)
    expect((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${nuevo}`)).status).toBe(200)
  })

  it('sin la columna password_changed_at (migración pendiente) la clave se cambia igual', async () => {
    sembrar()
    const update = vi.spyOn(authRepository, 'updateUser').mockRejectedValueOnce({ code: '42703', message: 'column does not exist' })

    const res = await request(app).post('/api/auth/reset-password').send({ token: 't', email: EMAIL, newPassword: CLAVE, confirmPassword: CLAVE })

    expect(res.status).toBe(200)
    expect(update).toHaveBeenCalledTimes(2)
    expect(update.mock.calls[1][1]).not.toHaveProperty('password_changed_at')
  })

  it('otro error al guardar la clave sigue siendo 500 sin detalles', async () => {
    sembrar()
    vi.spyOn(authRepository, 'updateUser').mockRejectedValueOnce({ code: '23505', message: 'violates constraint' })
    const res = await request(app).post('/api/auth/reset-password').send({ token: 't', email: EMAIL, newPassword: CLAVE, confirmPassword: CLAVE })
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Error al actualizar la contraseña' })
  })
})
