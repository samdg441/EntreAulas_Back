/**
 * Integración RQ31 — Recibir alerta de acoso con IA.
 * El grafo completo vive en `src/test/unit/rq31-*.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { queueFrom } from '../helpers/query-builder'
import { fromMock, supabaseModuleMock } from '../helpers/supabase-mock'
import { coordinadorUser } from '../fixtures/users'

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

describe('RQ31 integration — smoke alerta de acoso con IA', () => {
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

  it('C4 HTTP: 200 con acosoDetectado y acosoProfesores', async () => {
    findUserById.mockResolvedValue({
      id: coordinadorUser.id,
      email: coordinadorUser.email,
      tipo_usuario: coordinadorUser.tipo_usuario,
      activo: true,
    })
    vi.spyOn(RoleService, 'obtenerRolesUsuario').mockResolvedValue(['coordinador'])
    vi.spyOn(RoleService, 'obtenerPermisosUsuario').mockResolvedValue([])
    vi.spyOn(RoleService, 'obtenerCoordinadorPorUsuario').mockResolvedValue({
      carrera_id: 1,
    } as never)
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
          {
            data: [{ evaluacion_id: 10, respuesta_texto: 'Hubo acoso hacia los estudiantes' }],
            error: null,
          },
        ],
      })
    )
    geminiSummarize.mockResolvedValue({
      summary: 'Resumen de la carrera',
      topics: ['claridad'],
      analysisSource: 'open_text',
    })

    const token = jwt.sign({ userId: coordinadorUser.id }, process.env.JWT_SECRET as string)
    const res = await request(app).get(url).set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.acosoDetectado).toBe(true)
    expect(res.body.acosoProfesores[0].nombre).toBe('Ana Perez')
    expect(res.body.mensajeAcoso).toMatch(/ALERTA/)
  })
})
