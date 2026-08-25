import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { queueFrom } from '../helpers/query-builder'
import { fromMock, supabaseModuleMock } from '../helpers/supabase-mock'
import { adminUser, estudianteUser } from '../fixtures/users'
import { setTestUser } from '../helpers/test-user'

vi.mock('../../config/supabase-only', () => supabaseModuleMock)
vi.mock('../../config/supabaseClient', () => supabaseModuleMock)
vi.mock('../../middleware/auth', () => import('../helpers/auth-mock'))

import { app } from '../../app'

/**
 * RQ14 Backend — Auto-inscripción por QR
 * C1 no estudiante | C2 sin fila estudiante | C3 QR inválido
 * C4 alreadyEnrolled | C5 reactiva | C6 crea 201
 */
describe('RQ14 unit — Auto-inscripción por QR', () => {
  beforeEach(() => {
    fromMock.mockReset()
    setTestUser({ ...estudianteUser })
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('C1: no es estudiante → 403', async () => {
    setTestUser({ ...adminUser })
    const res = await request(app).post('/api/qr-evaluaciones/tok/auto-enroll')
    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/estudiantes/i)
  })

  it('C2: sin registro en estudiantes → 404', async () => {
    fromMock.mockImplementation(
      queueFrom({ estudiantes: [{ data: null, error: { message: 'no row' } }] })
    )
    const res = await request(app).post('/api/qr-evaluaciones/tok/auto-enroll')
    expect(res.status).toBe(404)
  })

  it('C3: QR inválido → 404', async () => {
    fromMock.mockImplementation(
      queueFrom({
        estudiantes: [{ data: { id: 'est-1' }, error: null }],
        qr_evaluaciones: [{ data: null, error: null }],
      })
    )
    const res = await request(app).post('/api/qr-evaluaciones/tok/auto-enroll')
    expect(res.status).toBe(404)
    expect(res.body.error).toMatch(/inválido|expirado/i)
  })

  it('C4: inscripción activa → alreadyEnrolled', async () => {
    fromMock.mockImplementation(
      queueFrom({
        estudiantes: [{ data: { id: 'est-1' }, error: null }],
        qr_evaluaciones: [{ data: { id: 1, token: 'tok', grupo_id: 9, activo: true }, error: null }],
        inscripciones: [{ data: { id: 100, activa: true }, error: null }],
      })
    )
    const res = await request(app).post('/api/qr-evaluaciones/tok/auto-enroll')
    expect(res.status).toBe(200)
    expect(res.body.alreadyEnrolled).toBe(true)
    expect(res.body.grupoId).toBe(9)
  })

  it('C5: inscripción inactiva → reactivated', async () => {
    fromMock.mockImplementation(
      queueFrom({
        estudiantes: [{ data: { id: 'est-1' }, error: null }],
        qr_evaluaciones: [{ data: { id: 1, token: 'tok', grupo_id: 9, activo: true }, error: null }],
        inscripciones: [
          { data: { id: 100, activa: false }, error: null },
          { data: null, error: null },
        ],
      })
    )
    const res = await request(app).post('/api/qr-evaluaciones/tok/auto-enroll')
    expect(res.status).toBe(200)
    expect(res.body.reactivated).toBe(true)
  })

  it('C6: sin inscripción → 201 created', async () => {
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
    expect(res.body.created).toBe(true)
    expect(res.body.grupoId).toBe(11)
  })
})
