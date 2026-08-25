/**
 * Integración RQ13: el grafo completo vive en `src/test/unit/rq13-*.test.ts`.
 * Aquí el contrato HTTP del fallo de auth (C1) y del camino feliz (C6).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { queueFrom } from '../helpers/query-builder'
import { fromMock, supabaseModuleMock } from '../helpers/supabase-mock'
import { estudianteUser } from '../fixtures/users'

vi.mock('../../config/supabase-only', () => supabaseModuleMock)
vi.mock('../../config/supabaseClient', () => supabaseModuleMock)

import { app } from '../../app'
import { RoleService } from '../../modules/auth/role.service'

const findUserById = supabaseModuleMock.SupabaseDB.findUserById as ReturnType<typeof vi.fn>

const validBody = {
  teacherId: '7',
  courseId: '10',
  groupId: '3',
  answers: [{ questionId: 1, rating: 4, textAnswer: null }],
  overallRating: 4,
}

describe('RQ13 integration — smoke enviar evaluación', () => {
  beforeEach(() => {
    fromMock.mockReset()
    findUserById.mockReset()
    vi.restoreAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('C1 HTTP: sin token → 401', async () => {
    const res = await request(app).post('/api/teachers/evaluations').send(validBody)
    expect(res.status).toBe(401)
    expect(res.body.code).toBe('NO_TOKEN')
  })

  it('C6 HTTP: 200 con evaluationId', async () => {
    findUserById.mockResolvedValue({
      id: estudianteUser.id,
      email: estudianteUser.email,
      tipo_usuario: estudianteUser.tipo_usuario,
      activo: true,
    })
    vi.spyOn(RoleService, 'obtenerRolesUsuario').mockResolvedValue(['estudiante'])
    vi.spyOn(RoleService, 'obtenerPermisosUsuario').mockResolvedValue([])

    fromMock.mockImplementation(
      queueFrom({
        estudiantes: [{ data: { id: 'est-1' }, error: null }],
        evaluaciones: [
          { data: null, error: null },
          { data: { id: 42 }, error: null },
        ],
        respuestas_evaluacion: [{ data: null, error: null }],
      })
    )

    const token = jwt.sign({ userId: estudianteUser.id }, process.env.JWT_SECRET as string)
    const res = await request(app)
      .post('/api/teachers/evaluations')
      .set('Authorization', `Bearer ${token}`)
      .send(validBody)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.evaluationId).toBe(42)
  })
})
