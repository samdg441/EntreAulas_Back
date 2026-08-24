/**
 * DEF-07 — El mismo profesor tiene dos promedios distintos según el dashboard (RQ22 vs RQ24)
 *
 * Severidad: Alta | Estado: ABIERTO
 *
 * Una evaluación con `calificacion_promedio = null` se trata distinto en cada
 * endpoint: métricas del profesor la suma como 0, resumen del coordinador la
 * descarta. Con los mismos datos, el profesor ve 2.5 y su coordinador ve 5.
 *
 * Prueba escrita contra el comportamiento correcto esperado: ambos deben coincidir.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { queueFrom } from '../helpers/query-builder'
import { fromMock, supabaseModuleMock } from '../helpers/supabase-mock'
import { setTestUser } from '../helpers/test-user'
import { profesorUser, coordinadorUser } from '../fixtures/users'

vi.mock('../../config/supabase-only', () => supabaseModuleMock)
vi.mock('../../config/supabaseClient', () => supabaseModuleMock)
vi.mock('../../middleware/auth', () => import('../helpers/auth-mock'))

import { app } from '../../app'
import { RoleService } from '../../modules/auth/role.service'

/** Dos evaluaciones del profesor 7: una calificada con 5 y otra sin calificar. */
describe('DEF-07 — Promedio consistente entre dashboards', () => {
  beforeEach(() => {
    fromMock.mockReset()
    vi.restoreAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('el promedio del profesor y el que ve el coordinador deben ser iguales', async () => {
    setTestUser({ ...profesorUser })
    fromMock.mockImplementation(
      queueFrom({
        profesores: [{ data: { id: 7 }, error: null }],
        evaluaciones: [
          {
            data: [
              { id: 1, calificacion_promedio: 5, grupo_id: 10 },
              { id: 2, calificacion_promedio: null, grupo_id: 10 },
            ],
            error: null,
          },
        ],
        grupos: [{ data: [{ id: 10, curso_id: 1 }], error: null }],
        asignaciones_profesor: [{ data: [{ curso_id: 1, grupo_id: 10 }], error: null }],
        cursos: [{ data: [{ id: 1, nombre: 'C', codigo: 'C' }], error: null }],
      })
    )
    const vistaProfesor = await request(app).get('/api/teachers/teacher-stats/7')

    fromMock.mockReset()
    setTestUser({ ...coordinadorUser })
    vi.spyOn(RoleService, 'obtenerCoordinadorPorUsuario').mockResolvedValue({
      carrera_id: 1,
    } as never)
    fromMock.mockImplementation(
      queueFrom({
        cursos: [{ data: [{ id: 1 }], error: null }],
        profesores: [{ data: [{ id: 7, usuario_id: 'u1', activo: true }], error: null }],
        usuarios: [
          { data: [{ id: 'u1', nombre: 'A', apellido: 'B', email: 'a@t.com' }], error: null },
        ],
        evaluaciones: [
          {
            data: [
              { profesor_id: 7, calificacion_promedio: 5, completada: true },
              { profesor_id: 7, calificacion_promedio: null, completada: true },
            ],
            error: null,
          },
        ],
      })
    )
    const vistaCoordinador = await request(app).get('/api/coordinador/dashboard-summary')

    expect(vistaProfesor.body.calificacionPromedio).toBe(
      vistaCoordinador.body.stats.promedioEvaluaciones
    )
  })
})
