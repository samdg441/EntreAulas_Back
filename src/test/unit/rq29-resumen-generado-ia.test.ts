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

    it('POST /summarize valida texts y un profesor no consulta a otro', async () => {
      const token = mockAuthenticatedUser(adminUser)
      const vacio = await request(app)
        .post('/api/ai/summarize')
        .set('Authorization', `Bearer ${token}`)
        .send({ texts: [] })
      expect(vacio.status).toBe(400)

      const ok = await request(app)
        .post('/api/ai/summarize')
        .set('Authorization', `Bearer ${token}`)
        .send({ texts: ['El profesor explica con claridad y es puntual en clase'] })
      expect(ok.status).toBe(200)
      expect(ok.body.summary).toBeTruthy()

      const tokenProfesor = mockAuthenticatedUser(profesorUser)
      fromMock.mockImplementation(queueSinTextos({ evaluaciones: [] }))
      const ajeno = await request(app)
        .get('/api/ai/summarize/by-professor?profesor_id=otro-usuario')
        .set('Authorization', `Bearer ${tokenProfesor}`)
      expect(ajeno.status).toBe(403)

      fromMock.mockImplementation(queueSinTextos({ evaluaciones: [] }))
      const conFiltros = await request(app)
        .get(`${url}&periodo_id=2026-1&grupo_id=3`)
        .set('Authorization', `Bearer ${token}`)
      expect(conFiltros.status).toBe(200)

      fromMock.mockImplementation(queueSinTextos({ evaluaciones: [] }))
      const numerico = await request(app)
        .get(`${url}&periodo_id=12`)
        .set('Authorization', `Bearer ${token}`)
      expect(numerico.status).toBe(200)

      const sinId = await request(app)
        .get('/api/ai/summarize/by-professor')
        .set('Authorization', `Bearer ${token}`)
      expect(sinId.status).toBe(400)
    })

    it('GET /summarize/by-faculty cubre vacío, periodo y textos', async () => {
      const tokenEst = mockAuthenticatedUser(estudianteUser)
      const forbidden = await request(app)
        .get('/api/ai/summarize/by-faculty')
        .set('Authorization', `Bearer ${tokenEst}`)
      expect(forbidden.status).toBe(403)

      const token = mockAuthenticatedUser(adminUser)
      fromMock.mockImplementation(queueFrom({ evaluaciones: [{ data: [], error: null }] }))
      const vacio = await request(app)
        .get('/api/ai/summarize/by-faculty')
        .set('Authorization', `Bearer ${token}`)
      expect(vacio.status).toBe(200)
      expect(vacio.body.textsCount).toBe(0)
      expect(vacio.body.summary).toMatch(/facultad/)

      fromMock.mockImplementation(
        queueFrom({
          evaluaciones: [{ data: [{ id: 1 }], error: null }],
          respuestas_evaluacion: [{ data: [{ respuesta_texto: 'ab' }], error: null }],
        }),
      )
      const numerico = await request(app)
        .get('/api/ai/summarize/by-faculty?periodo_id=12')
        .set('Authorization', `Bearer ${token}`)
      expect(numerico.status).toBe(200)
      expect(numerico.body.textsCount).toBe(0)

      fromMock.mockImplementation(
        queueFrom({
          periodos_academicos: [{ data: { id: 9 }, error: null }],
          evaluaciones: [{ data: [{ id: 2 }], error: null }],
          respuestas_evaluacion: [
            { data: [{ respuesta_texto: 'El curso de la facultad es excelente' }], error: null },
          ],
        }),
      )
      geminiSummarize.mockResolvedValue({
        summary: 'Resumen facultad',
        topics: ['facultad'],
        analysisSource: 'open_text',
      })
      const named = await request(app)
        .get('/api/ai/summarize/by-faculty?periodo_id=2026-1')
        .set('Authorization', `Bearer ${token}`)
      expect(named.status).toBe(200)
      expect(named.body.textsCount).toBe(1)
      expect(named.body.summary).toBe('Resumen facultad')

      fromMock.mockImplementation(
        queueFrom({
          periodos_academicos: [{ data: null, error: { message: 'fail' } }],
          evaluaciones: [{ data: [], error: null }],
        }),
      )
      const periodoErr = await request(app)
        .get('/api/ai/summarize/by-faculty?periodo_id=2026-2')
        .set('Authorization', `Bearer ${token}`)
      expect(periodoErr.status).toBe(200)

      fromMock.mockImplementation(
        queueFrom({
          evaluaciones: [
            { data: null, error: { message: 'fail' } },
            { data: [{ id: 3 }], error: null },
          ],
          respuestas_evaluacion: [{ data: [{ respuesta_texto: 'abcd' }], error: null }],
        }),
      )
      const evalErr = await request(app)
        .get('/api/ai/summarize/by-faculty?periodo_id=5')
        .set('Authorization', `Bearer ${token}`)
      expect(evalErr.status).toBe(200)
      expect(evalErr.body.textsCount).toBe(1)
    })

    it('POST /summarize detecta acoso y usa resumen local positivo/negativo', async () => {
      const token = mockAuthenticatedUser(adminUser)
      geminiSummarize.mockResolvedValue(null)

      const acoso = await request(app)
        .post('/api/ai/summarize')
        .set('Authorization', `Bearer ${token}`)
        .send({ texts: ['Hubo acoso y maltrato al estudiante en clase'] })
      expect(acoso.status).toBe(200)
      expect(acoso.body.acosoDetectado).toBe(true)
      expect(acoso.body.mensajeAcoso).toMatch(/ALERTA/)

      const positivo = await request(app)
        .post('/api/ai/summarize')
        .set('Authorization', `Bearer ${token}`)
        .send({ texts: ['Excelente, claro, me gusta, útil y fácil de entender en clase'] })
      expect(positivo.status).toBe(200)
      expect(positivo.body.acosoDetectado).toBeFalsy()

      const negativo = await request(app)
        .post('/api/ai/summarize')
        .set('Authorization', `Bearer ${token}`)
        .send({ texts: ['Es difícil, complicado, confuso, falta, hay problema, malo y lento'] })
      expect(negativo.status).toBe(200)
      expect(negativo.body.summary).toMatch(/Estado general/)
    })
  })
})
