
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'

vi.mock('../../config/supabase-only', () => import('../helpers/dobles-supabase'))
vi.mock('../../config/supabaseClient', () => import('../helpers/dobles-supabase'))

import { app } from '../../app'
import { fakeDb } from '../helpers/fake-supabase'
import { verifyStoredPassword } from '../../utils/passwordSecurity'

const futuro = () => new Date(Date.now() + 3600_000).toISOString()
const pasado = () => new Date(Date.now() - 3600_000).toISOString()
const EMAIL = 'ana@soyudemedellin.edu.co'
const CLAVE = 'Nueva-Clave2026!'
const USUARIO = { id: 'u-1', email: EMAIL, nombre: 'Ana', apellido: 'Gómez', activo: true, password: 'hash-anterior' }

const olvide = (body: unknown) => request(app).post('/api/auth/forgot-password').send(body as object)
const validar = (token: string, email?: string) =>
  request(app).get(`/api/auth/validate-reset-token/${encodeURIComponent(token)}`).query(email ? { email } : {})
const restablecer = (body: Record<string, unknown>) => request(app).post('/api/auth/reset-password').send(body)
const sembrarToken = (extra: Record<string, unknown> = {}) =>
  fakeDb.seed('password_reset_tokens', [{ id: 'k1', token: 't-valido', email: EMAIL, used: false, expires_at: futuro(), ...extra }])
const cuerpoReset = (extra: Record<string, unknown> = {}) => ({ token: 't-valido', email: EMAIL, newPassword: CLAVE, confirmPassword: CLAVE, ...extra })

beforeEach(() => {
  fakeDb.reset()
  fakeDb.seed('usuarios', [{ ...USUARIO }])
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

describe('RQ3.1 — Solicitud de recuperación (forgot-password)', () => {
  it('correo existente e inexistente reciben exactamente la misma respuesta (sin enumeración)', async () => {
    const existente = await olvide({ email: EMAIL })
    const inexistente = await olvide({ email: 'nadie@soyudemedellin.edu.co' })

    expect(existente.status).toBe(200)
    expect(inexistente.status).toBe(200)
    expect(existente.body).toEqual(inexistente.body)
  })

  it('el token NO viaja en el JSON de la respuesta (solo por correo)', async () => {
    const res = await olvide({ email: EMAIL })

    expect(JSON.stringify(res.body)).not.toMatch(/resetToken|resetLink|token/i)
    expect(fakeDb.filas('password_reset_tokens')).toHaveLength(1)
  })

  it('aunque PASSWORD_RESET_DEBUG_RESPONSE=true, en producción el token no se devuelve', async () => {
    vi.stubEnv('PASSWORD_RESET_DEBUG_RESPONSE', 'true')
    vi.stubEnv('NODE_ENV', 'production')

    const res = await olvide({ email: EMAIL })

    expect(res.body).not.toHaveProperty('resetToken')
    vi.unstubAllEnvs()
  })

  it('el token generado tiene ≥ 256 bits de entropía, es único y vence en ≤ 1 h', async () => {
    await olvide({ email: EMAIL })
    await olvide({ email: EMAIL })
    const [a, b] = fakeDb.filas('password_reset_tokens') as { token: string; expires_at: string; used: boolean }[]

    expect(a.token).toMatch(/^[0-9a-f]{64}$/)
    expect(a.token).not.toBe(b.token)
    expect(new Date(a.expires_at).getTime() - Date.now()).toBeLessThanOrEqual(3600_000)
    expect(a.used).toBe(false)
  })

  it.each([
    ['sin correo', {}],
    ['correo vacío', { email: '' }],
    ['CRLF (inyección de cabeceras)', { email: 'ana@udem.edu.co\r\nBcc: x@evil.co' }],
    ['varios destinatarios', { email: 'a@udem.edu.co b@evil.co' }],
    ['formato inválido', { email: 'no-es-correo' }],
  ])('entrada inválida (%s) → 400 y no se crea ningún token', async (_caso, body) => {
    const res = await olvide(body)

    expect(res.status).toBe(400)
    expect(fakeDb.filas('password_reset_tokens')).toHaveLength(0)
  })

  it.each([
    ['correo como objeto', { email: { $ne: null } }],
    ['correo como arreglo', { email: [EMAIL] }],
    ['correo de 100 000 caracteres', { email: `${'a'.repeat(100_000)}@udem.edu.co` }],
  ])('entrada extraña (%s) no produce 500', async (_caso, body) => {
    const res = await olvide(body)

    expect(res.status).toBeLessThan(500)
  })

  it('una cuenta inactiva no genera token y responde igual que una inexistente', async () => {
    fakeDb.reset()
    fakeDb.seed('usuarios', [{ ...USUARIO, activo: false }])

    const res = await olvide({ email: EMAIL })

    expect(res.status).toBe(200)
    expect(fakeDb.filas('password_reset_tokens')).toHaveLength(0)
  })
})

describe('RQ3.4 — Validación del token de recuperación (validate-reset-token)', () => {
  it('un token vigente y del correo correcto es válido', async () => {
    sembrarToken()

    const res = await validar('t-valido', EMAIL)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ message: 'Token válido', valid: true })
  })

  it('el token es ligado al correo: el mismo token con otro correo es inválido', async () => {
    sembrarToken()

    const res = await validar('t-valido', 'otro@soyudemedellin.edu.co')

    expect(res.status).toBe(400)
  })

  it.each([
    ['inexistente', () => {}, 't-no-existe'],
    ['expirado', () => sembrarToken({ expires_at: pasado() }), 't-valido'],
    ['ya usado', () => sembrarToken({ used: true }), 't-valido'],
  ])('token %s → 400 con mensaje genérico', async (_caso, preparar, token) => {
    preparar()

    const res = await validar(token, EMAIL)

    expect(res.status).toBe(400)
    expect(JSON.stringify(res.body)).not.toMatch(/Error:|at .*\.ts|supabase|postgres/i)
  })

  it('sin correo → 400', async () => {
    sembrarToken()

    expect((await validar('t-valido')).status).toBe(400)
  })

  it.each([
    ['inyección SQL', "' OR '1'='1"],
    ['script', '<script>alert(1)</script>'],
    ['path traversal', '..%2F..%2Fetc%2Fpasswd'],
    ['token de 10 000 caracteres', 'a'.repeat(10_000)],
    ['comodín', '%'],
  ])('token con %s no devuelve 5xx ni se acepta', async (_caso, token) => {
    sembrarToken()

    const res = await validar(token, EMAIL)

    expect(res.status).toBe(400)
  })

  it('validar no consume el token (se puede validar y luego restablecer)', async () => {
    sembrarToken()

    await validar('t-valido', EMAIL)

    expect((fakeDb.filas('password_reset_tokens')[0] as { used: boolean }).used).toBe(false)
  })
})

