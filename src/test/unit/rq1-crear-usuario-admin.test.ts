import { describe, expect, it } from 'vitest'
import type { Request, Response } from 'express'
import { authenticateToken, requireRole } from '../../middleware/auth'
import { decidirCreacionUsuario, validarCamposCreacionUsuario } from '../helpers/auth'
import { getBcryptSaltRounds, hashPassword, isBcryptHash } from '../../utils/passwordSecurity'


function fakeRes() {
  const res = {
    statusCode: 0 as number,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code
      return this
    },
    json(payload: unknown) {
      this.body = payload
      return this
    },
  }
  return res
}

function fakeReq(over: Partial<Request> = {}): Request {
  return { headers: {}, body: {}, ...over } as Request
}

const bodyValido = {
  email: 'nuevo@test.com',
  password: 'password123',
  nombre: 'Ana',
  apellido: 'Perez',
  tipo_usuario: 'estudiante',
}

class RQ1CrearUsuarioAdmin {
  // Nodo 2-3: sin token → 401 NO_TOKEN
  async N3_sinToken() {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret'
    const req = fakeReq()
    const res = fakeRes()
    let llamoNext = false
    await authenticateToken(req, res as unknown as Response, () => {
      llamoNext = true
    })
    expect(llamoNext).toBe(false)
    expect(res.statusCode).toBe(401)
    expect(res.body).toMatchObject({ code: 'NO_TOKEN' })
  }

  // Nodo 3-4: token presente pero inválido → 401 TOKEN_INVALID
  async N4_tokenInvalido() {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret'
    const req = fakeReq({ headers: { authorization: 'Bearer token-no-valido' } })
    const res = fakeRes()
    let llamoNext = false
    await authenticateToken(req, res as unknown as Response, () => {
      llamoNext = true
    })
    expect(llamoNext).toBe(false)
    expect(res.statusCode).toBe(401)
    expect(res.body).toMatchObject({ error: 'Token inválido', code: 'TOKEN_INVALID' })
  }

  // Nodo 5-6: usuario autenticado pero sin rol admin → 403 FORBIDDEN_ROLE
  N6_rolNoAdmin() {
    const req = fakeReq({
      user: { roles: ['estudiante'], tipo_usuario: 'estudiante' },
    } as unknown as Partial<Request>)
    const res = fakeRes()
    let llamoNext = false
    requireRole(['admin'])(req, res as unknown as Response, () => {
      llamoNext = true
    })
    expect(llamoNext).toBe(false)
    expect(res.statusCode).toBe(403)
    expect(res.body).toMatchObject({ error: 'Permisos insuficientes', code: 'FORBIDDEN_ROLE' })
  }

  // Nodo 6: requireRole sin req.user → 401 No autenticado
  N6_sinUsuario() {
    const req = fakeReq()
    const res = fakeRes()
    requireRole(['admin'])(req, res as unknown as Response, () => {})
    expect(res.statusCode).toBe(401)
    expect(res.body).toEqual({ error: 'No autenticado' })
  }

  // Nodo 5: usuario admin → continúa
  N5_esAdminContinua() {
    const req = fakeReq({
      user: { roles: ['admin'], tipo_usuario: 'admin' },
    } as unknown as Partial<Request>)
    const res = fakeRes()
    let llamoNext = false
    requireRole(['admin'])(req, res as unknown as Response, () => {
      llamoNext = true
    })
    expect(llamoNext).toBe(true)
    expect(res.statusCode).toBe(0)
  }

  // Nodo 7-9: falta algún campo obligatorio → 400
  N9_camposFaltantes() {
    const { password: _password, ...sinPassword } = bodyValido
    const r = validarCamposCreacionUsuario(sinPassword)
    expect(r.ok).toBe(false)
    expect(r.status).toBe(400)
    expect(r.error).toBe('Todos los campos son requeridos')
  }

  // Nodo 10-11: contraseña de menos de 8 caracteres → 400
  N11_contrasenaCorta() {
    const r = validarCamposCreacionUsuario({ ...bodyValido, password: 'corta12' })
    expect(r.ok).toBe(false)
    expect(r.status).toBe(400)
    expect(r.error).toBe('La contraseña debe tener al menos 8 caracteres')
  }

  // Nodo 12-14: el email ya está registrado → 400
  N14_emailYaRegistrado() {
    const r = decidirCreacionUsuario({
      tieneToken: true,
      tokenValido: true,
      esAdmin: true,
      emailYaExiste: true,
      body: bodyValido,
    })
    expect(r.ok).toBe(false)
    expect(r.status).toBe(400)
    expect(r.error).toBe('El email ya está registrado')
  }

  // Nodo 15: hashPassword usa bcrypt con 12 salt rounds
  async N15_hashBcrypt12() {
    expect(getBcryptSaltRounds()).toBe(12)
    const hash = await hashPassword(bodyValido.password)
    expect(isBcryptHash(hash)).toBe(true)
    expect(hash.startsWith('$2b$12$')).toBe(true)
    expect(hash).not.toBe(bodyValido.password)
  }

  // Nodo 16-17: datos correctos, admin y email libre → 201 Usuario creado
  N17_usuarioCreado() {
    const r = decidirCreacionUsuario({
      tieneToken: true,
      tokenValido: true,
      esAdmin: true,
      emailYaExiste: false,
      body: bodyValido,
    })
    expect(r).toMatchObject({
      ok: true,
      status: 201,
      data: { message: 'Usuario creado exitosamente' },
    })
  }
}

const pruebas = new RQ1CrearUsuarioAdmin()

describe('RQ1 — Crear usuario como administrador', () => {
  it('Nodo 2-3: sin token → 401 NO_TOKEN', () => pruebas.N3_sinToken())
  it('Nodo 3-4: token inválido → 401 TOKEN_INVALID', () => pruebas.N4_tokenInvalido())
  it('Nodo 5-6: rol no admin → 403 FORBIDDEN_ROLE', () => pruebas.N6_rolNoAdmin())
  it('Nodo 6: requireRole sin usuario → 401 No autenticado', () => pruebas.N6_sinUsuario())
  it('Nodo 5: usuario admin → continúa', () => pruebas.N5_esAdminContinua())
  it('Nodo 7-9: campos requeridos faltantes → 400', () => pruebas.N9_camposFaltantes())
  it('Nodo 10-11: contraseña corta → 400', () => pruebas.N11_contrasenaCorta())
  it('Nodo 12-14: email ya registrado → 400', () => pruebas.N14_emailYaRegistrado())
  it('Nodo 15: hashPassword → bcrypt 12 salt rounds', () => pruebas.N15_hashBcrypt12())
  it('Nodo 16-17: usuario creado → 201', () => pruebas.N17_usuarioCreado())
})
