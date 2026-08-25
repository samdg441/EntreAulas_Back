/**
 * DEF-15 — La generación de QR acepta fechas imposibles (RQ18, integración)
 *
 * Severidad: Media | Estado: ABIERTO
 *
 * `POST /qr-evaluaciones/batch` documenta `startDate` y `endDate` en su
 * cabecera, pero no valida nada: acepta un mes 13, un día -1 y una ventana
 * de vigencia que termina antes de empezar, y responde 201.
 *
 * La única barrera que existe hoy es el widget `<input type="date">` del
 * navegador, que descarta las fechas mal formadas antes de que salgan del
 * formulario. Esa protección no aplica a ningún cliente que no sea ese
 * widget: una petición directa a la API pasa sin obstáculo.
 *
 * Relacionado con DEF-14: hoy el impacto está enmascarado porque las fechas
 * se descartan y nunca se persisten.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { queueFrom } from '../helpers/query-builder'
import { fromMock, supabaseModuleMock } from '../helpers/supabase-mock'
import { adminUser } from '../fixtures/users'

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

/** Grupo con QR ya existente: el endpoint lo reutiliza y responde 201. */
function escenarioMinimo() {
  return queueFrom({
    grupos: [{ data: [{ id: 1, curso_id: 100, profesor_id: 500 }], error: null }],
    asignaciones_profesor: [{ data: [], error: null }],
    qr_evaluaciones: [
      { data: [{ grupo_id: 1, token: 'tok-existente', profesor_id: 500 }], error: null },
    ],
  })
}

describe('DEF-15 — La ventana de vigencia del QR debe validarse en el servidor', () => {
  beforeEach(() => {
    fromMock.mockReset()
    ;(globalThis as { __testUser?: unknown }).__testUser = { ...adminUser }
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('un mes 13 y un día -1 deben rechazarse con 400', async () => {
    fromMock.mockImplementation(escenarioMinimo())

    const res = await request(app).post('/api/qr-evaluaciones/batch').send({
      grupoIds: [1],
      period: '2026-1',
      startDate: '2026-13-01',
      endDate: '2026-01--1',
    })

    expect(res.status).toBe(400)
  })

  it('una fecha de cierre anterior a la de inicio debe rechazarse con 400', async () => {
    fromMock.mockImplementation(escenarioMinimo())

    const res = await request(app).post('/api/qr-evaluaciones/batch').send({
      grupoIds: [1],
      period: '2026-1',
      startDate: '2026-12-31',
      endDate: '2026-01-01',
    })

    expect(res.status).toBe(400)
  })
})
