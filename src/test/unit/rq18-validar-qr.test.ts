import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { queueFrom } from '../helpers/query-builder'
import { fromMock, supabaseModuleMock } from '../helpers/supabase-mock'
import qrFixture from '../fixtures/rq18-qr.json'

vi.mock('../../config/supabase-only', () => supabaseModuleMock)
vi.mock('../../config/supabaseClient', () => supabaseModuleMock)

import { app } from '../../app'
import qrRouter from '../../modules/evaluations/qr-evaluaciones.routes'

function getTokenHandler() {
  const layer = (
    qrRouter as unknown as {
      stack: Array<{
        route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: Function }> }
      }>
    }
  ).stack.find((item) => item.route?.path === '/:token' && item.route.methods.get)
  return layer!.route!.stack[layer!.route!.stack.length - 1].handle
}

/**
 * RQ18 Backend — Validar QR (grafo)
 * C1 !token→400 | C2 error BD→500 | C3 !row→404 | C4 OK→200
 */
describe('RQ18 unit — Validar QR vencido o inválido', () => {
  beforeEach(() => {
    fromMock.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('C1: sin token → 400 Token requerido', async () => {
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() }
    await getTokenHandler()({ params: {} }, res)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith(qrFixture.errores.tokenRequerido)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('C2: error de consulta BD → 500', async () => {
    fromMock.mockImplementation(
      queueFrom({ qr_evaluaciones: [{ data: null, error: { message: 'db' } }] })
    )
    const res = await request(app).get('/api/qr-evaluaciones/t-err')
    expect(res.status).toBe(500)
    expect(res.body).toEqual(qrFixture.errores.errorResolver)
  })

  it('C3: QR inexistente o inactivo → 404', async () => {
    fromMock.mockImplementation(
      queueFrom({ qr_evaluaciones: [{ data: null, error: null }] })
    )
    const res = await request(app).get('/api/qr-evaluaciones/t-invalido')
    expect(res.status).toBe(404)
    expect(res.body).toEqual(qrFixture.errores.qrInvalidoOExpirado)
  })

  it('C4: QR activo → 200', async () => {
    fromMock.mockImplementation(
      queueFrom({ qr_evaluaciones: [{ data: qrFixture.tokenValido, error: null }] })
    )
    const res = await request(app).get('/api/qr-evaluaciones/t-ok')
    expect(res.status).toBe(200)
    expect(res.body.profesorId).toBe(qrFixture.tokenValido.profesor_id)
    expect(res.body.cursoId).toBe(qrFixture.tokenValido.curso_id)
    expect(res.body.grupoId).toBe(qrFixture.tokenValido.grupo_id)
  })
})