describe('RQ5 — Restablecer contraseña (reset-password)', () => {
  it('restablece, guarda un hash bcrypt (no texto plano) y marca el token como usado', async () => {
    sembrarToken()

    const res = await restablecer(cuerpoReset())

    expect(res.status).toBe(200)
    const guardada = (fakeDb.filas('usuarios')[0] as { password: string }).password
    expect(guardada).not.toBe(CLAVE)
    expect(guardada).toMatch(/^\$2[aby]\$/)
    expect((await verifyStoredPassword(CLAVE, guardada)).ok).toBe(true)
    expect((fakeDb.filas('password_reset_tokens')[0] as { used: boolean }).used).toBe(true)
  })

  it('el token es de un solo uso: la segunda vez → 400 y la contraseña no cambia', async () => {
    sembrarToken()
    await restablecer(cuerpoReset())
    const despues = (fakeDb.filas('usuarios')[0] as { password: string }).password

    const reuso = await restablecer(cuerpoReset({ newPassword: 'Otra-Clave2026!', confirmPassword: 'Otra-Clave2026!' }))

    expect(reuso.status).toBe(400)
    expect((fakeDb.filas('usuarios')[0] as { password: string }).password).toBe(despues)
  })

  it('un token expirado no restablece la contraseña', async () => {
    sembrarToken({ expires_at: pasado() })

    const res = await restablecer(cuerpoReset())

    expect(res.status).toBe(400)
    expect((fakeDb.filas('usuarios')[0] as { password: string }).password).toBe('hash-anterior')
  })

  it('un token de otro correo no sirve para cambiar la contraseña de la víctima', async () => {
    fakeDb.seed('usuarios', [{ id: 'u-2', email: 'atacante@soyudemedellin.edu.co', activo: true, password: 'hash-atacante' }])
    fakeDb.seed('password_reset_tokens', [{ id: 'k9', token: 't-atacante', email: 'atacante@soyudemedellin.edu.co', used: false, expires_at: futuro() }])

    const res = await restablecer(cuerpoReset({ token: 't-atacante' }))

    expect(res.status).toBe(400)
    expect((fakeDb.filas('usuarios')[0] as { password: string }).password).toBe('hash-anterior')
  })

  it.each([
    ['corta', 'Ab1!'],
    ['sin mayúscula', 'passw0rd!'],
    ['sin número', 'Password!'],
    ['sin especial', 'Passw0rd1'],
  ])('contraseña débil (%s) → 400 y el token queda sin usar', async (_caso, pass) => {
    sembrarToken()

    const res = await restablecer(cuerpoReset({ newPassword: pass, confirmPassword: pass }))

    expect(res.status).toBe(400)
    expect((fakeDb.filas('password_reset_tokens')[0] as { used: boolean }).used).toBe(false)
  })

  it('confirmación distinta → 400', async () => {
    sembrarToken()

    expect((await restablecer(cuerpoReset({ confirmPassword: 'Distinta-2026!' }))).status).toBe(400)
  })

  it.each([
    ['token como objeto', { token: { $ne: null } }],
    ['correo como objeto', { email: { $ne: null } }],
    ['contraseña como número', { newPassword: 12345678, confirmPassword: 12345678 }],
    ['contraseña como arreglo', { newPassword: [CLAVE], confirmPassword: [CLAVE] }],
    ['contraseña de 100 000 caracteres', { newPassword: `Aa1!${'x'.repeat(100_000)}`, confirmPassword: `Aa1!${'x'.repeat(100_000)}` }],
  ])('entrada extraña (%s) no produce 500 ni cambia la contraseña', async (_caso, extra) => {
    sembrarToken()

    const res = await restablecer(cuerpoReset(extra))

    expect(res.status).toBeLessThan(500)
    expect((fakeDb.filas('usuarios')[0] as { password: string }).password).toBe('hash-anterior')
  })

  it('la respuesta no incluye la contraseña, el hash ni el token', async () => {
    sembrarToken()

    const res = await restablecer(cuerpoReset())

    expect(JSON.stringify(res.body)).not.toMatch(/\$2[aby]\$|t-valido|Nueva-Clave/)
  })

  it('una cuenta desactivada no puede restablecer su contraseña', async () => {
    fakeDb.reset()
    fakeDb.seed('usuarios', [{ ...USUARIO, activo: false }])
    sembrarToken()

    const res = await restablecer(cuerpoReset())

    expect(res.status).toBe(400)
  })
})
