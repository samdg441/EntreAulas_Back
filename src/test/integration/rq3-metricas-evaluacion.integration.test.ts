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

describe('RQ3 integración — Calcular métricas de evaluación', () => {
  beforeEach(() => {
    fromMock.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
    ;(globalThis as { __testUser?: unknown }).__testUser = { ...profesorUser }
  })

  it('Camino 1: no autorizado → 403 sin métricas', async () => {
    ;(globalThis as { __testUser?: unknown }).__testUser = { ...estudianteUser }

    const res = await request(app).get('/api/teachers/teacher-stats/7')

    expect(res.status).toBe(403)
    expect(res.body.calificacionPromedio).toBeUndefined()
  })

  it('Camino 2: falla lectura BD → 404/500 sin métricas', async () => {
    fromMock.mockImplementation(
      queueFrom({
        profesores: [{ data: null, error: { message: 'missing' } }],
      })
    )

    const res = await request(app).get('/api/teachers/teacher-stats/7')

    expect([404, 500]).toContain(res.status)
    expect(res.body.calificacionPromedio).toBeUndefined()
  })

  it('Camino 3: flujo feliz — back calcula y responde promedio/totales', async () => {
    fromMock.mockImplementation(
      queueFrom({
        profesores: [{ data: { id: 7 }, error: null }],
        evaluaciones: [
          {
            data: [{ id: 1, calificacion_promedio: 4.2, grupo_id: 8 }],
            error: null,
          },
        ],
        grupos: [{ data: [{ id: 8, curso_id: 3 }], error: null }],
        asignaciones_profesor: [{ data: [{ curso_id: 3, grupo_id: 8 }], error: null }],
        cursos: [{ data: [{ id: 3, nombre: 'Física', codigo: 'FIS101' }], error: null }],
      })
    )

    const res = await request(app).get('/api/teachers/teacher-stats/7')

    expect(res.status).toBe(200)
    expect(res.body.calificacionPromedio).toBe(4.2)
    expect(res.body.totalEvaluaciones).toBe(1)
  })
})
