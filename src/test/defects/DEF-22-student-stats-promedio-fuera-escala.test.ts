/**
 * DEF-22 — El promedio de student-stats no se acota a la escala 1–5 (RQ11)
 *
 * Severidad: Alta | Estado: ABIERTO
 *
 * Mismo cálculo que DEF-17: `sum + (calificacion_promedio || 0)` sin filtrar
 * rango ni nulos. Un 99 o un -3 se publican en el dashboard del estudiante.
 *
 * Esta prueba expresa el comportamiento CORRECTO esperado y falla a propósito.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { queueFrom } from '../helpers/query-builder'
import { fromMock, supabaseModuleMock } from '../helpers/supabase-mock'
import { setTestUser } from '../helpers/test-user'
import { estudianteUser } from '../fixtures/users'

vi.mock('../../config/supabase-only', () => supabaseModuleMock)
vi.mock('../../config/supabaseClient', () => supabaseModuleMock)
vi.mock('../../middleware/auth', () => import('../helpers/auth-mock'))

import { app } from '../../app'

function escenario(evals: unknown[]) {
  return queueFrom({
    estudiantes: [{ data: { id: 'est-1' }, error: null }],
    evaluaciones: [{ data: evals, error: null }],
    inscripciones: [{ data: [{ id: 'i1' }], error: null }],
  })
}

describe('DEF-22 — El promedio del estudiante debe quedar entre 1 y 5', () => {
  beforeEach(() => {
    fromMock.mockReset()
    setTestUser(estudianteUser)
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('una calificación de 99 no debe publicarse como promedioGeneral', async () => {
    fromMock.mockImplementation(escenario([{ id: 1, calificacion_promedio: 99 }]))
    const res = await request(app).get('/api/teachers/student-stats')
    expect(res.status).toBe(200)
    expect(res.body.promedioGeneral).toBeLessThanOrEqual(5)
    expect(res.body.promedioGeneral).not.toBe(99)
  })

  it('una calificación negativa no debe publicarse como promedioGeneral', async () => {
    fromMock.mockImplementation(escenario([{ id: 1, calificacion_promedio: -3 }]))
    const res = await request(app).get('/api/teachers/student-stats')
    expect(res.status).toBe(200)
    expect(res.body.promedioGeneral).toBeGreaterThanOrEqual(0)
    expect(res.body.promedioGeneral).not.toBe(-3)
  })

  it('un null no debe bajar el promedio como si fuera 0', async () => {
    fromMock.mockImplementation(
      escenario([
        { id: 1, calificacion_promedio: 5 },
        { id: 2, calificacion_promedio: null },
      ])
    )
    const res = await request(app).get('/api/teachers/student-stats')
    expect(res.status).toBe(200)
    expect(res.body.promedioGeneral).toBe(5)
  })
})
