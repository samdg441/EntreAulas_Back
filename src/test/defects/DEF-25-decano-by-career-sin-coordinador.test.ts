/**
 * DEF-25 — Decano/admin autorizados en by-career reciben 400 de coordinador (RQ31)
 *
 * Severidad: Alta | Estado: ABIERTO
 *
 * requireRole deja pasar coordinador, decano y admin. El handler solo resuelve
 * carrera con obtenerCoordinadorPorUsuario. Un decano o admin sin fila en
 * `coordinadores` recibe 400 aunque envíe `carrera_id` en query.
 *
 * Esta prueba expresa el comportamiento CORRECTO esperado y falla a propósito.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { queueFrom } from '../helpers/query-builder'
import { fromMock, supabaseModuleMock } from '../helpers/supabase-mock'
import { setTestUser } from '../helpers/test-user'
import { adminUser } from '../fixtures/users'

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
import { RoleService } from '../../modules/auth/role.service'

const decanoUser = {
  id: 'user-decano',
  email: 'decano@test.com',
  tipo_usuario: 'decano',
  roles: ['decano'],
  permisos: [] as string[],
}

describe('DEF-25 — Decano/admin deben poder consultar by-career', () => {
  beforeEach(() => {
    fromMock.mockReset()
    geminiSummarize.mockReset()
    geminiSummarize.mockResolvedValue({
      summary: 'Resumen de la carrera',
      topics: ['claridad'],
      analysisSource: 'open_text',
    })
    vi.spyOn(RoleService, 'obtenerCoordinadorPorUsuario').mockResolvedValue(null)
    fromMock.mockImplementation(
      queueFrom({
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
          { data: [{ evaluacion_id: 10, respuesta_texto: 'Clases claras' }], error: null },
        ],
      })
    )
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('admin con carrera_id en query no debe recibir 400 de coordinador', async () => {
    setTestUser(adminUser)
    const res = await request(app).get('/api/ai/summarize/by-career?carrera_id=1')
    expect(res.status).toBe(200)
    expect(res.body.error).not.toBe('No se encontró información de carrera para el coordinador')
  })

  it('decano no debe recibir 400 por no estar en la tabla coordinadores', async () => {
    setTestUser(decanoUser)
    const res = await request(app).get('/api/ai/summarize/by-career?carrera_id=1')
    expect(res.status).toBe(200)
    expect(res.body.error).not.toBe('No se encontró información de carrera para el coordinador')
  })
})
