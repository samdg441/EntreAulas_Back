import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { queueFrom } from '../helpers/query-builder'
import { fromMock, supabaseModuleMock } from '../helpers/supabase-mock'
import { adminUser, coordinadorUser } from '../fixtures/users'
import { setTestUser } from '../helpers/test-user'

vi.mock('../../config/supabase-only', () => supabaseModuleMock)
vi.mock('../../config/supabaseClient', () => supabaseModuleMock)
vi.mock('../../middleware/auth', () => import('../helpers/auth-mock'))

vi.mock('../../modules/auth/role.service', () => ({
  RoleService: {
    obtenerCoordinadorPorUsuario: vi.fn(),
  },
}))

import { app } from '../../app'
import { RoleService } from '../../modules/auth/role.service'

/**
 * RQ15 Backend — Generación masiva de QR (POST /batch)
 * C1 grupoIds vacío | C2 IDs no numéricos | C3 coord sin carrera
 * C4 otra carrera skipped | C5 reusa token | C6 sin profesor | C7 crea 201
 */
describe('RQ15 unit — Generación masiva de QR', () => {
  beforeEach(() => {
    fromMock.mockReset()
    setTestUser({ ...adminUser })
    vi.mocked(RoleService.obtenerCoordinadorPorUsuario).mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('C1: grupoIds vacío → 400', async () => {
    const res = await request(app).post('/api/qr-evaluaciones/batch').send({ grupoIds: [] })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/grupoIds/i)
  })

  it('C2: IDs no numéricos → 400', async () => {
    const res = await request(app)
      .post('/api/qr-evaluaciones/batch')
      .send({ grupoIds: ['x'] })
    expect(res.status).toBe(400)
  })

  it('C3: coordinador sin carrera → 403', async () => {
    setTestUser({ ...coordinadorUser })
    vi.mocked(RoleService.obtenerCoordinadorPorUsuario).mockResolvedValue({
      id: 1,
      usuario_id: coordinadorUser.id,
      activo: true,
    } as never)
    const res = await request(app).post('/api/qr-evaluaciones/batch').send({ grupoIds: [1] })
    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/carrera/i)
  })

  it('C4: grupo de otra carrera → skipped', async () => {
    setTestUser({ ...coordinadorUser })
    vi.mocked(RoleService.obtenerCoordinadorPorUsuario).mockResolvedValue({
      id: 1,
      usuario_id: coordinadorUser.id,
      carrera_id: 10,
      activo: true,
    } as never)
    fromMock.mockImplementation(
      queueFrom({
        grupos: [{ data: [{ id: 1, curso_id: 99, profesor_id: 'p1' }], error: null }],
        cursos: [{ data: [{ id: 20 }], error: null }],
        asignaciones_profesor: [{ data: [], error: null }],
        qr_evaluaciones: [{ data: [], error: null }],
      })
    )
    const res = await request(app).post('/api/qr-evaluaciones/batch').send({ grupoIds: [1] })
    expect(res.status).toBe(201)
    expect(res.body.skipped).toEqual(
      expect.arrayContaining([expect.objectContaining({ grupoId: 1 })])
    )
  })

  it('C5: QR existente → reusa token', async () => {
    fromMock.mockImplementation(
      queueFrom({
        grupos: [{ data: [{ id: 7, curso_id: 3, profesor_id: 'p-1' }], error: null }],
        asignaciones_profesor: [
          { data: [{ id: 1, grupo_id: 7, profesor_id: 'p-1', curso_id: 3 }], error: null },
        ],
        qr_evaluaciones: [
          { data: [{ grupo_id: 7, token: 'ya-existe', profesor_id: 'p-1' }], error: null },
        ],
      })
    )
    const res = await request(app).post('/api/qr-evaluaciones/batch').send({ grupoIds: [7] })
    expect(res.status).toBe(201)
    expect(res.body.created).toEqual([{ grupoId: 7, token: 'ya-existe' }])
  })

  it('C6: sin profesor_id → skipped', async () => {
    fromMock.mockImplementation(
      queueFrom({
        grupos: [
          {
            data: [{ id: 5, curso_id: 1, profesor_id: null, asignacion_profesor_id: null }],
            error: null,
          },
        ],
        asignaciones_profesor: [{ data: [], error: null }],
        qr_evaluaciones: [{ data: [], error: null }],
      })
    )
    const res = await request(app).post('/api/qr-evaluaciones/batch').send({ grupoIds: [5] })
    expect(res.status).toBe(201)
    expect(res.body.skipped).toEqual(
      expect.arrayContaining([expect.objectContaining({ grupoId: 5 })])
    )
  })

  it('C7: crea token nuevo → 201', async () => {
    fromMock.mockImplementation(
      queueFrom({
        grupos: [{ data: [{ id: 7, curso_id: 3, profesor_id: 'p-1' }], error: null }],
        asignaciones_profesor: [
          { data: [{ id: 1, grupo_id: 7, profesor_id: 'p-1', curso_id: 3 }], error: null },
        ],
        qr_evaluaciones: [
          { data: [], error: null },
          { data: null, error: null },
        ],
      })
    )
    const res = await request(app).post('/api/qr-evaluaciones/batch').send({ grupoIds: [7] })
    expect(res.status).toBe(201)
    expect(res.body.created[0]).toEqual(
      expect.objectContaining({ grupoId: 7, token: expect.any(String) })
    )
  })
})
