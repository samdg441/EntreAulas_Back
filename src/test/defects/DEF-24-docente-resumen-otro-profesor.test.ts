/**
 * DEF-24 — Un docente lee el resumen IA de otro profesor (RQ29)
 *
 * Severidad: Alta (IDOR) | Estado: ABIERTO
 *
 * `GET /ai/summarize/by-professor` solo aplica
 * `tipo_usuario === 'profesor' && id !== profesor_id`. El rol `docente`
 * está autorizado por requireRole y se salta esa guarda: puede pedir
 * `profesor_id` ajeno.
 *
 * Esta prueba expresa el comportamiento CORRECTO esperado y falla a propósito.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { queueFrom } from '../helpers/query-builder'
import { fromMock, supabaseModuleMock } from '../helpers/supabase-mock'
import { setTestUser } from '../helpers/test-user'
import { profesorUser } from '../fixtures/users'

const geminiSummarize = vi.hoisted(() => vi.fn())

vi.mock('../../config/supabase-only', () => supabaseModuleMock)
vi.mock('../../config/supabaseClient', () => supabaseModuleMock)
vi.mock('../../middleware/auth', () => import('../helpers/auth-mock'))
vi.mock('../../modules/ai-summary/providers/gemini.provider', () => ({
  GeminiSummaryProvider: class {
    name = 'gemini'
    summarize = (...args: unknown[]) => geminiSummarize(...args)
  },
}))

import { app } from '../../app'

const docenteUser = {
  ...profesorUser,
  id: 'user-docente',
  tipo_usuario: 'docente',
  roles: ['docente'],
}

describe('DEF-24 — Un docente no debe leer el resumen de otro profesor', () => {
  beforeEach(() => {
    fromMock.mockReset()
    geminiSummarize.mockReset()
    setTestUser(docenteUser)
    geminiSummarize.mockResolvedValue({
      summary: 'Resumen ajeno',
      topics: ['claridad'],
      analysisSource: 'open_text',
    })
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('docente pidiendo profesor_id de otro usuario debe dar 403', async () => {
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

    const res = await request(app).get(
      '/api/ai/summarize/by-professor?profesor_id=user-profesor'
    )

    expect(res.status).toBe(403)
  })
})
