/**
 * DEF-42 — Un JWT emitido antes de restablecer la contraseña sigue siendo válido (RQ5)
 *
 * Severidad: Media | Estado: ABIERTO
 *
 * El motivo habitual de restablecer la clave es una cuenta comprometida. Hoy el JWT (24 h) no se
 * revoca: el atacante conserva la sesión aunque la víctima cambie la clave. Corrección: guardar
 * `password_changed_at` / `token_version` y rechazar tokens con `iat` anterior.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'

vi.mock('../../config/supabase-only', () => import('../helpers/dobles-supabase'))
vi.mock('../../config/supabaseClient', () => import('../helpers/dobles-supabase'))

import { app } from '../../app'
import { fakeDb } from '../helpers/fake-supabase'

describe('DEF-42 — Revocar sesiones al restablecer la contraseña', () => {
  beforeEach(() => {
    fakeDb.reset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })
  afterEach(() => vi.restoreAllMocks())

  it('el token anterior al reset recibe 401', async () => {
    fakeDb.seed('usuarios', [{ id: 'u-1', email: 'ana@soyudemedellin.edu.co', nombre: 'Ana', apellido: 'G', tipo_usuario: 'estudiante', activo: true, password: 'viejo' }])
    fakeDb.seed('password_reset_tokens', [{ id: 'k1', token: 't', email: 'ana@soyudemedellin.edu.co', used: false, expires_at: new Date(Date.now() + 3600_000).toISOString() }])
    const antes = jwt.sign({ userId: 'u-1' }, process.env.JWT_SECRET as string, { expiresIn: '1h', noTimestamp: false })
    await new Promise((r) => setTimeout(r, 1100)) // iat en segundos: el reset debe quedar estrictamente después

    await request(app).post('/api/auth/reset-password').send({ token: 't', email: 'ana@soyudemedellin.edu.co', newPassword: 'Nueva-Clave2026!', confirmPassword: 'Nueva-Clave2026!' })
    const res = await request(app).get('/api/auth/profile').set('Authorization', `Bearer ${antes}`)

    expect(res.status).toBe(401)
  })
})
