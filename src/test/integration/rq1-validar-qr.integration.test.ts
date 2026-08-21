import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { queueFrom } from '../helpers/query-builder'

const fromMock = vi.fn()

vi.mock('../../config/supabase-only', () => ({
  SupabaseDB: {
    supabaseAdmin: { from: (...args: unknown[]) => fromMock(...args) },
    findUserById: vi.fn(),
    findUserByEmail: vi.fn(),
  },
  supabaseAdmin: { from: (...args: unknown[]) => fromMock(...args) },
  default: {},
}))

vi.mock('../../config/supabaseClient', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => fromMock(...args) },
  SupabaseDB: {
    supabaseAdmin: { from: (...args: unknown[]) => fromMock(...args) },
  },
  default: {},
}))

import { app } from '../../app'
import qrRouter from '../../modules/evaluations/qr-evaluaciones.routes'

function getResolveTokenHandler() {
  const layer = (qrRouter as unknown as { stack: Array<{ route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: Function }> } }> }).stack.find(
    (item) => item.route?.path === '/:token' && item.route.methods.get
  )
  const handlers = layer?.route?.stack ?? []
  return handlers[handlers.length - 1].handle
}

describe('RQ1 integración — Validar QR vencido o inválido', () => {
  beforeEach(() => {
    fromMock.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('Camino 1 (1-2-3-4-13): URL sin token — error sin consultar backend/BD', async () => {
    const handler = getResolveTokenHandler()
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    }
    await handler({ params: { token: '' } }, res)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('Camino 2 (1-2-3-5-6-7-8-9-10-13): token inválido o QR inactivo → 404 para el front', async () => {
    fromMock.mockImplementation(queueFrom({ qr_evaluaciones: [{ data: null, error: null }] }))

    const res = await request(app).get('/api/qr-evaluaciones/token-vencido')

    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'QR inválido o expirado.' })
  })

  it('Camino 3 (1-2-3-5-6-7-11-12-13): QR válido y activo → 200 con datos para abrir la encuesta', async () => {
    fromMock.mockImplementation(
      queueFrom({
        qr_evaluaciones: [
          {
            data: {
              profesor_id: 1,
              curso_id: 2,
              grupo_id: 3,
              periodo_id: null,
              profesor: { usuario: { nombre: 'Luis', apellido: 'Gómez' } },
              curso: { nombre: 'Álgebra', codigo: 'MAT102' },
              grupo: { numero_grupo: 2, horario: '9-11', aula: 'B2' },
            },
            error: null,
          },
        ],
      })
    )

    const res = await request(app).get('/api/qr-evaluaciones/token-valido')

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      profesorId: 1,
      cursoId: 2,
      grupoId: 3,
      profesorNombre: 'Luis Gómez',
    })
  })
})
