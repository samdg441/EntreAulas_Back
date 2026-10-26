/**
 * DEF-39 — POST /api/auth/register es público y permite crear cuentas "admin" (RQ1)
 *
 * Severidad: CRÍTICA | Estado: CORREGIDO (2026-10-26)
 *
 * RQ1 exige que solo un administrador cree usuarios (`create-user` + requireRole(['admin'])).
 * Pero `register` no tiene autenticación y su esquema acepta `tipo_usuario: 'admin'`:
 * cualquiera obtiene un usuario administrador y un JWT. El control de RQ1 queda anulado.
 *
 * Esta prueba expresa el comportamiento CORRECTO esperado y falla a propósito.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { supabaseModuleMock } from '../helpers/supabase-mock'

const { repo } = vi.hoisted(() => ({
  repo: {
    findUserByEmail: vi.fn().mockResolvedValue(null),
    findUserById: vi.fn(),
    updateUser: vi.fn(),
    createUserWithType: vi.fn(async (d: Record<string, unknown>) => ({ id: 'nuevo', activo: true, ...d })),
    countUsers: vi.fn(),
  },
}))
vi.mock('../../config/supabase-only', () => supabaseModuleMock)
vi.mock('../../config/supabaseClient', () => supabaseModuleMock)
vi.mock('../../modules/auth/auth.repository', () => ({ authRepository: repo }))

import { app } from '../../app'

describe('DEF-39 — El autoregistro no debe permitir roles privilegiados', () => {
  afterEach(() => vi.restoreAllMocks())

  it.each(['admin', 'coordinador', 'decano'])('un anónimo que se registra como "%s" es rechazado (400/401/403)', async (tipo) => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: `intruso@udemedellin.edu.co`, nombre: 'Intruso', apellido: 'Anónimo', tipo_usuario: tipo, password: 'Clave-Segura2026!' })

    expect([400, 401, 403]).toContain(res.status)
    expect(res.body.token).toBeUndefined()
  })
})
