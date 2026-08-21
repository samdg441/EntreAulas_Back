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

describe('RQ1 unitarias — Validar QR vencido o inválido (backend)', () => {
  beforeEach(() => {
    fromMock.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('Camino 1 (1-2-3-4-11): sin token responde 400 Token requerido', async () => {
    const handler = getResolveTokenHandler()
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    }
    await handler({ params: {} }, res)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ error: 'Token requerido.' })
  })

  it('Camino 2 (1-2-3-5-6-7-11): falla la consulta a qr_evaluaciones → 500', async () => {
    fromMock.mockImplementation(
      queueFrom({
        qr_evaluaciones: [{ data: null, error: { message: 'db down' } }],
      })
    )

    const res = await request(app).get('/api/qr-evaluaciones/token-error')

    expect(res.status).toBe(500)
    expect(res.body.error).toBe('Error al resolver el token.')
  })

  it('Camino 3 (1-2-3-5-6-8-9-11): token inexistente o QR inactivo → 404', async () => {
    fromMock.mockImplementation(
      queueFrom({
        qr_evaluaciones: [{ data: null, error: null }],
      })
    )

    const res = await request(app).get('/api/qr-evaluaciones/token-invalido')

    expect(res.status).toBe(404)
    expect(res.body.error).toBe('QR inválido o expirado.')
  })

  it('Camino 4 (1-2-3-5-6-8-10-11): token activo responde 200 con datos del QR', async () => {
    fromMock.mockImplementation(
      queueFrom({
        qr_evaluaciones: [
          {
            data: {
              profesor_id: 10,
              curso_id: 20,
              grupo_id: 30,
              periodo_id: 1,
              profesor: { usuario: { nombre: 'Ana', apellido: 'Pérez' } },
              curso: { nombre: 'Cálculo', codigo: 'MAT101' },
              grupo: { numero_grupo: 1, horario: '7-9', aula: 'A1' },
            },
            error: null,
          },
        ],
      })
    )

    const res = await request(app).get('/api/qr-evaluaciones/token-ok')

    expect(res.status).toBe(200)
    expect(res.body.profesorId).toBe(10)
    expect(res.body.cursoId).toBe(20)
    expect(res.body.grupoId).toBe(30)
    expect(res.body.profesorNombre).toBe('Ana Pérez')
    expect(res.body.cursoNombre).toBe('Cálculo')
  })
})
