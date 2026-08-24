/**
 * Integración RQ3–RQ5: el grafo completo de caminos vive en `src/test/unit/rqN-*.test.ts`.
 * Aquí solo se deja un smoke HTTP del camino feliz (contrato 200), sin datos de más.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { queueFrom } from '../helpers/query-builder'
import { fromMock, supabaseModuleMock } from '../helpers/supabase-mock'
import { profesorUser, coordinadorUser } from '../fixtures/users'

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
import { RoleService } from '../../modules/auth/role.service'

describe('RQ3 integration — smoke métricas OK', () => {
  beforeEach(() => {
    fromMock.mockReset()
    ;(globalThis as { __testUser?: unknown }).__testUser = { ...profesorUser }
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it('C4 HTTP: 200 con promedio calculado', async () => {
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
  })
})

describe('RQ4 integration — smoke histórico OK', () => {
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

describe('RQ5 integration — smoke resumen OK', () => {
  beforeEach(() => {
    fromMock.mockReset()
    ;(globalThis as { __testUser?: unknown }).__testUser = { ...coordinadorUser }
    vi.spyOn(RoleService, 'obtenerCoordinadorPorUsuario').mockResolvedValue({
      carrera_id: 1,
    } as never)
  })

  it('C7 HTTP: 200 con stats', async () => {
    fromMock.mockImplementation(
      queueFrom({
        cursos: [{ data: [{ id: 1 }], error: null }],
        profesores: [{ data: [{ id: 7, usuario_id: 'u1', activo: true }], error: null }],
        usuarios: [
          { data: [{ id: 'u1', nombre: 'Ana', apellido: 'Pérez', email: 'a@t.com' }], error: null },
        ],
        evaluaciones: [
          { data: [{ profesor_id: 7, calificacion_promedio: 4.2, completada: true }], error: null },
        ],
      })
    )
    const res = await request(app).get('/api/coordinador/dashboard-summary')
    expect(res.status).toBe(200)
    expect(res.body.stats.totalProfesores).toBe(1)
    expect(res.body.teachers).toHaveLength(1)
  })
})
