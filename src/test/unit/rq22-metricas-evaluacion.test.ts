import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { queueFrom } from '../helpers/query-builder'
import { fromMock, supabaseModuleMock } from '../helpers/supabase-mock'
import { profesorUser, estudianteUser } from '../fixtures/users'

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
 * RQ22 Backend — Calcular métricas
 * C1 no profesor→403 | C2 no existe→404 | C3 error evals→500 | C4 OK
 */
describe('RQ22 unit — Calcular métricas de evaluación', () => {
  beforeEach(() => {
    fromMock.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it('C1: no es profesor → 403', async () => {
    ;(globalThis as { __testUser?: unknown }).__testUser = { ...estudianteUser }
    const res = await request(app).get('/api/teachers/teacher-stats/1')
    expect(res.status).toBe(403)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('C2: profesor no existe → 404', async () => {
    ;(globalThis as { __testUser?: unknown }).__testUser = { ...profesorUser }
    fromMock.mockImplementation(
      queueFrom({ profesores: [{ data: null, error: { message: 'not found' } }] })
    )
    const res = await request(app).get('/api/teachers/teacher-stats/999')
    expect(res.status).toBe(404)
    expect(res.body.error).toBe('Profesor no encontrado')
  })

  it('C3: error al leer evaluaciones → 500', async () => {
    ;(globalThis as { __testUser?: unknown }).__testUser = { ...profesorUser }
    fromMock.mockImplementation(
      queueFrom({
        profesores: [{ data: { id: 7 }, error: null }],
        evaluaciones: [{ data: null, error: { message: 'db' } }],
      })
    )
    const res = await request(app).get('/api/teachers/teacher-stats/7')
    expect(res.status).toBe(500)
  })

  it('C4: OK → calcula promedio y totales', async () => {
    ;(globalThis as { __testUser?: unknown }).__testUser = { ...profesorUser }
    fromMock.mockImplementation(
      queueFrom({
        profesores: [{ data: { id: 7 }, error: null }],
        evaluaciones: [
          {
            data: [
              { id: 1, calificacion_promedio: 4, grupo_id: 10 },
              { id: 2, calificacion_promedio: 5, grupo_id: 10 },
            ],
            error: null,
          },
        ],
        grupos: [{ data: [{ id: 10, curso_id: 1 }], error: null }],
        asignaciones_profesor: [{ data: [{ curso_id: 1, grupo_id: 10 }], error: null }],
        cursos: [{ data: [{ id: 1, nombre: 'Cálculo', codigo: 'C1' }], error: null }],
      })
    )
    const res = await request(app).get('/api/teachers/teacher-stats/7')
    expect(res.status).toBe(200)
    expect(res.body.calificacionPromedio).toBe(4.5)
    expect(res.body.totalEvaluaciones).toBe(2)
  })
})
