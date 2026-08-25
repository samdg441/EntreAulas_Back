import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { supabaseModuleMock } from '../helpers/supabase-mock'
import { adminUser, estudianteUser } from '../fixtures/users'

vi.mock('../../config/supabase-only', () => supabaseModuleMock)
vi.mock('../../config/supabaseClient', () => supabaseModuleMock)

vi.mock('../../services/roleService', () => ({
  RoleService: {
    obtenerRolesUsuario: vi.fn(),
    obtenerPermisosUsuario: vi.fn(),
  },
}))

import { app } from '../../app'
import { RoleService } from '../../services/roleService'

/** RQ6 integración: contrato HTTP 401 / 403 / pasa auth (400 de negocio). */
describe('RQ6 integration — RBAC sobre ruta protegida', () => {
  const secret = process.env.JWT_SECRET as string

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(RoleService.obtenerPermisosUsuario).mockResolvedValue([])
  })

  it('C1: sin JWT → 401 NO_TOKEN', async () => {
    const res = await request(app).post('/api/qr-evaluaciones/batch').send({ grupoIds: [1] })
    expect(res.status).toBe(401)
    expect(res.body.code).toBe('NO_TOKEN')
  })

  it('C4: JWT de estudiante en /batch → 403 FORBIDDEN_ROLE', async () => {
    vi.mocked(supabaseModuleMock.SupabaseDB.findUserById).mockResolvedValue({
      ...estudianteUser,
      activo: true,
    } as never)
    vi.mocked(RoleService.obtenerRolesUsuario).mockResolvedValue(['estudiante'])
    const token = jwt.sign({ userId: estudianteUser.id }, secret, { expiresIn: '1h' })
    const res = await request(app)
      .post('/api/qr-evaluaciones/batch')
      .set('Authorization', `Bearer ${token}`)
      .send({ grupoIds: [1] })
    expect(res.status).toBe(403)
    expect(res.body.code).toBe('FORBIDDEN_ROLE')
  })

  it('C5: JWT admin pasa auth; grupoIds vacío → 400', async () => {
    vi.mocked(supabaseModuleMock.SupabaseDB.findUserById).mockResolvedValue({
      ...adminUser,
      activo: true,
    } as never)
    vi.mocked(RoleService.obtenerRolesUsuario).mockResolvedValue(['admin'])
    const token = jwt.sign({ userId: adminUser.id }, secret, { expiresIn: '1h' })
    const res = await request(app)
      .post('/api/qr-evaluaciones/batch')
      .set('Authorization', `Bearer ${token}`)
      .send({ grupoIds: [] })
    expect(res.status).not.toBe(401)
    expect(res.status).not.toBe(403)
    expect(res.status).toBe(400)
  })
})
