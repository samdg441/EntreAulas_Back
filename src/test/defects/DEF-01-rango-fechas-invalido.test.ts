/**
 * DEF-01 — Rango de fechas inválido en estadísticas históricas (RQ23)
 *
 * Severidad: Media | Estado: ABIERTO
 *
 * Esta prueba expresa el comportamiento CORRECTO esperado, no el actual.
 * Falla a propósito: es la evidencia del defecto. Debe pasar a verde
 * cuando se corrija `teachers-analytics.routes.ts`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { queueFrom } from '../helpers/query-builder'
import { fromMock, supabaseModuleMock } from '../helpers/supabase-mock'
import { profesorUser } from '../fixtures/users'

vi.mock('../../config/supabase-only', () => supabaseModuleMock)
vi.mock('../../config/supabaseClient', () => supabaseModuleMock)

vi.mock('../../middleware/auth', () => ({
  authenticateToken: (req: { user?: unknown }, _res: unknown, next: () => void) => {
    req.user = (globalThis as { __testUser?: unknown }).__testUser
    next()
  },
  requireRole: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}))

import { app } from '../../app'

describe('DEF-01 — El rango de fechas del período debe ser una fecha válida', () => {
  beforeEach(() => {
    fromMock.mockReset()
    ;(globalThis as { __testUser?: unknown }).__testUser = { ...profesorUser }
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('período 2026-1 debe terminar el 2026-06-30, no el 2026-06-31', async () => {
    fromMock.mockImplementation(
      queueFrom({
        profesores: [
          { data: null, error: { message: 'nf' } },
          { data: null, error: { message: 'nf' } },
        ],
      })
    )

    const res = await request(app).get('/api/teachers/999/stats/historical?period=2026-1')

    expect(res.status).toBe(200)
    expect(res.body.dateRange.end).toBe('2026-06-30')
    expect(Number.isNaN(Date.parse(res.body.dateRange.end))).toBe(false)
  })
})
