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

/** RQ15 integración: smoke 201 { created, skipped }. */
describe('RQ15 integration — Generación masiva QR', () => {
  beforeEach(() => {
    fromMock.mockReset()
    setTestUser({ ...adminUser })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('C7 HTTP: 201 con created[].token', async () => {
    fromMock.mockImplementation(
      queueFrom({
        grupos: [{ data: [{ id: 7, curso_id: 3, profesor_id: 'p-1' }], error: null }],
        asignaciones_profesor: [
          { data: [{ id: 1, grupo_id: 7, profesor_id: 'p-1', curso_id: 3 }], error: null },
        ],
        qr_evaluaciones: [
          { data: [], error: null },
          { data: null, error: null },
        ],
      })
    )
    const res = await request(app).post('/api/qr-evaluaciones/batch').send({ grupoIds: [7] })
    expect(res.status).toBe(201)
    expect(res.body).toHaveProperty('created')
    expect(res.body).toHaveProperty('skipped')
    expect(res.body.created[0].token).toBeTruthy()
  })
})
