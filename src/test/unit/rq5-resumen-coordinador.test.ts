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

describe('RQ5 unitarias — Ver resumen del coordinador (backend)', () => {
  beforeEach(() => {
    fromMock.mockReset()
    vi.restoreAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(RoleService, 'obtenerCoordinadorPorUsuario')
    ;(globalThis as { __testUser?: unknown }).__testUser = { ...coordinadorUser }
  })

  it('Camino 1 (1-2-3-21): no es coordinador → 403', async () => {
    ;(globalThis as { __testUser?: unknown }).__testUser = { ...estudianteUser }

    const res = await request(app).get('/api/coordinador/dashboard-summary')

    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/Solo coordinadores/)
  })

  it('Camino 2 (1-2-4-5-6-21): sin carrera asignada → 400', async () => {
    vi.spyOn(RoleService, 'obtenerCoordinadorPorUsuario').mockResolvedValue({
      id: 1,
      usuario_id: coordinadorUser.id,
      activo: true,
    })

    const res = await request(app).get('/api/coordinador/dashboard-summary')

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('No se encontró carrera asociada al coordinador')
  })

  it('Camino 3 (1-2-4-5-7-8-9-10-21): falla cursos → 500', async () => {
    vi.spyOn(RoleService, 'obtenerCoordinadorPorUsuario').mockResolvedValue({
      id: 1,
      usuario_id: coordinadorUser.id,
      carrera_id: 3,
      activo: true,
    })
    fromMock.mockImplementation(
      queueFrom({
        cursos: [{ data: null, error: { message: 'cursos fail' } }],
      })
    )

    const res = await request(app).get('/api/coordinador/dashboard-summary')

    expect(res.status).toBe(500)
    expect(res.body.error).toBe('Error obteniendo cursos')
  })

  it('Camino 4 (1-2-4-5-7-8-9-11-12-13-21): falla profesores → 500', async () => {
    vi.spyOn(RoleService, 'obtenerCoordinadorPorUsuario').mockResolvedValue({
      id: 1,
      usuario_id: coordinadorUser.id,
      carrera_id: 3,
      activo: true,
    })
    fromMock.mockImplementation(
      queueFrom({
        cursos: [{ data: [{ id: 1 }], error: null }],
        profesores: [{ data: null, error: { message: 'profesores fail' } }],
      })
    )

    const res = await request(app).get('/api/coordinador/dashboard-summary')

    expect(res.status).toBe(500)
    expect(res.body.error).toBe('Error obteniendo profesores')
  })

  it('Camino 5 (1-2-4-5-7-8-9-11-12-14-15-21): carrera sin docentes → 200 vacío', async () => {
    vi.spyOn(RoleService, 'obtenerCoordinadorPorUsuario').mockResolvedValue({
      id: 1,
      usuario_id: coordinadorUser.id,
      carrera_id: 3,
      activo: true,
    })
    fromMock.mockImplementation(
      queueFrom({
        cursos: [{ data: [{ id: 10 }, { id: 11 }], error: null }],
        profesores: [{ data: [], error: null }],
      })
    )

    const res = await request(app).get('/api/coordinador/dashboard-summary')

    expect(res.status).toBe(200)
    expect(res.body.stats.totalProfesores).toBe(0)
    expect(res.body.stats.totalCursos).toBe(2)
    expect(res.body.teachers).toEqual([])
  })

  it('Camino 6 (1-2-4-5-7-8-9-11-12-14-16-17-18-21): falla usuarios/evals → 500', async () => {
    vi.spyOn(RoleService, 'obtenerCoordinadorPorUsuario').mockResolvedValue({
      id: 1,
      usuario_id: coordinadorUser.id,
      carrera_id: 3,
      activo: true,
    })
    fromMock.mockImplementation(
      queueFrom({
        cursos: [{ data: [{ id: 10 }], error: null }],
        profesores: [{ data: [{ id: 7, usuario_id: 'u-prof', activo: true }], error: null }],
        usuarios: [{ data: null, error: { message: 'usuarios fail' } }],
      })
    )

    const res = await request(app).get('/api/coordinador/dashboard-summary')

    expect(res.status).toBe(500)
    expect(res.body.error).toBe('Error obteniendo usuarios')
  })

  it('Camino 7 (1-2-4-5-7-8-9-11-12-14-16-17-19-20-21): resumen OK → 200 con stats y teachers', async () => {
    vi.spyOn(RoleService, 'obtenerCoordinadorPorUsuario').mockResolvedValue({
      id: 1,
      usuario_id: coordinadorUser.id,
      carrera_id: 3,
      activo: true,
    })
    fromMock.mockImplementation(
      queueFrom({
        cursos: [{ data: [{ id: 10 }], error: null }],
        profesores: [{ data: [{ id: 7, usuario_id: 'u-prof', activo: true }], error: null }],
        usuarios: [
          {
            data: [{ id: 'u-prof', nombre: 'Ana', apellido: 'Pérez', email: 'ana@test.com' }],
            error: null,
          },
        ],
        evaluaciones: [
          {
            data: [
              { profesor_id: 7, calificacion_promedio: 4, completada: true },
              { profesor_id: 7, calificacion_promedio: 5, completada: true },
            ],
            error: null,
          },
        ],
      })
    )

    const res = await request(app).get('/api/coordinador/dashboard-summary')

    expect(res.status).toBe(200)
    expect(res.body.stats.totalProfesores).toBe(1)
    expect(res.body.stats.totalCursos).toBe(1)
    expect(res.body.stats.totalEvaluaciones).toBe(2)
    expect(res.body.stats.promedioEvaluaciones).toBe(4.5)
    expect(res.body.teachers[0]).toMatchObject({
      profesorId: 7,
      nombre: 'Ana Pérez',
      promedio: 4.5,
      totalEvaluaciones: 2,
    })
  })
})
