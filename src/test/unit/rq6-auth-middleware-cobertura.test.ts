import { beforeEach, describe, expect, it, vi } from 'vitest'
import jwt from 'jsonwebtoken'
import type { Request, Response, NextFunction } from 'express'
import { fromMock, supabaseModuleMock } from '../helpers/supabase-mock'

vi.mock('../../config/supabase-only', () => supabaseModuleMock)
vi.mock('../../config/supabaseClient', () => supabaseModuleMock)

import { authenticateToken, requirePermission, requireRole } from '../../middleware/auth'
import { RoleService } from '../../services/roleService'

const findUserById = supabaseModuleMock.SupabaseDB.findUserById as ReturnType<typeof vi.fn>

function httpCapturado() {
  const capturado = { statusCode: 0, body: null as unknown, next: false }
  const res = {
    status(code: number) {
      capturado.statusCode = code
      return this
    },
    json(body: unknown) {
      capturado.body = body
      return this
    },
  }
  const next = () => {
    capturado.next = true
  }
  return { res: res as unknown as Response, next: next as NextFunction, capturado }
}

function reqConAuth(authorization?: string) {
  return { headers: { authorization }, user: undefined } as unknown as Request
}

describe('RQ6 — authenticateToken / requireRole', () => {
  beforeEach(() => {
    fromMock.mockReset()
    findUserById.mockReset()
    vi.restoreAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret'
  })

  it('sin header Authorization → 401', async () => {
    const { res, next, capturado } = httpCapturado()
    await authenticateToken(reqConAuth(undefined), res, next)
    expect(capturado.statusCode).toBe(401)
    expect((capturado.body as { code: string }).code).toBe('NO_TOKEN')
  })

  it('JWT inválido → 401', async () => {
    const { res, next, capturado } = httpCapturado()
    await authenticateToken(reqConAuth('Bearer no-es-jwt'), res, next)
    expect(capturado.statusCode).toBe(401)
  })

  it('JWT sin userId → 401', async () => {
    const token = jwt.sign({ email: 'x@test.com' }, process.env.JWT_SECRET as string)
    const { res, next, capturado } = httpCapturado()
    await authenticateToken(reqConAuth(`Bearer ${token}`), res, next)
    expect(capturado.statusCode).toBe(401)
  })

  it('token válido y usuario activo → next', async () => {
    const token = jwt.sign({ userId: 'u-ok' }, process.env.JWT_SECRET as string)
    findUserById.mockResolvedValueOnce({
      id: 'u-ok',
      email: 'ok@test.com',
      tipo_usuario: 'admin',
      activo: true,
    })
    vi.spyOn(RoleService, 'obtenerRolesUsuario').mockResolvedValue(['admin'])
    vi.spyOn(RoleService, 'obtenerPermisosUsuario').mockResolvedValue(['all'])
    const req = reqConAuth(`Bearer ${token}`)
    const { res, next, capturado } = httpCapturado()
    await authenticateToken(req, res, next)
    expect(capturado.next).toBe(true)
    expect(req.user?.id).toBe('u-ok')
  })

  it('requireRole: sin usuario → 401', () => {
    const { res, next, capturado } = httpCapturado()
    requireRole(['admin'])({} as Request, res, next)
    expect(capturado.statusCode).toBe(401)
  })

  it('requireRole: coincide por tipo_usuario', () => {
    const { res, next, capturado } = httpCapturado()
    const req = { user: { id: 'u1', tipo_usuario: 'coordinador' } } as Request
    requireRole(['coordinador'])(req, res, next)
    expect(capturado.next).toBe(true)
  })

  it('requireRole: rol no coincide → 403', () => {
    const { res, next, capturado } = httpCapturado()
    const req = { user: { id: 'u1', tipo_usuario: 'estudiante', roles: ['estudiante'] } } as Request
    requireRole(['admin'])(req, res, next)
    expect(capturado.statusCode).toBe(403)
  })

  it('requirePermission: sin el permiso → 403', () => {
    const { res, next, capturado } = httpCapturado()
    const req = { user: { id: 'u1', permisos: ['view_evaluations'] } } as Request
    requirePermission('manage_users')(req, res, next)
    expect(capturado.statusCode).toBe(403)
    expect(capturado.next).toBe(false)
  })

  it('JWT expirado → 401', async () => {
    const token = jwt.sign({ userId: 'u-exp' }, process.env.JWT_SECRET as string, { expiresIn: '-1s' })
    const { res, next, capturado } = httpCapturado()
    await authenticateToken(reqConAuth(`Bearer ${token}`), res, next)
    expect(capturado.statusCode).toBe(401)
    expect((capturado.body as { code: string }).code).toBe('TOKEN_EXPIRED')
  })

  it('requirePermission: permiso all → next', () => {
    const { res, next, capturado } = httpCapturado()
    const req = { user: { id: 'u1', permisos: ['all'] } } as Request
    requirePermission('manage_users')(req, res, next)
    expect(capturado.next).toBe(true)
  })
})
