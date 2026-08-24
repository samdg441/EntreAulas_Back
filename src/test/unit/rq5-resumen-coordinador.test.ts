import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { queueFrom } from '../helpers/query-builder'
import { fromMock, supabaseModuleMock } from '../helpers/supabase-mock'
import { coordinadorUser, estudianteUser } from '../fixtures/users'

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
import { RoleService } from '../../modules/auth/role.service'

/**
 * RQ5 Backend — Resumen coordinador
 * C1 403 | C2 400 | C3 cursos 500 | C4 profes 500 | C5 vacío
 * C6a users 500 | C6b evals 500 | C7 OK
 */
describe('RQ5 unit — Ver resumen del coordinador', () => {
  beforeEach(() => {
    fromMock.mockReset()
    vi.restoreAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('C1: no es coordinador → 403', async () => {
    ;(globalThis as { __testUser?: unknown }).__testUser = { ...estudianteUser }
    const res = await request(app).get('/api/coordinador/dashboard-summary')
    expect(res.status).toBe(403)
  })

  it('C2: sin carrera_id → 400', async () => {
    ;(globalThis as { __testUser?: unknown }).__testUser = { ...coordinadorUser }
    vi.spyOn(RoleService, 'obtenerCoordinadorPorUsuario').mockResolvedValue({
      carrera_id: null,
    } as never)
    const res = await request(app).get('/api/coordinador/dashboard-summary')
    expect(res.status).toBe(400)
  })

  it('C3: error cursos → 500', async () => {
    ;(globalThis as { __testUser?: unknown }).__testUser = { ...coordinadorUser }
    vi.spyOn(RoleService, 'obtenerCoordinadorPorUsuario').mockResolvedValue({
      carrera_id: 1,
    } as never)
    fromMock.mockImplementation(
      queueFrom({ cursos: [{ data: null, error: { message: 'db' } }] })
    )
    const res = await request(app).get('/api/coordinador/dashboard-summary')
    expect(res.status).toBe(500)
  })

  it('C4: error profesores → 500', async () => {
    ;(globalThis as { __testUser?: unknown }).__testUser = { ...coordinadorUser }
    vi.spyOn(RoleService, 'obtenerCoordinadorPorUsuario').mockResolvedValue({
      carrera_id: 1,
    } as never)
    fromMock.mockImplementation(
      queueFrom({
        cursos: [{ data: [{ id: 1 }], error: null }],
        profesores: [{ data: null, error: { message: 'db' } }],
      })
    )
    const res = await request(app).get('/api/coordinador/dashboard-summary')
    expect(res.status).toBe(500)
  })

  it('C5: sin profesores → 200 vacío', async () => {
    ;(globalThis as { __testUser?: unknown }).__testUser = { ...coordinadorUser }
    vi.spyOn(RoleService, 'obtenerCoordinadorPorUsuario').mockResolvedValue({
      carrera_id: 1,
    } as never)
    fromMock.mockImplementation(
      queueFrom({
        cursos: [{ data: [{ id: 1 }], error: null }],
        profesores: [{ data: [], error: null }],
      })
    )
    const res = await request(app).get('/api/coordinador/dashboard-summary')
    expect(res.status).toBe(200)
    expect(res.body.stats.totalProfesores).toBe(0)
    expect(res.body.teachers).toEqual([])
  })

  it('C6a: error usuarios → 500', async () => {
    ;(globalThis as { __testUser?: unknown }).__testUser = { ...coordinadorUser }
    vi.spyOn(RoleService, 'obtenerCoordinadorPorUsuario').mockResolvedValue({
      carrera_id: 1,
    } as never)
    fromMock.mockImplementation(
      queueFrom({
        cursos: [{ data: [{ id: 1 }], error: null }],
        profesores: [{ data: [{ id: 7, usuario_id: 'u1', activo: true }], error: null }],
        usuarios: [{ data: null, error: { message: 'db' } }],
      })
    )
    const res = await request(app).get('/api/coordinador/dashboard-summary')
    expect(res.status).toBe(500)
  })

  it('C6b: error evaluaciones → 500', async () => {
    ;(globalThis as { __testUser?: unknown }).__testUser = { ...coordinadorUser }
    vi.spyOn(RoleService, 'obtenerCoordinadorPorUsuario').mockResolvedValue({
      carrera_id: 1,
    } as never)
    fromMock.mockImplementation(
      queueFrom({
        cursos: [{ data: [{ id: 1 }], error: null }],
        profesores: [{ data: [{ id: 7, usuario_id: 'u1', activo: true }], error: null }],
        usuarios: [{ data: [{ id: 'u1', nombre: 'Ana', apellido: 'P', email: 'a@t.com' }], error: null }],
        evaluaciones: [{ data: null, error: { message: 'db' } }],
      })
    )
    const res = await request(app).get('/api/coordinador/dashboard-summary')
    expect(res.status).toBe(500)
  })

  it('C7: OK → stats + teachers', async () => {
    ;(globalThis as { __testUser?: unknown }).__testUser = { ...coordinadorUser }
    vi.spyOn(RoleService, 'obtenerCoordinadorPorUsuario').mockResolvedValue({
      carrera_id: 1,
    } as never)
    fromMock.mockImplementation(
      queueFrom({
        cursos: [{ data: [{ id: 1 }], error: null }],
        profesores: [{ data: [{ id: 7, usuario_id: 'u1', activo: true }], error: null }],
        usuarios: [{ data: [{ id: 'u1', nombre: 'Ana', apellido: 'Pérez', email: 'a@t.com' }], error: null }],
        evaluaciones: [
          {
            data: [{ profesor_id: 7, calificacion_promedio: 4.2, completada: true }],
            error: null,
          },
        ],
      })
    )
    const res = await request(app).get('/api/coordinador/dashboard-summary')
    expect(res.status).toBe(200)
    expect(res.body.stats.totalProfesores).toBe(1)
    expect(res.body.stats.totalCursos).toBe(1)
    expect(res.body.stats.promedioEvaluaciones).toBe(4.2)
    expect(res.body.teachers[0].nombre).toBe('Ana Pérez')
  })
})
