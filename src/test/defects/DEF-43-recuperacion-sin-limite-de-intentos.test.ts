/**
 * DEF-43 — forgot-password, validate-reset-token y reset-password sin límite de intentos (RQ3.1/RQ3.4/RQ5)
 *
 * Severidad: Alta | Estado: ABIERTO | Misma causa que DEF-34 (no hay rate limiting en la API)
 *
 * - forgot-password: un atacante puede inundar de correos de recuperación a un usuario (spam / abuso
 *   del proveedor de correo) y llenar la tabla de tokens.
 * - validate-reset-token / reset-password: se pueden probar tokens sin freno.
 * Lo esperado es 429 tras N peticiones desde la misma IP en una ventana de tiempo.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'

vi.mock('../../config/supabase-only', () => import('../helpers/dobles-supabase'))
vi.mock('../../config/supabaseClient', () => import('../helpers/dobles-supabase'))

import { app } from '../../app'
import { fakeDb } from '../helpers/fake-supabase'

const EMAIL = 'ana@soyudemedellin.edu.co'
const estados = async (peticion: (i: number) => Promise<{ status: number }>, n = 40) => {
  const out: number[] = []
  for (let i = 0; i < n; i++) out.push((await peticion(i)).status)
  return out
}

describe('DEF-43 — Límite de intentos en la recuperación de contraseña', () => {
  beforeEach(() => {
    fakeDb.reset()
    fakeDb.seed('usuarios', [{ id: 'u-1', email: EMAIL, nombre: 'Ana', activo: true, password: 'x' }])
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })
  afterEach(() => vi.restoreAllMocks())

  it('40 solicitudes de recuperación seguidas terminan en 429', async () => {
    expect(await estados(() => request(app).post('/api/auth/forgot-password').send({ email: EMAIL }))).toContain(429)
  })

  it('40 validaciones de token seguidas terminan en 429', async () => {
    expect(await estados((i) => request(app).get(`/api/auth/validate-reset-token/adivinando-${i}`).query({ email: EMAIL }))).toContain(429)
  })

  it('40 intentos de reset con tokens inventados terminan en 429', async () => {
    const cuerpo = (i: number) => ({ token: `adivinando-${i}`, email: EMAIL, newPassword: 'Nueva-Clave2026!', confirmPassword: 'Nueva-Clave2026!' })
    expect(await estados((i) => request(app).post('/api/auth/reset-password').send(cuerpo(i)))).toContain(429)
  })
})
