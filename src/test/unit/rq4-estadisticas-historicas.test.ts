import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { queueFrom } from '../helpers/query-builder'
import { fromMock, supabaseModuleMock } from '../helpers/supabase-mock'
import { profesorUser } from '../fixtures/users'

vi.mock('../../config/supabase-only', () => supabaseModuleMock)
vi.mock('../../config/supabaseClient', () => supabaseModuleMock)

vi.mock('../../middleware/auth', () => ({
  authenticateToken: (req: { user?: unknown }, _res: unknown, next: () => void) => {
    req.user = (globalThis as { __testUser?: unknown }).__testUser
    next()
  },
  requireRole: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}))

import { app } from '../../app'

/**
 * RQ4 Backend — Stats históricas
 * C1 no profesor → mock 200 | C2 error evals → 500 | C3 OK
 */
describe('RQ4 unit — Consultar estadísticas históricas', () => {
  beforeEach(() => {
    fromMock.mockReset()
    ;(globalThis as { __testUser?: unknown }).__testUser = { ...profesorUser }
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it('C1: profesor no existe → 200 mock', async () => {
    // El handler consulta profesores dos veces (debug + real)
    fromMock.mockImplementation(
      queueFrom({
        profesores: [
          { data: null, error: { message: 'nf' } },
          { data: null, error: { message: 'nf' } },
        ],
      })
    )
    const res = await request(app).get('/api/teachers/999/stats/historical?period=2026-1')
    expect(res.status).toBe(200)
    expect(res.body.isMockData).toBe(true)
    expect(res.body.totalEvaluaciones).toBe(0)
  })

  it('C2: error consultando evaluaciones → 500', async () => {
    fromMock.mockImplementation(
      queueFrom({
        profesores: [
          { data: { id: 7 }, error: null },
          { data: { id: 7 }, error: null },
        ],
        evaluaciones: [{ data: null, error: { message: 'db' } }],
      })
    )
    const res = await request(app).get('/api/teachers/7/stats/historical?period=2026-1')
    expect(res.status).toBe(500)
  })

  it('C3: OK → promedio del período', async () => {
    fromMock.mockImplementation(
      queueFrom({
        profesores: [
          { data: { id: 7 }, error: null },
          { data: { id: 7 }, error: null },
        ],
        evaluaciones: [
          {
            data: [
              {
                id: 1,
                calificacion_promedio: 4,
                fecha_creacion: '2026-03-01',
                grupo_id: 10,
                estudiante_id: 1,
              },
              {
                id: 2,
                calificacion_promedio: 5,
                fecha_creacion: '2026-03-02',
                grupo_id: 10,
                estudiante_id: 2,
              },
            ],
            error: null,
          },
        ],
        grupos: [{ data: [{ id: 10, curso_id: 1, numero_grupo: 1 }], error: null }],
        cursos: [{ data: [{ id: 1, nombre: 'Cálculo', codigo: 'C1' }], error: null }],
      })
    )
    const res = await request(app).get('/api/teachers/7/stats/historical?period=2026-1')
    expect(res.status).toBe(200)
    expect(res.body.period).toBe('2026-1')
    expect(res.body.calificacionPromedio).toBe(4.5)
    expect(res.body.totalEvaluaciones).toBe(2)
  })
})
