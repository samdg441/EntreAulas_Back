import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { queueFrom } from '../helpers/query-builder'
import { fromMock, supabaseModuleMock } from '../helpers/supabase-mock'
import { estudianteUser } from '../fixtures/users'
import { setTestUser } from '../helpers/test-user'

vi.mock('../../config/supabase-only', () => supabaseModuleMock)
vi.mock('../../config/supabaseClient', () => supabaseModuleMock)
vi.mock('../../middleware/auth', () => import('../helpers/auth-mock'))

import { app } from '../../app'

/** RQ14 integración: smoke HTTP camino feliz. */
describe('RQ14 integration — Auto-inscripción', () => {
  beforeEach(() => {
    fromMock.mockReset()
    setTestUser({ ...estudianteUser })
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('C6 HTTP: 201 created', async () => {
    fromMock.mockImplementation(
      queueFrom({
        estudiantes: [{ data: { id: 'est-1' }, error: null }],
        qr_evaluaciones: [{ data: { id: 1, token: 'tok', grupo_id: 11, activo: true }, error: null }],
        inscripciones: [
          { data: null, error: null },
          { data: { id: 200 }, error: null },
        ],
      })
    )
    const res = await request(app).post('/api/qr-evaluaciones/tok/auto-enroll')
    expect(res.status).toBe(201)
    expect(res.body.enrolled).toBe(true)
  })
})
