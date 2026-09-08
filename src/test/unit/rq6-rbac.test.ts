import { describe, expect, it } from 'vitest'
import jwt from 'jsonwebtoken'
import type { Request, Response, NextFunction } from 'express'
import { extraerBearer, usuarioPuedeAutenticarse, usuarioTieneAlgunRol } from '../helpers/rbac'
import { requireRole } from '../../middleware/auth'

function respuestaCapturada() {
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

class RQ6Rbac {
  C1_sinBearer() {
    expect(extraerBearer(undefined)).toBeNull()
    expect(extraerBearer('Basic abc')).toBeNull()
  }

  C2_jwtInvalido() {
    expect(() => jwt.verify('no-es-jwt', process.env.JWT_SECRET as string)).toThrow()
  }

  C2b_jwtExpirado() {
    const token = jwt.sign({ userId: 'u1' }, process.env.JWT_SECRET as string, { expiresIn: '-10s' })
    expect(() => jwt.verify(token, process.env.JWT_SECRET as string)).toThrow(jwt.TokenExpiredError)
  }

  C3_usuarioInactivo() {
    expect(usuarioPuedeAutenticarse({ activo: false })).toBe(false)
    expect(usuarioPuedeAutenticarse(null)).toBe(false)
    expect(usuarioPuedeAutenticarse({ activo: true })).toBe(true)
  }

  C4_autenticadoSinRol() {
    const { res, next, capturado } = respuestaCapturada()
    const req = {
      user: { id: 'u1', email: 'a@a.com', tipo_usuario: 'estudiante', roles: ['estudiante'] },
    } as Request
    requireRole(['admin', 'coordinador'])(req, res, next)
    expect(capturado.statusCode).toBe(403)
    expect(capturado.body).toEqual({ error: 'Permisos insuficientes', code: 'FORBIDDEN_ROLE' })
    expect(capturado.next).toBe(false)
    expect(usuarioTieneAlgunRol(req.user, ['admin', 'coordinador'])).toBe(false)
  }

  C5_conRolPasa() {
    const { res, next, capturado } = respuestaCapturada()
    const req = {
      user: { id: 'u1', email: 'admin@test.com', tipo_usuario: 'admin', roles: ['admin'] },
    } as Request
    requireRole(['admin'])(req, res, next)
    expect(capturado.next).toBe(true)
    expect(capturado.statusCode).toBe(0)
    expect(usuarioTieneAlgunRol(req.user, ['admin'])).toBe(true)
  }
}

const pruebas = new RQ6Rbac()

describe('RQ6 — Control de acceso por roles', () => {
  it('C1: sin Bearer → no hay token', () => pruebas.C1_sinBearer())
  it('C2: JWT inválido', () => pruebas.C2_jwtInvalido())
  it('C2b: JWT expirado', () => pruebas.C2b_jwtExpirado())
  it('C3: usuario inactivo no se autentica', () => pruebas.C3_usuarioInactivo())
  it('C4: autenticado sin rol → 403', () => pruebas.C4_autenticadoSinRol())
  it('C5: con rol permitido → continua', () => pruebas.C5_conRolPasa())
})
