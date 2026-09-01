
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

const reset = (body: Record<string, unknown>) =>
  request(app).post('/api/auth/reset-password').send(body)

const futuro = new Date(Date.now() + 60 * 60 * 1000).toISOString()
const pasado = new Date(Date.now() - 60 * 60 * 1000).toISOString()
const CLAVE_OK = 'Passw0rd!'
const USUARIO = { id: 'u-1', email: 'user@test.com', activo: true }

const sembrarTokenYUsuario = (expira = futuro) => {
  fakeDb.seed('usuarios', [USUARIO])
  fakeDb.seed('password_reset_tokens', [
    { id: 'k1', token: 't-ok', email: USUARIO.email, used: false, expires_at: expira },
  ])
}

const bodyOk = () => ({
  token: 't-ok',
  email: USUARIO.email,
  newPassword: CLAVE_OK,
  confirmPassword: CLAVE_OK,
})

beforeEach(() => fakeDb.reset())
afterEach(() => vi.restoreAllMocks())

describe('RQ5 — reset-password (cobertura estructural, Fake Supabase)', () => {
  it.each([
    ['sin token', { email: USUARIO.email, newPassword: CLAVE_OK, confirmPassword: CLAVE_OK }],
    ['sin email', { token: 't-ok', newPassword: CLAVE_OK, confirmPassword: CLAVE_OK }],
    ['sin newPassword', { token: 't-ok', email: USUARIO.email, confirmPassword: CLAVE_OK }],
    ['sin confirmPassword', { token: 't-ok', email: USUARIO.email, newPassword: CLAVE_OK }],
  ])('N3→N4: %s → 400 "Todos los campos son requeridos"', async (_caso, body) => {
    const res = await reset(body)
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Todos los campos son requeridos' })
  })

  it('N3: los 4 campos presentes → pasa la primera guarda', async () => {
    const res = await reset({ ...bodyOk(), confirmPassword: 'Distinta0!' })
    expect(res.body).not.toEqual({ error: 'Todos los campos son requeridos' })
  })

  it('N5→N6: contraseñas no coinciden → 400', async () => {
    const res = await reset({ ...bodyOk(), confirmPassword: 'Otra0Clave!' })
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Las contraseñas no coinciden' })
  })

  it('N8·1: menos de 8 caracteres → 400', async () => {
    const res = await reset({ token: 't', email: 'a@b.com', newPassword: 'Ab1!', confirmPassword: 'Ab1!' })
    expect(res.body).toEqual({ error: 'La contraseña debe tener al menos 8 caracteres' })
  })

  it('N8·2: sin mayúscula → 400', async () => {
    const res = await reset({ token: 't', email: 'a@b.com', newPassword: 'passw0rd!', confirmPassword: 'passw0rd!' })
    expect(res.body).toEqual({ error: 'La contraseña debe contener al menos una letra mayúscula' })
  })

  it('N8·3: sin minúscula → 400', async () => {
    const res = await reset({ token: 't', email: 'a@b.com', newPassword: 'PASSW0RD!', confirmPassword: 'PASSW0RD!' })
    expect(res.body).toEqual({ error: 'La contraseña debe contener al menos una letra minúscula' })
  })

  it('N8·4: sin número → 400', async () => {
    const res = await reset({ token: 't', email: 'a@b.com', newPassword: 'Password!', confirmPassword: 'Password!' })
    expect(res.body).toEqual({ error: 'La contraseña debe contener al menos un número' })
  })

  it('N8·5: sin carácter especial → 400', async () => {
    const res = await reset({ token: 't', email: 'a@b.com', newPassword: 'Passw0rd1', confirmPassword: 'Passw0rd1' })
    expect(res.body).toEqual({ error: 'La contraseña debe contener al menos un carácter especial' })
  })

  it('N11→N12: token inexistente → 400 (rama !tokenData)', async () => {
    fakeDb.seed('usuarios', [USUARIO])
    const res = await reset(bodyOk())
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Token inválido o ya utilizado' })
  })

  it('N11→N12: error de BD al buscar token → 400 (rama tokenError)', async () => {
    fakeDb.fail('password_reset_tokens', { message: 'sin conexión' })
    const res = await reset(bodyOk())
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Token inválido o ya utilizado' })
  })

  it('N13→N14: token expirado → 400 "El token ha expirado"', async () => {
    sembrarTokenYUsuario(pasado)
    const res = await reset(bodyOk())
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'El token ha expirado. Solicita uno nuevo.' })
  })

  it('N16→N17: usuario no encontrado → 400 (rama !user)', async () => {
    fakeDb.seed('password_reset_tokens', [
      { id: 'k1', token: 't-ok', email: USUARIO.email, used: false, expires_at: futuro },
    ])
    const res = await reset(bodyOk())
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Usuario no encontrado' })
  })

  it('N16→N17: error de BD al buscar usuario → 400 (rama userError)', async () => {
    fakeDb.seed('password_reset_tokens', [
      { id: 'k1', token: 't-ok', email: USUARIO.email, used: false, expires_at: futuro },
    ])
    fakeDb.fail('usuarios', { message: 'sin conexión' })
    const res = await reset(bodyOk())
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Usuario no encontrado' })
  })

  it('N20→N21: falla el UPDATE de la contraseña → 500', async () => {
    sembrarTokenYUsuario()
    fakeDb.fail('usuarios', { message: 'update bloqueado' }, 1) // 1ª consulta (buscar) pasa, 2ª (update) falla
    const res = await reset(bodyOk())
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Error al actualizar la contraseña' })
  })

  it('N23: falla marcar el token como usado → NO corta el flujo, 200', async () => {
    sembrarTokenYUsuario()
    fakeDb.fail('password_reset_tokens', { message: 'update bloqueado' }, 1) // 1ª (buscar token) pasa, 2ª (marcar usado) falla
    const res = await reset(bodyOk())
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ message: 'Contraseña actualizada exitosamente' })
  })

  it('N24: camino feliz → 200 y contraseña hasheada en BD', async () => {
    sembrarTokenYUsuario()
    const res = await reset(bodyOk())
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ message: 'Contraseña actualizada exitosamente' })

    const user = fakeDb.filas('usuarios')[0]
    expect(String(user.password)).toMatch(/^\$2[aby]\$/)
    expect(user.password).not.toBe(CLAVE_OK)
    expect(fakeDb.filas('password_reset_tokens')[0].used).toBe(true)
  })

  it('N25: excepción no controlada → catch → 500', async () => {
    sembrarTokenYUsuario()
    vi.spyOn(fakeDb, 'from').mockImplementationOnce(() => {
      throw new Error('caída inesperada')
    })
    const res = await reset(bodyOk())
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Error interno del servidor' })
  })
})
