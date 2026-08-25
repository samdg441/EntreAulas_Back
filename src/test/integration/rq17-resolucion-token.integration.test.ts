import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { queueFrom } from '../helpers/query-builder'
import { fromMock, supabaseModuleMock } from '../helpers/supabase-mock'
import qrFixture from '../fixtures/rq18-qr.json'

vi.mock('../../config/supabase-only', () => supabaseModuleMock)
vi.mock('../../config/supabaseClient', () => supabaseModuleMock)

import { app } from '../../app'

/** RQ17 integración: contrato HTTP GET /:token (C2–C4; C1 es unit con params vacíos). */
describe('RQ17 integration — Resolución de token QR', () => {
  beforeEach(() => {
    fromMock.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('C2: error BD → 500', async () => {
    fromMock.mockImplementation(
      queueFrom({ qr_evaluaciones: [{ data: null, error: { message: 'db' } }] })
    )
    const res = await request(app).get('/api/qr-evaluaciones/x')
    expect(res.status).toBe(500)
    expect(res.body).toEqual(qrFixture.errores.errorResolver)
  })

  it('C3: QR inválido/inactivo → 404', async () => {
    fromMock.mockImplementation(
      queueFrom({ qr_evaluaciones: [{ data: null, error: null }] })
    )
    const res = await request(app).get('/api/qr-evaluaciones/x')
    expect(res.status).toBe(404)
    expect(res.body).toEqual(qrFixture.errores.qrInvalidoOExpirado)
  })

  it('C4: QR válido → 200', async () => {
    fromMock.mockImplementation(
      queueFrom({ qr_evaluaciones: [{ data: qrFixture.tokenValido, error: null }] })
    )
    const res = await request(app).get('/api/qr-evaluaciones/ok')
    expect(res.status).toBe(200)
    expect(res.body.profesorId).toBe(qrFixture.tokenValido.profesor_id)
    expect(res.body.cursoId).toBe(qrFixture.tokenValido.curso_id)
    expect(res.body.grupoId).toBe(qrFixture.tokenValido.grupo_id)
  })
})
