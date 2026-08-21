import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { queueFrom, profesorUser } from '../helpers/query-builder'

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

describe('RQ4 unitarias — Consultar estadísticas históricas (backend)', () => {
  beforeEach(() => {
    fromMock.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
    ;(globalThis as { __testUser?: unknown }).__testUser = { ...profesorUser }
  })

  it('Camino 1 (1-2-3-4-5-12): profesor no existe → 200 mock isMockData', async () => {
    fromMock.mockImplementation(
      queueFrom({
        profesores: [
          { data: null, error: { message: 'not found' } },
          { data: null, error: { message: 'not found' } },
        ],
      })
    )

    const res = await request(app).get('/api/teachers/999/stats/historical?period=2026-1')

    expect(res.status).toBe(200)
    expect(res.body.isMockData).toBe(true)
    expect(res.body.totalEvaluaciones).toBe(0)
    expect(res.body.calificacionPromedio).toBe(0)
  })

  it('Camino 2 (1-2-3-4-6-7-8-9-12): falla consulta de evaluaciones → 500', async () => {
    fromMock.mockImplementation(
      queueFrom({
        profesores: [
          { data: { id: 7, activo: true, usuario_id: 'u1' }, error: null },
          { data: { id: 7 }, error: null },
        ],
        evaluaciones: [{ data: null, error: { message: 'hist fail' } }],
      })
    )

    const res = await request(app).get('/api/teachers/7/stats/historical?period=2026-1')

    expect(res.status).toBe(500)
    expect(res.body.error).toBe('Error consultando evaluaciones históricas')
  })

  it('Camino 3 (1-2-3-4-6-7-8-10-11-12): consulta histórica OK → 200 con stats del período', async () => {
    fromMock.mockImplementation(
      queueFrom({
        profesores: [
          { data: { id: 7, activo: true, usuario_id: 'u1' }, error: null },
          { data: { id: 7 }, error: null },
        ],
        evaluaciones: [
          {
            data: [
              {
                id: 1,
                calificacion_promedio: 4,
                fecha_creacion: '2026-02-01',
                grupo_id: 100,
                estudiante_id: 'e1',
              },
              {
                id: 2,
                calificacion_promedio: 5,
                fecha_creacion: '2026-03-01',
                grupo_id: 100,
                estudiante_id: 'e2',
              },
            ],
            error: null,
          },
        ],
        grupos: [{ data: [{ id: 100, curso_id: 50, numero_grupo: 1 }], error: null }],
        cursos: [{ data: [{ id: 50, nombre: 'Cálculo', codigo: 'MAT101' }], error: null }],
      })
    )

    const res = await request(app).get('/api/teachers/7/stats/historical?period=2026-1')

    expect(res.status).toBe(200)
    expect(res.body.period).toBe('2026-1')
    expect(res.body.totalEvaluaciones).toBe(2)
    expect(res.body.calificacionPromedio).toBe(4.5)
    expect(res.body.totalEstudiantes).toBe(2)
    expect(res.body.isMockData).toBeUndefined()
  })
})
