/**
 * DEF-08 — Las evaluaciones sin estudiante cuentan como un estudiante (RQ23)
 *
 * Severidad: Baja | Estado: ABIERTO
 *
 * `new Set(evaluaciones.map(e => e.estudiante_id))` mete `null` como un valor
 * más. Con dos evaluaciones anónimas, `totalEstudiantes` reporta 1 en lugar de 0.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { queueFrom } from '../helpers/query-builder'
import { fromMock, supabaseModuleMock } from '../helpers/supabase-mock'
import { setTestUser } from '../helpers/test-user'
import { profesorUser } from '../fixtures/users'

vi.mock('../../config/supabase-only', () => supabaseModuleMock)
vi.mock('../../config/supabaseClient', () => supabaseModuleMock)
vi.mock('../../middleware/auth', () => import('../helpers/auth-mock'))

import { app } from '../../app'

describe('DEF-08 — Solo deben contarse estudiantes reales', () => {
  beforeEach(() => {
    fromMock.mockReset()
    setTestUser({ ...profesorUser })
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('dos evaluaciones sin estudiante_id deben dar totalEstudiantes = 0', async () => {
    fromMock.mockImplementation(
      queueFrom({
        profesores: [
          { data: { id: 7 }, error: null },
          { data: { id: 7 }, error: null },
        ],
        evaluaciones: [
          {
            data: [
              { id: 1, calificacion_promedio: 4, fecha_creacion: '2026-03-01', grupo_id: 10, estudiante_id: null },
              { id: 2, calificacion_promedio: 5, fecha_creacion: '2026-03-02', grupo_id: 10, estudiante_id: null },
            ],
            error: null,
          },
        ],
        grupos: [{ data: [{ id: 10, curso_id: 1, numero_grupo: 1 }], error: null }],
        cursos: [{ data: [{ id: 1, nombre: 'C', codigo: 'C' }], error: null }],
      })
    )
    const res = await request(app).get('/api/teachers/7/stats/historical?period=2026-1')
    expect(res.body.totalEstudiantes).toBe(0)
  })
})
