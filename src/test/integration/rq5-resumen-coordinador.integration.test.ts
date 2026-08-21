import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { queueFrom, coordinadorUser, estudianteUser } from '../helpers/query-builder'

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

vi.mock('../../middleware/auth', () => ({
  authenticateToken: (req: { user?: unknown }, _res: unknown, next: () => void) => {
    req.user = (globalThis as { __testUser?: unknown }).__testUser
    next()
  },
  requireRole: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  requireAuth: (req: { user?: unknown }, _res: unknown, next: () => void) => {
    req.user = (globalThis as { __testUser?: unknown }).__testUser
    next()
  },
}))

import { app } from '../../app'
import { RoleService } from '../../modules/auth/role.service'

describe('RQ5 integración — Ver resumen del coordinador', () => {
  beforeEach(() => {
    fromMock.mockReset()
    vi.restoreAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(RoleService, 'obtenerCoordinadorPorUsuario')
    ;(globalThis as { __testUser?: unknown }).__testUser = { ...coordinadorUser }
  })

  it('Camino 1: no coordinador → 403', async () => {
    ;(globalThis as { __testUser?: unknown }).__testUser = { ...estudianteUser }

    const res = await request(app).get('/api/coordinador/dashboard-summary')

    expect(res.status).toBe(403)
  })

  it('Camino 2: sin carrera → 400', async () => {
    vi.spyOn(RoleService, 'obtenerCoordinadorPorUsuario').mockResolvedValue({
      id: 1,
      usuario_id: coordinadorUser.id,
      activo: true,
    })

    const res = await request(app).get('/api/coordinador/dashboard-summary')

    expect(res.status).toBe(400)
  })

  it('Camino 3: resumen válido → stats y docentes para el front', async () => {
    vi.spyOn(RoleService, 'obtenerCoordinadorPorUsuario').mockResolvedValue({
      id: 1,
      usuario_id: coordinadorUser.id,
      carrera_id: 6,
      activo: true,
    })
    fromMock.mockImplementation(
      queueFrom({
        cursos: [{ data: [{ id: 1 }, { id: 2 }], error: null }],
        profesores: [{ data: [{ id: 9, usuario_id: 'u9', activo: true }], error: null }],
        usuarios: [
          {
            data: [{ id: 'u9', nombre: 'Marta', apellido: 'Ruiz', email: 'marta@test.com' }],
            error: null,
          },
        ],
        evaluaciones: [
          {
            data: [{ profesor_id: 9, calificacion_promedio: 4.1, completada: true }],
            error: null,
          },
        ],
      })
    )

    const res = await request(app).get('/api/coordinador/dashboard-summary')

    expect(res.status).toBe(200)
    expect(res.body.stats.totalCursos).toBe(2)
    expect(res.body.teachers).toHaveLength(1)
    expect(res.body.pagination).toMatchObject({ page: 1 })
  })
})
