import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { queueFrom } from '../helpers/query-builder'
import { fromMock, supabaseModuleMock } from '../helpers/supabase-mock'
import { adminUser, estudianteUser, profesorUser } from '../fixtures/users'

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

const profesorRow = { id: 7, carrera_id: 1 }
const url = '/api/ai/summarize/by-professor?profesor_id=user-profesor'

function queueSinTextos(opts: { evaluaciones?: unknown[]; respuestasTextos?: unknown[]; respuestasRatings?: unknown[] }) {
  const evaluaciones = opts.evaluaciones ?? []
  const profesores = [
    { data: profesorRow, error: null },
    { data: { id: profesorRow.id }, error: null },
    { data: { id: profesorRow.id }, error: null },
  ]
  const queues: Record<string, Array<{ data: unknown; error: unknown }>> = {
    profesores,
    evaluaciones: [
      { data: evaluaciones, error: null },
      { data: evaluaciones, error: null },
    ],
  }
  if (opts.respuestasTextos || opts.respuestasRatings) {
    queues.respuestas_evaluacion = [
      { data: opts.respuestasTextos ?? [], error: null },
      { data: opts.respuestasRatings ?? [], error: null },
    ]
  }
  return queueFrom(queues)
}

function queueConTextos(textos: string[]) {
  return queueFrom({
    profesores: [
      { data: profesorRow, error: null },
      { data: { id: profesorRow.id }, error: null },
    ],
    evaluaciones: [{ data: [{ id: 1 }], error: null }],
    respuestas_evaluacion: [
      {
        data: textos.map((respuesta_texto) => ({ respuesta_texto })),
        error: null,
      },
    ],
  })
}

/**
 * RQ29 Backend — Resumen generado con IA (GET /api/ai/summarize/by-professor)
 * C1 1-2-3-4-5-18 → 401
 * C2 1-2-3-4-6-7-8-18 → 403
 * C3 1-2-3-4-6-7-9-10-11-13-18 → 200 sin datos
 * C4 1-2-3-4-6-7-9-10-11-12-17-18 → 200 fallback cuantitativo
 * C5 1-2-3-4-6-7-9-10-14-15-17-18 → 200 Gemini
 * C6 1-2-3-4-6-7-9-10-14-15-16-17-18 → 200 resumen local
 */
describe('RQ29 unit — Resumen generado con IA', () => {
  beforeEach(() => {
    fromMock.mockReset()
    findUserById.mockReset()
    geminiSummarize.mockReset()
    vi.restoreAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  describe('caminos que fallan', () => {
    it('C1 (1-2-3-4-5-18): sin JWT o usuario inactivo → 401', async () => {
      const sinToken = await request(app).get(url)
      expect(sinToken.status).toBe(401)
      expect(sinToken.body.code).toBe('NO_TOKEN')

      const tokenInactivo = mockAuthenticatedUser({ ...profesorUser, activo: false })
      const inactivo = await request(app).get(url).set('Authorization', `Bearer ${tokenInactivo}`)
      expect(inactivo.status).toBe(401)
      expect(inactivo.body.code).toBe('USER_INVALID')
    })

    it('C2 (1-2-3-4-6-7-8-18): JWT válido pero rol no autorizado → 403', async () => {
      const token = mockAuthenticatedUser(estudianteUser)
      const res = await request(app).get(url).set('Authorization', `Bearer ${token}`)
      expect(res.status).toBe(403)
      expect(res.body).toEqual({ error: 'Permisos insuficientes', code: 'FORBIDDEN_ROLE' })
    })
  })

  describe('caminos que funcionan', () => {
    it('C3 (1-2-3-4-6-7-9-10-11-13-18): autorizado, sin textos ni ratings → 200 aviso sin datos', async () => {
      const token = mockAuthenticatedUser(adminUser)
      fromMock.mockImplementation(queueSinTextos({ evaluaciones: [] }))

      const res = await request(app).get(url).set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.textsCount).toBe(0)
      expect(res.body.topics).toEqual([])
      expect(res.body.summary).toMatch(/No se encontraron respuestas abiertas/)
    })

    it('C4 (1-2-3-4-6-7-9-10-11-12-17-18): sin textos abiertos, con ratings → 200 fallback cuantitativo', async () => {
      const token = mockAuthenticatedUser(adminUser)
      fromMock.mockImplementation(
        queueSinTextos({
          evaluaciones: [{ id: 1 }],
          respuestasTextos: [{ respuesta_texto: 'ab' }],
          respuestasRatings: [{ respuesta_rating: 4 }, { respuesta_rating: 5 }],
        })
      )

      const res = await request(app).get(url).set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.textsCount).toBe(0)
      expect(res.body.ratingsCount).toBe(2)
      expect(res.body.analysisSource).toBe('quantitative_fallback')
      expect(res.body.summary).toMatch(/respuestas cuantitativas/)
    })

    it('C5 (1-2-3-4-6-7-9-10-14-15-17-18): textos abiertos y Gemini OK → 200 resumen IA', async () => {
      const token = mockAuthenticatedUser(adminUser)
      fromMock.mockImplementation(
        queueConTextos(['El profesor explica con claridad y es excelente en clase'])
      )
      geminiSummarize.mockResolvedValue({
        summary: 'Resumen Gemini del docente',
        topics: ['claridad', 'excelente'],
        analysisSource: 'open_text',
      })

      const res = await request(app).get(url).set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.textsCount).toBe(1)
      expect(res.body.summary).toBe('Resumen Gemini del docente')
      expect(res.body.analysisSource).toBe('open_text')
      expect(geminiSummarize).toHaveBeenCalled()
    })

    it('C6 (1-2-3-4-6-7-9-10-14-15-16-17-18): Gemini falla → 200 resumen local', async () => {
      const token = mockAuthenticatedUser(adminUser)
      fromMock.mockImplementation(
        queueConTextos(['El profesor explica con claridad y es excelente en clase'])
      )
      geminiSummarize.mockResolvedValue(null)

      const res = await request(app).get(url).set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.textsCount).toBe(1)
      expect(res.body.summary).toMatch(/Estado general/)
      expect(res.body.analysisSource).toBe('open_text')
      expect(geminiSummarize).toHaveBeenCalled()
    })
  })
})
