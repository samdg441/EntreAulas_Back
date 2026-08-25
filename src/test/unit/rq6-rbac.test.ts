import { beforeEach, describe, expect, it, vi } from 'vitest'
import jwt from 'jsonwebtoken'
import type { Request, Response, NextFunction } from 'express'
import { supabaseModuleMock } from '../helpers/supabase-mock'

vi.mock('../../config/supabase-only', () => supabaseModuleMock)
vi.mock('../../config/supabaseClient', () => supabaseModuleMock)

vi.mock('../../services/roleService', () => ({
  RoleService: {
    obtenerRolesUsuario: vi.fn(),
    obtenerPermisosUsuario: vi.fn(),
  },
}))

import { authenticateToken, requireRole } from '../../middleware/auth'
import { RoleService } from '../../services/roleService'

function mockRes() {
  const res = { status: vi.fn(), json: vi.fn() }
  res.status.mockReturnValue(res)
  return res as unknown as Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> }
}

/**
 * RQ6 Backend — RBAC (authenticateToken + requireRole)
 * C1 sin Bearer | C2 JWT inválido | C3 usuario inactivo | C4 sin rol | C5 OK
 */
describe('RQ6 unit — Control de acceso por roles', () => {
  const secret = process.env.JWT_SECRET as string

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(RoleService.obtenerRolesUsuario).mockResolvedValue(['admin'])
    vi.mocked(RoleService.obtenerPermisosUsuario).mockResolvedValue(['all'])
  })

  it('C1: sin Bearer → 401 NO_TOKEN', async () => {
    const next = vi.fn() as NextFunction
    const res = mockRes()
    await authenticateToken({ headers: {} } as Request, res, next)
    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({ error: 'Token de acceso requerido', code: 'NO_TOKEN' })
    expect(next).not.toHaveBeenCalled()
  })

  it('C2: JWT inválido → 401 TOKEN_INVALID', async () => {
    const next = vi.fn() as NextFunction
    const res = mockRes()
    await authenticateToken(
      { headers: { authorization: 'Bearer no-es-jwt' } } as Request,
      res,
      next
    )
    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({ error: 'Token inválido', code: 'TOKEN_INVALID' })
  })

  it('C2b: JWT expirado → 401 TOKEN_EXPIRED', async () => {
    const token = jwt.sign({ userId: 'u1' }, secret, { expiresIn: '-10s' })
    const res = mockRes()
    await authenticateToken(
      { headers: { authorization: `Bearer ${token}` } } as Request,
      res,
      vi.fn() as NextFunction
    )
    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({ error: 'Token expirado', code: 'TOKEN_EXPIRED' })
  })

  it('C3: usuario inactivo → 401 USER_INVALID', async () => {
    const token = jwt.sign({ userId: 'u1' }, secret, { expiresIn: '1h' })
    vi.mocked(supabaseModuleMock.SupabaseDB.findUserById).mockResolvedValue({
      id: 'u1',
      activo: false,
    } as never)
    const next = vi.fn() as NextFunction
    const res = mockRes()
    await authenticateToken(
      { headers: { authorization: `Bearer ${token}` } } as Request,
      res,
      next
    )
    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({
      error: 'Usuario no válido o inactivo',
      code: 'USER_INVALID',
    })
    expect(next).not.toHaveBeenCalled()
  })

  it('C4: autenticado sin rol → 403 FORBIDDEN_ROLE', () => {
    const req = {
      user: { id: 'u1', email: 'a@a.com', tipo_usuario: 'estudiante', roles: ['estudiante'] },
    } as Request
    const res = mockRes()
    const next = vi.fn() as NextFunction
    requireRole(['admin', 'coordinador'])(req, res, next)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.json).toHaveBeenCalledWith({
      error: 'Permisos insuficientes',
      code: 'FORBIDDEN_ROLE',
    })
    expect(next).not.toHaveBeenCalled()
  })

  it('C5: JWT + activo + rol → next()', async () => {
    const token = jwt.sign({ userId: 'u1' }, secret, { expiresIn: '1h' })
    vi.mocked(supabaseModuleMock.SupabaseDB.findUserById).mockResolvedValue({
      id: 'u1',
      email: 'admin@test.com',
      tipo_usuario: 'admin',
      activo: true,
    } as never)
    vi.mocked(RoleService.obtenerRolesUsuario).mockResolvedValue(['admin'])
    const req = { headers: { authorization: `Bearer ${token}` } } as Request
    const res = mockRes()
    const nextAuth = vi.fn() as NextFunction
    await authenticateToken(req, res, nextAuth)
    expect(nextAuth).toHaveBeenCalledOnce()
    const nextRole = vi.fn() as NextFunction
    requireRole(['admin'])(req, res, nextRole)
    expect(nextRole).toHaveBeenCalledOnce()
  })
})
