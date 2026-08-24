/**
 * DEF-02 — Un profesor accede a las estadísticas de otro profesor (RQ22)
 *
 * Severidad: Alta (control de acceso roto, tipo IDOR) | Estado: ABIERTO
 *
 * `GET /teachers/teacher-stats/:teacherId` valida que el usuario SEA profesor,
 * pero no que el :teacherId le pertenezca. Esta prueba expresa el
 * comportamiento CORRECTO esperado y falla a propósito.
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

/** Profesor autenticado = id 7. Se piden las estadísticas del profesor 999. */
describe('DEF-02 — Un profesor no debe leer estadísticas de otro profesor', () => {
  beforeEach(() => {
    fromMock.mockReset()
    ;(globalThis as { __testUser?: unknown }).__testUser = { ...profesorUser }
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('pedir /teacher-stats/999 siendo otro profesor debe dar 403', async () => {
    fromMock.mockImplementation(
      queueFrom({
        profesores: [{ data: { id: 999, usuario_id: 'otro-usuario' }, error: null }],
        evaluaciones: [
          { data: [{ id: 1, calificacion_promedio: 5, grupo_id: 1 }], error: null },
        ],
        grupos: [{ data: [{ id: 1, curso_id: 1 }], error: null }],
        asignaciones_profesor: [{ data: [], error: null }],
        cursos: [{ data: [{ id: 1, nombre: 'X', codigo: 'X' }], error: null }],
      })
    )

    const res = await request(app).get('/api/teachers/teacher-stats/999')

    expect(res.status).toBe(403)
  })
})
