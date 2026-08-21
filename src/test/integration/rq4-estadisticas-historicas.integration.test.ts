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

describe('RQ4 integración — Consultar estadísticas históricas', () => {
  beforeEach(() => {
    fromMock.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
    ;(globalThis as { __testUser?: unknown }).__testUser = { ...profesorUser }
  })

  it('Camino 1: profesor no encontrado → mock para UI sin datos reales', async () => {
    fromMock.mockImplementation(
      queueFrom({
        profesores: [
          { data: null, error: { message: 'not found' } },
          { data: null, error: { message: 'not found' } },
        ],
      })
    )

    const res = await request(app).get('/api/teachers/0/stats/historical?period=2025-2')

    expect(res.status).toBe(200)
    expect(res.body.isMockData).toBe(true)
    expect(res.body.totalEvaluaciones).toBe(0)
  })

  it('Camino 2: histórico válido del período → JSON 200 para tendencia/stats', async () => {
    fromMock.mockImplementation(
      queueFrom({
        profesores: [
          { data: { id: 4, activo: true, usuario_id: 'u4' }, error: null },
          { data: { id: 4 }, error: null },
        ],
        evaluaciones: [
          {
            data: [
              {
                id: 9,
                calificacion_promedio: 3.8,
                fecha_creacion: '2025-08-01',
                grupo_id: 2,
                estudiante_id: 'e9',
              },
            ],
            error: null,
          },
        ],
        grupos: [{ data: [{ id: 2, curso_id: 1, numero_grupo: 1 }], error: null }],
        cursos: [{ data: [{ id: 1, nombre: 'Redes', codigo: 'TEL201' }], error: null }],
      })
    )

    const res = await request(app).get('/api/teachers/4/stats/historical?period=2025-2')

    expect(res.status).toBe(200)
    expect(res.body.period).toBe('2025-2')
    expect(res.body.calificacionPromedio).toBe(3.8)
    expect(res.body.totalEvaluaciones).toBe(1)
  })
})
