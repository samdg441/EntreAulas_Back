import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'

vi.mock('../../config/supabase-only', () => import('../helpers/dobles-supabase'))
vi.mock('../../config/supabaseClient', () => import('../helpers/dobles-supabase'))

import { app } from '../../app'
import { fakeDb } from '../helpers/fake-supabase'
import { verifyStoredPassword } from '../../utils/passwordSecurity'
import { expectContrato, ErrorApi, MensajeSimple, TokenValido } from '../helpers/contrato'

const EMAIL = 'ana@soyudemedellin.edu.co'
const CLAVE = 'Nueva-Clave2026!'
const MENSAJE_GENERICO = 'Si el correo electrónico existe en nuestro sistema, recibirás un enlace de recuperación'
const futuro = () => new Date(Date.now() + 3600_000).toISOString()
const pasado = () => new Date(Date.now() - 3600_000).toISOString()

const olvide = (body: unknown) => request(app).post('/api/auth/forgot-password').send(body as object)
const validar = (token: string, email?: string) => request(app).get(`/api/auth/validate-reset-token/${encodeURIComponent(token)}`).query(email ? { email } : {})
const restablecer = (body: Record<string, unknown>) => request(app).post('/api/auth/reset-password').send(body)
const sembrarToken = (extra: Record<string, unknown> = {}) =>
  fakeDb.seed('password_reset_tokens', [{ id: 'k1', token: 't-valido', email: EMAIL, used: false, expires_at: futuro(), ...extra }])
const cuerpoReset = (extra: Record<string, unknown> = {}) => ({ token: 't-valido', email: EMAIL, newPassword: CLAVE, confirmPassword: CLAVE, ...extra })
const usuario = () => fakeDb.filas('usuarios')[0] as { password: string }
const token = () => fakeDb.filas('password_reset_tokens')[0] as { used: boolean }

beforeEach(() => {
  fakeDb.reset()
  fakeDb.seed('usuarios', [{ id: 'u-1', email: EMAIL, nombre: 'Ana', apellido: 'Gómez', activo: true, password: 'hash-anterior' }])
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

describe('RQ3.1 — API forgot-password', () => {
  it('RQ3.1·P1: correo registrado → 200, cuerpo exacto y se crea UN token sin usar', async () => {
    const res = await olvide({ email: EMAIL })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ message: MENSAJE_GENERICO })
    expectContrato(res, MensajeSimple)
    const filas = fakeDb.filas('password_reset_tokens') as { email: string; used: boolean; token: string }[]
    expect(filas).toHaveLength(1)
    expect(filas[0]).toMatchObject({ email: EMAIL, used: false })
    expect(filas[0].token).toMatch(/^[0-9a-f]{64}$/)
  })

  it('RQ3.1·P2: correo NO registrado → exactamente la misma respuesta y ningún token', async () => {
    const res = await olvide({ email: 'nadie@soyudemedellin.edu.co' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ message: MENSAJE_GENERICO })
    expect(fakeDb.filas('password_reset_tokens')).toHaveLength(0)
  })

  it('RQ3.1·P3: el token jamás viaja en la respuesta', async () => {
    const res = await olvide({ email: EMAIL })
    const guardado = (fakeDb.filas('password_reset_tokens') as { token: string }[])[0].token

    expect(JSON.stringify(res.body)).not.toContain(guardado)
    expect(res.body).not.toHaveProperty('resetToken')
    expect(res.body).not.toHaveProperty('resetLink')
  })

  it.each([
    ['sin correo', {}, 'El correo electrónico es requerido'],
    ['correo vacío', { email: '' }, 'El correo electrónico es requerido'],
    ['sin dominio', { email: 'ana@' }, 'Formato de correo electrónico inválido'],
    ['con espacios', { email: 'ana @udem.edu.co' }, 'Formato de correo electrónico inválido'],
    ['dos arrobas', { email: 'a@b@udem.edu.co' }, 'Formato de correo electrónico inválido'],
  ])('RQ3.1·N1: %s → 400 con mensaje y sin token', async (_caso, body, mensaje) => {
    const res = await olvide(body)

    expect(res.status).toBe(400)
    expectContrato(res, ErrorApi)
    expect(res.body.error).toBe(mensaje)
    expect(fakeDb.filas('password_reset_tokens')).toHaveLength(0)
  })

  it('RQ3.1·N2: una cuenta desactivada recibe la respuesta genérica y no se le crea token', async () => {
    fakeDb.reset()
    fakeDb.seed('usuarios', [{ id: 'u-1', email: EMAIL, activo: false, password: 'x' }])

    const res = await olvide({ email: EMAIL })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ message: MENSAJE_GENERICO })
    expect(fakeDb.filas('password_reset_tokens')).toHaveLength(0)
  })
})

