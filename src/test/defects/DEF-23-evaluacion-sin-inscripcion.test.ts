/**
 * DEF-23 — Se puede evaluar un grupo en el que el estudiante no está inscrito (RQ13)
 *
 * Severidad: Alta | Estado: ABIERTO
 *
 * POST /teachers/evaluations comprueba que el usuario sea estudiante y que no
 * exista duplicado, pero no consulta `inscripciones` ni la asignación del
 * profesor al grupo. Cualquier estudiante autenticado evalúa cualquier
 * profesor/curso/grupo.
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

const validBody = {
  teacherId: '7',
  courseId: '10',
  groupId: '3',
  answers: [{ questionId: 1, rating: 4, textAnswer: null }],
  overallRating: 4,
  comments: 'Buen curso',
}

describe('DEF-23 — Evaluar exige inscripción activa en el grupo', () => {
  beforeEach(() => {
    fromMock.mockReset()
    setTestUser(estudianteUser)
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('sin inscripción en el grupo debe responder 403 y no insertar', async () => {
    fromMock.mockImplementation(
      queueFrom({
        estudiantes: [{ data: { id: 'est-1' }, error: null }],
        inscripciones: [{ data: [], error: null }],
        evaluaciones: [
          { data: null, error: null },
          { data: { id: 42 }, error: null },
        ],
        respuestas_evaluacion: [{ data: null, error: null }],
      })
    )

    const res = await request(app).post('/api/teachers/evaluations').send(validBody)

    expect(res.status).toBe(403)
    expect(res.body.evaluationId).toBeUndefined()
  })
})
