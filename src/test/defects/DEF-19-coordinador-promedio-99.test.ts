/**
 * DEF-19 — El resumen del coordinador publica un promedio de 99 (RQ24)
 *
 * Severidad: Media | Estado: ABIERTO
 *
 * A diferencia de RQ22, este endpoint sí descarta `null`, `0` y negativos
 * (`cal <= 0`). Un 99 pasa el filtro y sale como promedio de la carrera.
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

describe('DEF-19 — El promedio de la carrera debe quedar entre 1 y 5', () => {
  beforeEach(() => {
    fromMock.mockReset()
    vi.restoreAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    ;(globalThis as { __testUser?: unknown }).__testUser = { ...coordinadorUser }
    vi.spyOn(RoleService, 'obtenerCoordinadorPorUsuario').mockResolvedValue({
      carrera_id: 1,
    } as never)
  })

  it('una calificación 99 no debe publicarse como promedio de la carrera', async () => {
    fromMock.mockImplementation(
      queueFrom({
        cursos: [{ data: [{ id: 1 }], error: null }],
        profesores: [{ data: [{ id: 7, usuario_id: 'u1', activo: true }], error: null }],
        usuarios: [{ data: [{ id: 'u1', nombre: 'A', apellido: 'B', email: 'a@t.com' }], error: null }],
        evaluaciones: [
          { data: [{ profesor_id: 7, calificacion_promedio: 99, completada: true }], error: null },
        ],
      })
    )
    const res = await request(app).get('/api/coordinador/dashboard-summary')
    expect(res.status).toBe(200)
    expect(res.body.stats.promedioEvaluaciones).toBeLessThanOrEqual(5)
    expect(res.body.stats.promedioEvaluaciones).not.toBe(99)
    expect(res.body.teachers[0].promedio).not.toBe(99)
  })
})
