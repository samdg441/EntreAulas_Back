import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { queueFrom } from '../helpers/query-builder'
import { fromMock, supabaseModuleMock } from '../helpers/supabase-mock'
import { coordinadorUser, profesorUser } from '../fixtures/users'

const geminiSummarize = vi.hoisted(() => vi.fn())

vi.mock('../../config/supabase-only', () => supabaseModuleMock)
vi.mock('../../config/supabaseClient', () => supabaseModuleMock)

vi.mock('../../modules/ai-summary/providers/gemini.provider', () => ({
  GeminiSummaryProvider: class {
    name = 'gemini'
    summarize = (...args: unknown[]) => geminiSummarize(...args)
  },
}))

import { app } from '../../app'
import { RoleService } from '../../modules/auth/role.service'

const findUserById = supabaseModuleMock.SupabaseDB.findUserById as ReturnType<typeof vi.fn>
const url = '/api/ai/summarize/by-career'

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

function queueCarrera(texto: string) {
  return queueFrom({
    profesores: [
      {
        data: [{ id: 7, usuario: { nombre: 'Ana', apellido: 'Perez' } }],
        error: null,
      },
    ],
    evaluaciones: [
      { data: [{ id: 10, profesor_id: 7, calificacion_promedio: 4 }], error: null },
    ],
    respuestas_evaluacion: [
      { data: [{ evaluacion_id: 10, respuesta_texto: texto }], error: null },
    ],
  })
}

/**
 * RQ31 Backend — Recibir alerta de acoso con IA (GET /api/ai/summarize/by-career)
 * C1 1-2-3-4-5-15 → 401
 * C2 1-2-3-4-6-7-8-15 → 403
 * C3 1-2-3-4-6-7-9-10-11-13-14-15 → 200 sin alerta
 * C4 1-2-3-4-6-7-9-10-11-12-13-14-15 → 200 con alerta
 */
describe('RQ31 unit — Recibir alerta de acoso con IA', () => {
  beforeEach(() => {
    fromMock.mockReset()
    findUserById.mockReset()
    geminiSummarize.mockReset()
    vi.restoreAllMocks()
    geminiSummarize.mockResolvedValue({
      summary: 'Resumen de la carrera',
      topics: ['claridad'],
      analysisSource: 'open_text',
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  describe('caminos que fallan', () => {
    it('C1 (1-2-3-4-5-15): sin JWT o usuario inactivo → 401', async () => {
      const sinToken = await request(app).get(url)
      expect(sinToken.status).toBe(401)
      expect(sinToken.body.code).toBe('NO_TOKEN')

      const tokenInactivo = mockAuthenticatedUser({ ...coordinadorUser, activo: false })
      const inactivo = await request(app).get(url).set('Authorization', `Bearer ${tokenInactivo}`)
      expect(inactivo.status).toBe(401)
      expect(inactivo.body.code).toBe('USER_INVALID')
    })

    it('C2 (1-2-3-4-6-7-8-15): JWT válido pero rol no autorizado → 403', async () => {
      const token = mockAuthenticatedUser(profesorUser)
      const res = await request(app).get(url).set('Authorization', `Bearer ${token}`)
      expect(res.status).toBe(403)
      expect(res.body).toEqual({ error: 'Permisos insuficientes', code: 'FORBIDDEN_ROLE' })
    })
  })

  describe('caminos que funcionan', () => {
    it('C3 (1-2-3-4-6-7-9-10-11-13-14-15): textos sin acoso → 200 acosoDetectado false', async () => {
      const token = mockAuthenticatedUser(coordinadorUser)
      vi.spyOn(RoleService, 'obtenerCoordinadorPorUsuario').mockResolvedValue({
        carrera_id: 1,
      } as never)
      fromMock.mockImplementation(queueCarrera('El profesor explica con claridad y es puntual'))

      const res = await request(app).get(url).set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.acosoDetectado).toBe(false)
      expect(res.body.mensajeAcoso).toBeUndefined()
      expect(res.body.acosoProfesores).toEqual([])
      expect(res.body.summary).toBe('Resumen de la carrera')
    })

    it('C4 (1-2-3-4-6-7-9-10-11-12-13-14-15): indicio de acoso → 200 con alerta', async () => {
      const token = mockAuthenticatedUser(coordinadorUser)
      vi.spyOn(RoleService, 'obtenerCoordinadorPorUsuario').mockResolvedValue({
        carrera_id: 1,
      } as never)
      fromMock.mockImplementation(
        queueCarrera('Hubo acoso y maltrato hacia los estudiantes en clase')
      )

      const res = await request(app).get(url).set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.acosoDetectado).toBe(true)
      expect(res.body.mensajeAcoso).toMatch(/ALERTA/)
      expect(res.body.acosoProfesores).toEqual([
        expect.objectContaining({
          profesorId: '7',
          nombre: 'Ana Perez',
          menciones: 1,
        }),
      ])
      expect(res.body.summary).toBe('Resumen de la carrera')
    })
  })
})
