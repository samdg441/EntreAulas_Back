import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { queueFrom, profesorUser, estudianteUser } from '../helpers/query-builder'

const fromMock = vi.fn()

vi.mock('../../config/supabase-only', () => ({
  SupabaseDB: {
    supabaseAdmin: { from: (...args: unknown[]) => fromMock(...args) },
    findUserById: vi.fn(),
    findUserByEmail: vi.fn(),
  },
  supabaseAdmin: { from: (...args: unknown[]) => fromMock(...args) },
  default: {},
}))

vi.mock('../../config/supabaseClient', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => fromMock(...args) },
  SupabaseDB: {
    supabaseAdmin: { from: (...args: unknown[]) => fromMock(...args) },
  },
  default: {},
}))

vi.mock('../../middleware/auth', () => ({
  authenticateToken: (req: { user?: unknown }, _res: unknown, next: () => void) => {
    req.user = (globalThis as { __testUser?: unknown }).__testUser
    next()
  },
  requireRole: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  requireAuth: (req: { user?: unknown }, _res: unknown, next: () => void) => {
    req.user = (globalThis as { __testUser?: unknown }).__testUser
    next()
  },
}))

import { app } from '../../app'

describe('RQ3 unitarias — Calcular métricas de evaluación (backend)', () => {
  beforeEach(() => {
    fromMock.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
    ;(globalThis as { __testUser?: unknown }).__testUser = { ...profesorUser }
  })

  it('Camino 1 (1-2-3-14): usuario no es profesor → 403', async () => {
    ;(globalThis as { __testUser?: unknown }).__testUser = { ...estudianteUser }

    const res = await request(app).get('/api/teachers/teacher-stats/1')

    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/Solo los profesores/)
  })

  it('Camino 2 (1-2-4-5-6-14): profesor no existe → 404', async () => {
    fromMock.mockImplementation(
      queueFrom({
        profesores: [{ data: null, error: { message: 'not found' } }],
      })
    )

    const res = await request(app).get('/api/teachers/teacher-stats/999')

    expect(res.status).toBe(404)
    expect(res.body.error).toBe('Profesor no encontrado')
  })

  it('Camino 3 (1-2-4-5-7-8-9-14): falla consulta de evaluaciones → 500', async () => {
    fromMock.mockImplementation(
      queueFrom({
        profesores: [{ data: { id: 7 }, error: null }],
        evaluaciones: [{ data: null, error: { message: 'query fail' } }],
      })
    )

    const res = await request(app).get('/api/teachers/teacher-stats/7')

    expect(res.status).toBe(500)
    expect(res.body.error).toBe('Error obteniendo evaluaciones completadas')
  })

  it('Camino 4 (1-2-4-5-7-8-10-11-12-13-14): datos OK calcula promedio y totales', async () => {
    fromMock.mockImplementation(
      queueFrom({
        profesores: [{ data: { id: 7 }, error: null }],
        evaluaciones: [
          {
            data: [
              { id: 1, calificacion_promedio: 4, grupo_id: 100 },
              { id: 2, calificacion_promedio: 5, grupo_id: 100 },
            ],
            error: null,
          },
        ],
        grupos: [{ data: [{ id: 100, curso_id: 50 }], error: null }],
        asignaciones_profesor: [
          { data: [{ curso_id: 50, grupo_id: 100 }], error: null },
        ],
        cursos: [
          { data: [{ id: 50, nombre: 'Cálculo', codigo: 'MAT101' }], error: null },
        ],
      })
    )

    const res = await request(app).get('/api/teachers/teacher-stats/7')

    expect(res.status).toBe(200)
    expect(res.body.calificacionPromedio).toBe(4.5)
    expect(res.body.totalEvaluaciones).toBe(2)
    expect(res.body.evaluacionesPorCurso).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ curso_id: 50, promedio: 4.5, total: 2 }),
      ])
    )
  })
})