describe('RQ3.4 — API validate-reset-token', () => {
  it('RQ3.4·P1: token vigente del correo correcto → 200 { message, valid: true }', async () => {
    sembrarToken()

    const res = await validar('t-valido', EMAIL)

    expect(res.status).toBe(200)
    expectContrato(res, TokenValido)
    expect(res.body).toEqual({ message: 'Token válido', valid: true })
  })

  it('RQ3.4·P2: validar no consume el token', async () => {
    sembrarToken()

    await validar('t-valido', EMAIL)

    expect(token().used).toBe(false)
  })

  it.each([
    ['inexistente', () => {}, 't-no-existe', EMAIL, 'Token inválido o ya utilizado'],
    ['ya usado', () => sembrarToken({ used: true }), 't-valido', EMAIL, 'Token inválido o ya utilizado'],
    ['expirado', () => sembrarToken({ expires_at: pasado() }), 't-valido', EMAIL, 'El token ha expirado. Solicita uno nuevo.'],
    ['de otro correo', () => sembrarToken(), 't-valido', 'otro@soyudemedellin.edu.co', 'Token inválido o ya utilizado'],
  ])('RQ3.4·N1: token %s → 400 con su mensaje', async (_caso, preparar, tokenUrl, correo, mensaje) => {
    preparar()

    const res = await validar(tokenUrl, correo)

    expect(res.status).toBe(400)
    expectContrato(res, ErrorApi)
    expect(res.body.error).toBe(mensaje)
  })

  it('RQ3.4·N2: sin el parámetro email → 400', async () => {
    sembrarToken()

    const res = await validar('t-valido')

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'El correo electrónico es requerido' })
  })

  it.each(["' OR '1'='1", '<script>alert(1)</script>', 'a'.repeat(10_000)])('RQ3.4·N3: token hostil "%s" → 400, nunca 5xx', async (hostil) => {
    sembrarToken()

    const res = await validar(hostil, EMAIL)

    expect(res.status).toBe(400)
  })
})

describe('RQ5 — API reset-password', () => {
  it('RQ5·P1: restablece → 200 { message }, guarda bcrypt, marca el token usado', async () => {
    sembrarToken()

    const res = await restablecer(cuerpoReset())

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ message: 'Contraseña actualizada exitosamente' })
    expectContrato(res, MensajeSimple)
    expect(usuario().password).toMatch(/^\$2[aby]\$/)
    expect((await verifyStoredPassword(CLAVE, usuario().password)).ok).toBe(true)
    expect(token().used).toBe(true)
  })

  it('RQ5·P2: la respuesta no deja rastro de la contraseña, el hash ni el token', async () => {
    sembrarToken()

    const res = await restablecer(cuerpoReset())

    expect(JSON.stringify(res.body)).not.toMatch(/\$2[aby]\$|t-valido|Nueva-Clave/)
  })

  it('RQ5·N1: el token es de un solo uso — el segundo intento → 400 y la clave no cambia', async () => {
    sembrarToken()
    await restablecer(cuerpoReset())
    const despues = usuario().password

    const res = await restablecer(cuerpoReset({ newPassword: 'Otra-Clave2026!', confirmPassword: 'Otra-Clave2026!' }))

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Token inválido o ya utilizado' })
    expect(usuario().password).toBe(despues)
  })

  it.each([
    ['sin token', 'token'],
    ['sin correo', 'email'],
    ['sin contraseña nueva', 'newPassword'],
    ['sin confirmación', 'confirmPassword'],
  ])('RQ5·N2: %s → 400 "Todos los campos son requeridos"', async (_caso, campo) => {
    sembrarToken()
    const body = cuerpoReset()
    delete body[campo]

    const res = await restablecer(body)

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Todos los campos son requeridos' })
    expect(usuario().password).toBe('hash-anterior')
  })

  it('RQ5·N3: confirmación distinta → 400', async () => {
    sembrarToken()

    const res = await restablecer(cuerpoReset({ confirmPassword: 'Distinta-2026!' }))

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Las contraseñas no coinciden' })
  })

  it.each([
    ['menos de 8 caracteres', 'Ab1!', 'La contraseña debe tener al menos 8 caracteres'],
    ['sin mayúscula', 'passw0rd!', 'La contraseña debe contener al menos una letra mayúscula'],
    ['sin minúscula', 'PASSW0RD!', 'La contraseña debe contener al menos una letra minúscula'],
    ['sin número', 'Password!', 'La contraseña debe contener al menos un número'],
    ['sin carácter especial', 'Passw0rd1', 'La contraseña debe contener al menos un carácter especial'],
  ])('RQ5·N4: contraseña %s → 400 con su mensaje y el token queda sin usar', async (_caso, clave, mensaje) => {
    sembrarToken()

    const res = await restablecer(cuerpoReset({ newPassword: clave, confirmPassword: clave }))

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: mensaje })
    expect(token().used).toBe(false)
    expect(usuario().password).toBe('hash-anterior')
  })

  it.each([
    ['token expirado', () => sembrarToken({ expires_at: pasado() }), 'El token ha expirado. Solicita uno nuevo.'],
    ['token inexistente', () => {}, 'Token inválido o ya utilizado'],
  ])('RQ5·N5: %s → 400 y la contraseña no cambia', async (_caso, preparar, mensaje) => {
    preparar()

    const res = await restablecer(cuerpoReset())

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: mensaje })
    expect(usuario().password).toBe('hash-anterior')
  })

  it('RQ5·N6: un token válido de OTRO correo no cambia la clave de la víctima', async () => {
    fakeDb.seed('usuarios', [{ id: 'u-2', email: 'atacante@soyudemedellin.edu.co', activo: true, password: 'hash-atacante' }])
    fakeDb.seed('password_reset_tokens', [{ id: 'k9', token: 't-atacante', email: 'atacante@soyudemedellin.edu.co', used: false, expires_at: futuro() }])

    const res = await restablecer(cuerpoReset({ token: 't-atacante' }))

    expect(res.status).toBe(400)
    expect(usuario().password).toBe('hash-anterior')
  })
})
