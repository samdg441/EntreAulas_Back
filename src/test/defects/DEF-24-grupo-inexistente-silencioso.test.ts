/**
 * DEF-24 — Un grupoIds inexistente se pierde en silencio (RQ15)
 *
 * Severidad: Media | Estado: ABIERTO
 *
 * En POST /batch, si el id no aparece en `grupos`, el loop hace `continue`
 * sin empujar a `skipped` ni devolver 400. El cliente recibe 201
 * `{ created: [], skipped: [] }` y no sabe que el grupo no existía.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { queueFrom } from '../helpers/query-builder'
import { fromMock, supabaseModuleMock } from '../helpers/supabase-mock'
import { adminUser } from '../fixtures/users'
import { setTestUser } from '../helpers/test-user'

vi.mock('../../config/supabase-only', () => supabaseModuleMock)
vi.mock('../../config/supabaseClient', () => supabaseModuleMock)
vi.mock('../../middleware/auth', () => import('../helpers/auth-mock'))

vi.mock('../../modules/auth/role.service', () => ({
  RoleService: { obtenerCoordinadorPorUsuario: vi.fn() },
}))

import { app } from '../../app'

describe('DEF-24 — Un grupo inexistente debe reportarse en skipped o 400', () => {
  beforeEach(() => {
    fromMock.mockReset()
    setTestUser({ ...adminUser })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    fromMock.mockImplementation(
      queueFrom({
        grupos: [{ data: [], error: null }],
        asignaciones_profesor: [{ data: [], error: null }],
        qr_evaluaciones: [{ data: [], error: null }],
      })
    )
  })

  it('grupo 999 debe ir a skipped o responder 400', async () => {
    const res = await request(app).post('/api/qr-evaluaciones/batch').send({ grupoIds: [999] })
    const skipped = res.body.skipped ?? []
    const aviso = skipped.some((s: { grupoId: number }) => Number(s.grupoId) === 999)
    expect(res.status === 400 || aviso).toBe(true)
  })
})
