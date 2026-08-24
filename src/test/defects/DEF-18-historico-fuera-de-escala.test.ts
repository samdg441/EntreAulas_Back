/**
 * DEF-18 — El promedio histórico no se acota a la escala 1–5 (RQ23)
 *
 * Severidad: Alta | Estado: ABIERTO
 *
 * Misma fórmula que DEF-17, otro endpoint: `stats/historical` suma
 * `calificacion_promedio || 0` sin validar rango.
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
    profesores: [
      { data: { id: 7 }, error: null },
      { data: { id: 7 }, error: null },
    ],
    evaluaciones: [{ data: evals, error: null }],
    grupos: [{ data: [{ id: 10, curso_id: 1, numero_grupo: 1 }], error: null }],
    cursos: [{ data: [{ id: 1, nombre: 'C', codigo: 'C' }], error: null }],
  })
}

const fila = (calificacion: number | null, id = 1) => ({
  id,
  calificacion_promedio: calificacion,
  fecha_creacion: '2026-03-01',
  grupo_id: 10,
  estudiante_id: id,
})

describe('DEF-18 — El promedio histórico debe quedar entre 1 y 5', () => {
  beforeEach(() => {
    fromMock.mockReset()
    ;(globalThis as { __testUser?: unknown }).__testUser = { ...profesorUser }
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('una calificación negativa no debe publicarse', async () => {
    fromMock.mockImplementation(escenario([fila(-2)]))
    const res = await request(app).get('/api/teachers/7/stats/historical?period=2026-1')
    expect(res.status).toBe(200)
    expect(res.body.calificacionPromedio).toBeGreaterThanOrEqual(0)
    expect(res.body.calificacionPromedio).toBeLessThanOrEqual(5)
    expect(res.body.calificacionPromedio).not.toBe(-2)
  })

  it('una calificación de 99 no debe publicarse', async () => {
    fromMock.mockImplementation(escenario([fila(99)]))
    const res = await request(app).get('/api/teachers/7/stats/historical?period=2026-1')
    expect(res.status).toBe(200)
    expect(res.body.calificacionPromedio).toBeLessThanOrEqual(5)
    expect(res.body.calificacionPromedio).not.toBe(99)
  })

  it('un null no debe bajar el promedio como si fuera 0', async () => {
    fromMock.mockImplementation(escenario([fila(5, 1), fila(null, 2)]))
    const res = await request(app).get('/api/teachers/7/stats/historical?period=2026-1')
    expect(res.status).toBe(200)
    expect(res.body.calificacionPromedio).toBe(5)
  })
})
