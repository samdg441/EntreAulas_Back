import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { queueFrom } from '../helpers/query-builder'
import { fromMock, supabaseModuleMock } from '../helpers/supabase-mock'
import { estudianteUser, profesorUser } from '../fixtures/users'

vi.mock('../../config/supabase-only', () => supabaseModuleMock)
vi.mock('../../config/supabaseClient', () => supabaseModuleMock)

import { app } from '../../app'
import { RoleService } from '../../modules/auth/role.service'

const findUserById = supabaseModuleMock.SupabaseDB.findUserById as ReturnType<typeof vi.fn>

function signToken(userId: string) {
  return jwt.sign({ userId }, process.env.JWT_SECRET as string)
}

function mockAuthenticatedUser(user: {
  id: string
  email: string
  tipo_usuario: string
  roles?: string[]
  activo?: boolean
}) {
  findUserById.mockResolvedValue({
    id: user.id,
    email: user.email,
    tipo_usuario: user.tipo_usuario,
    activo: user.activo ?? true,
  })
  vi.spyOn(RoleService, 'obtenerRolesUsuario').mockResolvedValue(user.roles ?? [user.tipo_usuario])
  vi.spyOn(RoleService, 'obtenerPermisosUsuario').mockResolvedValue([])
  return signToken(user.id)
}

const validBody = {
  teacherId: '7',
  courseId: '10',
  groupId: '3',
  answers: [{ questionId: 1, rating: 4, textAnswer: null }],
  overallRating: 4,
  comments: 'Buen curso',
}

/**
 * RQ13 Backend — POST /api/teachers/evaluations (grafo Back)
 * C1 1-2-3-4-5-18 → 401
 * C2 1-2-3-4-6-7-8-18 → 400
 * C3 1-2-3-4-6-7-9-10-18 → 403
 * C4 1-2-3-4-6-7-9-11-12-13-18 → 404
 * C5 1-2-3-4-6-7-9-11-12-14-15-18 → 409
 * C6 1-2-3-4-6-7-9-11-12-14-16-17-18 → 200
 */
describe('RQ13 unit — Enviar evaluación docente', () => {
  beforeEach(() => {
    fromMock.mockReset()
    findUserById.mockReset()
    vi.restoreAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  describe('caminos que fallan', () => {
    it('C1 (1-2-3-4-5-18): sin JWT o usuario inactivo → 401', async () => {
      const sinToken = await request(app).post('/api/teachers/evaluations').send(validBody)
      expect(sinToken.status).toBe(401)
      expect(sinToken.body).toEqual({ error: 'Token de acceso requerido', code: 'NO_TOKEN' })
      expect(fromMock).not.toHaveBeenCalled()

      const tokenInactivo = mockAuthenticatedUser({ ...estudianteUser, activo: false })
      const inactivo = await request(app)
        .post('/api/teachers/evaluations')
        .set('Authorization', `Bearer ${tokenInactivo}`)
        .send(validBody)

      expect(inactivo.status).toBe(401)
      expect(inactivo.body).toEqual({ error: 'Usuario no válido o inactivo', code: 'USER_INVALID' })
      expect(fromMock).not.toHaveBeenCalled()
    })

    it('C2 (1-2-3-4-6-7-8-18): JWT válido pero body inválido (Zod) → 400', async () => {
      const token = mockAuthenticatedUser(estudianteUser)
      const res = await request(app)
        .post('/api/teachers/evaluations')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...validBody, answers: [], overallRating: 9 })

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('Datos de evaluación inválidos')
      expect(fromMock).not.toHaveBeenCalled()
    })

    it('C3 (1-2-3-4-6-7-9-10-18): autenticado pero no es estudiante → 403', async () => {
      const token = mockAuthenticatedUser(profesorUser)
      const res = await request(app)
        .post('/api/teachers/evaluations')
        .set('Authorization', `Bearer ${token}`)
        .send(validBody)

      expect(res.status).toBe(403)
      expect(res.body).toEqual({ error: 'Solo los estudiantes pueden realizar evaluaciones' })
      expect(fromMock).not.toHaveBeenCalled()
    })

    it('C4 (1-2-3-4-6-7-9-11-12-13-18): estudiante sin perfil → 404', async () => {
      const token = mockAuthenticatedUser(estudianteUser)
      fromMock.mockImplementation(
        queueFrom({
          estudiantes: [{ data: null, error: { message: 'PGRST116' } }],
        })
      )

      const res = await request(app)
        .post('/api/teachers/evaluations')
        .set('Authorization', `Bearer ${token}`)
        .send(validBody)

      expect(res.status).toBe(404)
      expect(res.body.error).toBe('Error al buscar el estudiante')
    })

    it('C5 (1-2-3-4-6-7-9-11-12-14-15-18): ya evaluó al mismo profesor/grupo → 409', async () => {
      const token = mockAuthenticatedUser(estudianteUser)
      fromMock.mockImplementation(
        queueFrom({
          estudiantes: [{ data: { id: 'est-1' }, error: null }],
          evaluaciones: [{ data: { id: 11 }, error: null }],
        })
      )

      const res = await request(app)
        .post('/api/teachers/evaluations')
        .set('Authorization', `Bearer ${token}`)
        .send(validBody)

      expect(res.status).toBe(409)
      expect(res.body).toEqual({
        error: 'Ya has evaluado a este profesor para este curso y grupo',
      })
    })
  })

  describe('caminos que funcionan', () => {
    it('C6 (1-2-3-4-6-7-9-11-12-14-16-17-18): primera evaluación → 200 + evaluationId', async () => {
      const token = mockAuthenticatedUser(estudianteUser)
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

      const res = await request(app)
        .post('/api/teachers/evaluations')
        .set('Authorization', `Bearer ${token}`)
        .send(validBody)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({
        success: true,
        message: 'Evaluación guardada exitosamente',
        evaluationId: 42,
      })
    })
  })
})
