import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { queueFrom } from '../helpers/query-builder'
import { fromMock, supabaseModuleMock } from '../helpers/supabase-mock'
import { coordinadorUser, estudianteUser, profesorUser, adminUser } from '../fixtures/users'

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
 * RQ24 Backend — Resumen coordinador
 * C1 403 | C1b profesor/admin 403 | C2 400 | C3–C6b 500
 * C5 vacío | C7 OK | C8 search | C9 filtra carrera
 */
describe('RQ24 unit — Ver resumen del coordinador', () => {
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

  it('C1b: profesor y admin → 403', async () => {
    for (const user of [profesorUser, adminUser]) {
      ;(globalThis as { __testUser?: unknown }).__testUser = { ...user }
      const res = await request(app).get('/api/coordinador/dashboard-summary')
      expect(res.status).toBe(403)
    }
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

  it('C8: search filtra la lista y deja las stats de la carrera', async () => {
    ;(globalThis as { __testUser?: unknown }).__testUser = { ...coordinadorUser }
    vi.spyOn(RoleService, 'obtenerCoordinadorPorUsuario').mockResolvedValue({
      carrera_id: 1,
    } as never)
    fromMock.mockImplementation(
      queueFrom({
        cursos: [{ data: [{ id: 1 }], error: null }],
        profesores: [
          {
            data: [
              { id: 7, usuario_id: 'u1', activo: true },
              { id: 8, usuario_id: 'u2', activo: true },
            ],
            error: null,
          },
        ],
        usuarios: [
          {
            data: [
              { id: 'u1', nombre: 'Ana', apellido: 'Pérez', email: 'ana@t.com' },
              { id: 'u2', nombre: 'Luis', apellido: 'Gómez', email: 'luis@t.com' },
            ],
            error: null,
          },
        ],
        evaluaciones: [
          {
            data: [
              { profesor_id: 7, calificacion_promedio: 4.2, completada: true },
              { profesor_id: 8, calificacion_promedio: 3.1, completada: true },
            ],
            error: null,
          },
        ],
      })
    )
    const res = await request(app).get('/api/coordinador/dashboard-summary?search=ana')
    expect(res.status).toBe(200)
    expect(res.body.teachers.map((t: { nombre: string }) => t.nombre)).toEqual(['Ana Pérez'])
    expect(res.body.pagination.total).toBe(1)
    expect(res.body.stats.totalProfesores).toBe(2)
  })

  it('C8b: search sin coincidencias → lista vacía, no lanza', async () => {
    ;(globalThis as { __testUser?: unknown }).__testUser = { ...coordinadorUser }
    vi.spyOn(RoleService, 'obtenerCoordinadorPorUsuario').mockResolvedValue({
      carrera_id: 1,
    } as never)
    fromMock.mockImplementation(
      queueFrom({
        cursos: [{ data: [{ id: 1 }], error: null }],
        profesores: [
          {
            data: [{ id: 7, usuario_id: 'u1', activo: true }],
            error: null,
          },
        ],
        usuarios: [
          { data: [{ id: 'u1', nombre: 'Ana', apellido: 'Pérez', email: 'ana@t.com' }], error: null },
        ],
        evaluaciones: [
          { data: [{ profesor_id: 7, calificacion_promedio: 4.2, completada: true }], error: null },
        ],
      })
    )
    const res = await request(app).get('/api/coordinador/dashboard-summary?search=zzz')
    expect(res.status).toBe(200)
    expect(res.body.teachers).toEqual([])
    expect(res.body.pagination.total).toBe(0)
  })

  it('C9: consulta cursos y profesores por carrera_id', async () => {
    ;(globalThis as { __testUser?: unknown }).__testUser = { ...coordinadorUser }
    vi.spyOn(RoleService, 'obtenerCoordinadorPorUsuario').mockResolvedValue({
      carrera_id: 1,
    } as never)
    const builders: Array<{ table: string; eq: { mock: { calls: unknown[][] } } }> = []
    const next = queueFrom({
      cursos: [{ data: [{ id: 1 }], error: null }],
      profesores: [{ data: [], error: null }],
    })
    fromMock.mockImplementation((table: string) => {
      const b = next(table) as { eq: { mock: { calls: unknown[][] } } }
      builders.push({ table, eq: b.eq })
      return b
    })
    const res = await request(app).get('/api/coordinador/dashboard-summary')
    expect(res.status).toBe(200)
    const cursosEq = builders.find((b) => b.table === 'cursos')!.eq.mock.calls
    const profesEq = builders.find((b) => b.table === 'profesores')!.eq.mock.calls
    expect(cursosEq).toContainEqual(['carrera_id', 1])
    expect(profesEq).toContainEqual(['carrera_id', 1])
  })

  it('C10: evaluaciones en 0 o negativas no entran al promedio', async () => {
    ;(globalThis as { __testUser?: unknown }).__testUser = { ...coordinadorUser }
    vi.spyOn(RoleService, 'obtenerCoordinadorPorUsuario').mockResolvedValue({
      carrera_id: 1,
    } as never)
    fromMock.mockImplementation(
      queueFrom({
        cursos: [{ data: [{ id: 1 }], error: null }],
        profesores: [{ data: [{ id: 7, usuario_id: 'u1', activo: true }], error: null }],
        usuarios: [{ data: [{ id: 'u1', nombre: 'A', apellido: 'B', email: 'a@t.com' }], error: null }],
        evaluaciones: [
          {
            data: [
              { profesor_id: 7, calificacion_promedio: 0, completada: true },
              { profesor_id: 7, calificacion_promedio: -2, completada: true },
            ],
            error: null,
          },
        ],
      })
    )
    const res = await request(app).get('/api/coordinador/dashboard-summary')
    expect(res.status).toBe(200)
    expect(res.body.stats.promedioEvaluaciones).toBe(0)
    expect(res.body.stats.totalEvaluaciones).toBe(0)
  })
})
