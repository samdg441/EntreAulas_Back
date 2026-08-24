/**
 * Integración RQ24: el grafo completo de caminos vive en `src/test/unit/rq24-*.test.ts`.
 * Aquí solo se deja un smoke HTTP del camino feliz (contrato 200), sin datos de más.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { queueFrom } from '../helpers/query-builder'
import { fromMock, supabaseModuleMock } from '../helpers/supabase-mock'
import { coordinadorUser } from '../fixtures/users'

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

describe('RQ24 integration — smoke resumen OK', () => {
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
