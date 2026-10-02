import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { queueFrom } from '../../helpers/query-builder'
import { fromMock, supabaseModuleMock } from '../../helpers/supabase-mock'
import { estudianteUser } from '../../fixtures/users'
import { setTestUser } from '../../helpers/test-user'

vi.mock('../../../config/supabase-only', () => supabaseModuleMock)
vi.mock('../../../config/supabaseClient', () => supabaseModuleMock)
vi.mock('../../../middleware/auth', () => import('../../helpers/auth-mock'))

import { app } from '../../../app'

describe('Calendario — GET /api/periodos/evaluacion', () => {
  beforeEach(() => {
    fromMock.mockReset()
    setTestUser({ ...estudianteUser })
  })

  it('devuelve las ventanas de evaluación con nombres en camelCase', async () => {
    fromMock.mockImplementation(
      queueFrom({
        periodos_academicos: [
          {
            data: [{ id: 2, ano: 2026, semestre: 1, fecha_inicio_evaluacion: '2026-09-28', fecha_fin_evaluacion: '2026-10-09' }],
            error: null,
          },
        ],
      })
    )

    const res = await request(app).get('/api/periodos/evaluacion')

    expect(res.status).toBe(200)
    expect(res.body).toEqual([
      { periodoId: 2, ano: 2026, semestre: 1, fechaInicio: '2026-09-28', fechaFin: '2026-10-09' },
    ])
  })

  it('si aún no se ejecutó el SQL (columna inexistente) responde lista vacía', async () => {
    fromMock.mockImplementation(
      queueFrom({ periodos_academicos: [{ data: null, error: { code: '42703', message: 'column does not exist' } }] })
    )

    const res = await request(app).get('/api/periodos/evaluacion')

    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  it('cualquier otro error de base de datos → 500', async () => {
    fromMock.mockImplementation(queueFrom({ periodos_academicos: [{ data: null, error: { code: 'XX000', message: 'db' } }] }))

    const res = await request(app).get('/api/periodos/evaluacion')

    expect(res.status).toBe(500)
  })

  it('PUT guarda la ventana del periodo indicado', async () => {
    fromMock.mockImplementation(queueFrom({ periodos_academicos: [{ data: [{ id: 2 }], error: null }] }))

    const res = await request(app)
      .put('/api/periodos/evaluacion')
      .send({ periodo: '2026-1', fechaInicio: '2026-09-28', fechaFin: '2026-10-09' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ periodoId: 2, ano: 2026, semestre: 1, fechaInicio: '2026-09-28', fechaFin: '2026-10-09' })
  })

  it.each([
    [{ periodo: '2026', fechaInicio: '2026-09-28', fechaFin: '2026-10-09' }, /formato AAAA-S/],
    [{ periodo: '2026-1', fechaInicio: '', fechaFin: '2026-10-09' }, /obligatorias/],
    [{ periodo: '2026-1', fechaInicio: '2026-10-09', fechaFin: '2026-09-28' }, /anterior/],
  ])('PUT valida los datos (%o)', async (body, mensaje) => {
    const res = await request(app).put('/api/periodos/evaluacion').send(body)
    expect(res.status).toBe(400)
    expect(JSON.stringify(res.body)).toMatch(mensaje)
  })

  it('PUT con un periodo que no existe → 404', async () => {
    fromMock.mockImplementation(queueFrom({ periodos_academicos: [{ data: [], error: null }] }))
    const res = await request(app)
      .put('/api/periodos/evaluacion')
      .send({ periodo: '2030-2', fechaInicio: '2030-09-01', fechaFin: '2030-09-10' })
    expect(res.status).toBe(404)
  })

  it('PUT sin las columnas en la base → 503; otro error → 500', async () => {
    const body = { periodo: '2026-1', fechaInicio: '2026-09-28', fechaFin: '2026-10-09' }
    fromMock.mockImplementation(queueFrom({ periodos_academicos: [{ data: null, error: { code: '42703' } }] }))
    expect((await request(app).put('/api/periodos/evaluacion').send(body)).status).toBe(503)
    fromMock.mockImplementation(queueFrom({ periodos_academicos: [{ data: null, error: { code: 'XX000' } }] }))
    expect((await request(app).put('/api/periodos/evaluacion').send(body)).status).toBe(500)
  })

  it('sin datos devuelve lista vacía', async () => {
    fromMock.mockImplementation(queueFrom({ periodos_academicos: [{ data: null, error: null }] }))

    const res = await request(app).get('/api/periodos/evaluacion')

    expect(res.body).toEqual([])
  })
})
