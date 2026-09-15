import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { createQueryBuilder, queueFrom } from '../helpers/query-builder'
import { fromMock, supabaseModuleMock } from '../helpers/supabase-mock'
import { estudianteUser, profesorUser } from '../fixtures/users'

vi.mock('../../config/supabase-only', () => supabaseModuleMock)
vi.mock('../../config/supabaseClient', () => supabaseModuleMock)

import { app } from '../../app'
import { RoleService } from '../../modules/auth/role.service'
import { teachersAnalyticsService } from '../../modules/analytics/teachers-analytics.service'

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

const zeros = {
  evaluacionesCompletadas: 0,
  evaluacionesPendientes: 0,
  materiasMatriculadas: 0,
  promedioGeneral: 0,
  progresoGeneral: 0,
}

/**
 * RQ11 Backend — GET /api/teachers/student-stats (grafo Back)
 * C1 1-2-3-4-5-16 → 401
 * C2 1-2-3-4-6-7-16 → 403
 * C3 1-2-3-4-6-8-9-10-16 → 200 ceros
 * C4 1-2-3-4-6-8-9-11-12-13-14-16 → 500
 * C5 1-2-3-4-6-8-9-11-12-13-15-16 → 200 stats
 */
describe('RQ11 unit — Evaluaciones del estudiante (student-stats)', () => {
  beforeEach(() => {
    fromMock.mockReset()
    findUserById.mockReset()
    vi.restoreAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  describe('caminos que fallan', () => {
    it('C1 (1-2-3-4-5-16): sin JWT o usuario inactivo → 401', async () => {
      const sinToken = await request(app).get('/api/teachers/student-stats')
      expect(sinToken.status).toBe(401)
      expect(sinToken.body).toEqual({ error: 'Token de acceso requerido', code: 'NO_TOKEN' })
      expect(fromMock).not.toHaveBeenCalled()

      const tokenInactivo = mockAuthenticatedUser({ ...estudianteUser, activo: false })
      const inactivo = await request(app)
        .get('/api/teachers/student-stats')
        .set('Authorization', `Bearer ${tokenInactivo}`)

      expect(inactivo.status).toBe(401)
      expect(inactivo.body).toEqual({ error: 'Usuario no válido o inactivo', code: 'USER_INVALID' })
      expect(fromMock).not.toHaveBeenCalled()
    })

    it('C2 (1-2-3-4-6-7-16): JWT válido pero no es estudiante → 403', async () => {
      const token = mockAuthenticatedUser(profesorUser)
      const res = await request(app)
        .get('/api/teachers/student-stats')
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(403)
      expect(res.body).toEqual({
        error: 'Solo los estudiantes pueden acceder a estas estadísticas',
      })
      expect(fromMock).not.toHaveBeenCalled()
    })

    it('C4 (1-2-3-4-6-8-9-11-12-13-14-16): perfil existe y la consulta lanza → 500', async () => {
      const token = mockAuthenticatedUser(estudianteUser)
      fromMock.mockImplementation(() => {
        throw new Error('fallo de consulta')
      })

      const res = await request(app)
        .get('/api/teachers/student-stats')
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(500)
      expect(res.body.error).toBe('Error interno del servidor')
    })
  })

  describe('caminos que funcionan', () => {
    it('C3 (1-2-3-4-6-8-9-10-16): estudiante sin perfil → 200 JSON con ceros', async () => {
      const token = mockAuthenticatedUser(estudianteUser)
      fromMock.mockImplementation(
        queueFrom({
          estudiantes: [{ data: null, error: { code: 'PGRST116', message: 'not found' } }],
        })
      )

      const res = await request(app)
        .get('/api/teachers/student-stats')
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body).toEqual(zeros)
    })

    it('C5 (1-2-3-4-6-8-9-11-12-13-15-16): cuenta inscripciones y completadas → 200', async () => {
      const token = mockAuthenticatedUser(estudianteUser)
      fromMock.mockImplementation(
        queueFrom({
          estudiantes: [{ data: { id: 'est-1' }, error: null }],
          evaluaciones: [
            {
              data: [
                { id: 1, calificacion_promedio: 4 },
                { id: 2, calificacion_promedio: 5 },
              ],
              error: null,
            },
          ],
          inscripciones: [
            {
              data: [{ id: 'i1' }, { id: 'i2' }, { id: 'i3' }],
              error: null,
            },
          ],
        })
      )

      const res = await request(app)
        .get('/api/teachers/student-stats')
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({
        evaluacionesCompletadas: 2,
        evaluacionesPendientes: 1,
        materiasMatriculadas: 3,
        promedioGeneral: 4.5,
        progresoGeneral: 67,
      })
    })
  })
})

describe('RQ11 unit — teachers-analytics.routes', () => {
  beforeEach(() => {
    findUserById.mockReset()
    vi.restoreAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('stats, historical, course-rating, career-results, teacher y period', async () => {
    vi.spyOn(teachersAnalyticsService, 'getStats').mockResolvedValue({ ok: 'stats' } as never)
    vi.spyOn(teachersAnalyticsService, 'getHistorical').mockResolvedValue({ ok: 'hist' } as never)
    vi.spyOn(teachersAnalyticsService, 'getCourseRating').mockResolvedValue({ ok: 'rating' } as never)
    vi.spyOn(teachersAnalyticsService, 'getCareerResultsAll').mockResolvedValue({ ok: 'all' } as never)
    vi.spyOn(teachersAnalyticsService, 'getCareerResultsByCareer').mockResolvedValue({
      ok: 'career',
    } as never)
    vi.spyOn(teachersAnalyticsService, 'getTeacherStats').mockResolvedValue({ ok: 'teacher' } as never)
    vi.spyOn(teachersAnalyticsService, 'getPeriodStats').mockResolvedValue({ ok: 'period' } as never)
    vi.spyOn(teachersAnalyticsService, 'getPeriodCategoryStats').mockResolvedValue({
      ok: 'cat',
    } as never)

    const tokenProfesor = mockAuthenticatedUser(profesorUser)
    const stats = await request(app)
      .get('/api/teachers/7/stats')
      .set('Authorization', `Bearer ${tokenProfesor}`)
    expect(stats.status).toBe(200)
    expect(stats.body.ok).toBe('stats')

    const hist = await request(app)
      .get('/api/teachers/7/stats/historical?period=2026-1')
      .set('Authorization', `Bearer ${tokenProfesor}`)
    expect(hist.status).toBe(200)

    const rating = await request(app).get('/api/teachers/course-rating/7/3')
    expect(rating.status).toBe(200)

    const tokenAdmin = mockAuthenticatedUser({
      id: 'user-admin',
      email: 'admin@test.com',
      tipo_usuario: 'admin',
      roles: ['admin'],
    })
    const noDecano = await request(app)
      .get('/api/teachers/career-results/all')
      .set('Authorization', `Bearer ${tokenAdmin}`)
    expect(noDecano.status).toBe(403)

    const tokenDecano = mockAuthenticatedUser({
      id: 'user-decano',
      email: 'decano@test.com',
      tipo_usuario: 'decano',
      roles: ['decano'],
    })
    const allCareers = await request(app)
      .get('/api/teachers/career-results/all')
      .set('Authorization', `Bearer ${tokenDecano}`)
    expect(allCareers.status).toBe(200)

    const oneCareer = await request(app)
      .get('/api/teachers/career-results/1')
      .set('Authorization', `Bearer ${tokenDecano}`)
    expect(oneCareer.status).toBe(200)

    const noProfesor = await request(app)
      .get('/api/teachers/teacher-stats/7')
      .set('Authorization', `Bearer ${tokenDecano}`)
    expect(noProfesor.status).toBe(403)

    const tokenProfesor2 = mockAuthenticatedUser(profesorUser)
    const teacherStats = await request(app)
      .get('/api/teachers/teacher-stats/7')
      .set('Authorization', `Bearer ${tokenProfesor2}`)
    expect(teacherStats.status).toBe(200)

    const period = await request(app)
      .get('/api/teachers/period-stats?period=2026-1')
      .set('Authorization', `Bearer ${tokenProfesor2}`)
    expect(period.status).toBe(200)

    const cats = await request(app)
      .get('/api/teachers/period-category-stats?period=2026-1&courseId=3')
      .set('Authorization', `Bearer ${tokenProfesor2}`)
    expect(cats.status).toBe(200)

    vi.spyOn(teachersAnalyticsService, 'getStats').mockRejectedValue(new Error('db'))
    const fail = await request(app)
      .get('/api/teachers/7/stats')
      .set('Authorization', `Bearer ${tokenProfesor2}`)
    expect(fail.status).toBe(500)

    const tokenDecano2 = mockAuthenticatedUser({
      id: 'user-decano',
      email: 'decano@test.com',
      tipo_usuario: 'decano',
      roles: ['decano'],
    })
    vi.spyOn(teachersAnalyticsService, 'getCareerResultsByCareer').mockRejectedValue(new Error('db'))
    const careerFail = await request(app)
      .get('/api/teachers/career-results/1')
      .set('Authorization', `Bearer ${tokenDecano2}`)
    expect(careerFail.status).toBe(500)

    const tokenProfesor3 = mockAuthenticatedUser(profesorUser)
    vi.spyOn(teachersAnalyticsService, 'getPeriodStats').mockRejectedValue(new Error('db'))
    const periodFail = await request(app)
      .get('/api/teachers/period-stats?period=2026-1')
      .set('Authorization', `Bearer ${tokenProfesor3}`)
    expect(periodFail.status).toBe(500)

    mockAuthenticatedUser({
      id: 'user-decano',
      email: 'decano@test.com',
      tipo_usuario: 'decano',
      roles: ['decano'],
    })
    const catsForbidden = await request(app)
      .get('/api/teachers/period-category-stats?period=2026-1')
      .set('Authorization', `Bearer ${tokenDecano2}`)
    expect(catsForbidden.status).toBe(403)

    mockAuthenticatedUser(profesorUser)
    vi.spyOn(teachersAnalyticsService, 'getPeriodCategoryStats').mockRejectedValue(new Error('db'))
    const catsFail = await request(app)
      .get('/api/teachers/period-category-stats?period=2026-1&courseId=3')
      .set('Authorization', `Bearer ${tokenProfesor3}`)
    expect(catsFail.status).toBe(500)
  })
})
