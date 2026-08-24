/**
 * Integración RQ23: el grafo completo de caminos vive en `src/test/unit/rq23-*.test.ts`.
 * Aquí solo se deja un smoke HTTP del camino feliz (contrato 200), sin datos de más.
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

describe('RQ23 integration — smoke histórico OK', () => {
  beforeEach(() => {
    fromMock.mockReset()
    ;(globalThis as { __testUser?: unknown }).__testUser = { ...profesorUser }
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it('C3 HTTP: 200 con stats del período', async () => {
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
    expect(res.body.totalEvaluaciones).toBe(1)
    expect(res.body.calificacionPromedio).toBe(4)
  })
})
