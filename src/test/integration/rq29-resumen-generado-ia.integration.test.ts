/**
 * Integración RQ29 — Resumen generado con IA. El grafo completo vive en `src/test/unit/rq29-*.test.ts`.
 * Contrato HTTP de auth (C1) y del camino Gemini (C5).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { queueFrom } from '../helpers/query-builder'
import { fromMock, supabaseModuleMock } from '../helpers/supabase-mock'
import { adminUser } from '../fixtures/users'

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
const url = '/api/ai/summarize/by-professor?profesor_id=user-profesor'

describe('RQ29 integration — smoke resumen generado con IA', () => {
  beforeEach(() => {
    fromMock.mockReset()
    findUserById.mockReset()
    geminiSummarize.mockReset()
    vi.restoreAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('C1 HTTP: sin token → 401', async () => {
    const res = await request(app).get(url)
    expect(res.status).toBe(401)
    expect(res.body.code).toBe('NO_TOKEN')
  })

  it('C5 HTTP: 200 con resumen IA', async () => {
    findUserById.mockResolvedValue({
      id: adminUser.id,
      email: adminUser.email,
      tipo_usuario: adminUser.tipo_usuario,
      activo: true,
    })
    vi.spyOn(RoleService, 'obtenerRolesUsuario').mockResolvedValue(['admin'])
    vi.spyOn(RoleService, 'obtenerPermisosUsuario').mockResolvedValue([])
    fromMock.mockImplementation(
      queueFrom({
        profesores: [
          { data: { id: 7, carrera_id: 1 }, error: null },
          { data: { id: 7 }, error: null },
        ],
        evaluaciones: [{ data: [{ id: 1 }], error: null }],
        respuestas_evaluacion: [
          { data: [{ respuesta_texto: 'El profesor explica con claridad' }], error: null },
        ],
      })
    )
    geminiSummarize.mockResolvedValue({
      summary: 'Resumen Gemini del docente',
      topics: ['claridad'],
      analysisSource: 'open_text',
    })

    const token = jwt.sign({ userId: adminUser.id }, process.env.JWT_SECRET as string)
    const res = await request(app).get(url).set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.summary).toBe('Resumen Gemini del docente')
    expect(res.body.textsCount).toBe(1)
  })
})
