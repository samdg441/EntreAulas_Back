/**
 * DEF-17 — El promedio de métricas no se acota a la escala 1–5 (RQ22)
 *
 * Severidad: Alta | Estado: ABIERTO
 *
 * `teacher-stats` suma `calificacion_promedio || 0` y no valida el rango.
 * El POST de evaluaciones sí declara `z.number().min(1).max(5)`, así que
 * la escala existe en el producto; este GET no la aplica.
 *
 * Un -3 y un 99 salen como promedio. Un null se cuenta como 0 (ver DEF-07).
 */
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

function escenario(evals: unknown[]) {
  return queueFrom({
    profesores: [{ data: { id: 7 }, error: null }],
    evaluaciones: [{ data: evals, error: null }],
    grupos: [{ data: [{ id: 10, curso_id: 1 }], error: null }],
    asignaciones_profesor: [{ data: [{ curso_id: 1, grupo_id: 10 }], error: null }],
    cursos: [{ data: [{ id: 1, nombre: 'C', codigo: 'C' }], error: null }],
  })
}

describe('DEF-17 — El promedio debe quedar entre 1 y 5', () => {
  beforeEach(() => {
    fromMock.mockReset()
    ;(globalThis as { __testUser?: unknown }).__testUser = { ...profesorUser }
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('una calificación negativa no debe publicarse como promedio', async () => {
    fromMock.mockImplementation(
      escenario([{ id: 1, calificacion_promedio: -3, grupo_id: 10 }])
    )
    const res = await request(app).get('/api/teachers/teacher-stats/7')
    expect(res.status).toBe(200)
    expect(res.body.calificacionPromedio).toBeGreaterThanOrEqual(0)
    expect(res.body.calificacionPromedio).toBeLessThanOrEqual(5)
    expect(res.body.calificacionPromedio).not.toBe(-3)
  })

  it('una calificación de 99 no debe publicarse como promedio', async () => {
    fromMock.mockImplementation(
      escenario([{ id: 1, calificacion_promedio: 99, grupo_id: 10 }])
    )
    const res = await request(app).get('/api/teachers/teacher-stats/7')
    expect(res.status).toBe(200)
    expect(res.body.calificacionPromedio).toBeLessThanOrEqual(5)
    expect(res.body.calificacionPromedio).not.toBe(99)
  })

  it('un null no debe bajar el promedio como si fuera 0', async () => {
    fromMock.mockImplementation(
      escenario([
        { id: 1, calificacion_promedio: 5, grupo_id: 10 },
        { id: 2, calificacion_promedio: null, grupo_id: 10 },
      ])
    )
    const res = await request(app).get('/api/teachers/teacher-stats/7')
    expect(res.status).toBe(200)
    expect(res.body.calificacionPromedio).toBe(5)
  })
})
