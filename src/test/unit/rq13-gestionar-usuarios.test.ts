import { describe, expect, it } from 'vitest'
import type { Request, Response } from 'express'
import { authenticateToken, requireRole } from '../../middleware/auth'
import { getBcryptSaltRounds, hashPassword, isBcryptHash } from '../../utils/passwordSecurity'
import {
  BODY_ALTA_VALIDO,
  decidirActualizacionUsuario,
  decidirCreacionUsuario,
  decidirDesactivacionUsuario,
  usuarioSinPassword,
  validarActualizacionUsuario,
  validarCamposCreacionUsuario,
} from '../helpers/gestionar-usuarios'

/**
 * RQ13 — Gestionar usuarios
 * POST /api/auth/create-user · PUT /api/users/:id · DELETE /api/users/:id
 *
 *  3-5  JWT / rol admin → 401 o 403
 *  6-10 Alta: validar campos / 400 o hash + 201
 * 11-15 Cambio: validar id/campos / 400-404 o 200
 * 16-17 Desactivar: no sí mismo / 400-404 o soft-delete 200
 */

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

class RQ13GestionarUsuarios {
  // Nodo 3-5: sin JWT → 401
  async N5_sinToken() {
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

  // Nodo 3-5: autenticado pero no admin → 403
  N5_noEsAdmin() {
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

  // Nodo 3-5: admin autenticado continúa
  N4_adminContinua() {
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

  // Nodo 7-9: campos faltantes → 400, no se persiste
  N9_camposFaltantes() {
    const { password: _p, ...sinPassword } = BODY_ALTA_VALIDO
    const r = validarCamposCreacionUsuario(sinPassword)
    expect(r.ok).toBe(false)
    expect(r.status).toBe(400)
    expect(r.error).toBe('Todos los campos son requeridos')
  }

  // Nodo 7-9: password < 8 → 400
  N9_passwordCorta() {
    const r = validarCamposCreacionUsuario({ ...BODY_ALTA_VALIDO, password: 'corta12' })
    expect(r.ok).toBe(false)
    expect(r.status).toBe(400)
    expect(r.error).toBe('La contraseña debe tener al menos 8 caracteres')
  }

  // Nodo 7-9: email duplicado → 400
  N9_emailDuplicado() {
    const r = decidirCreacionUsuario({
      tieneToken: true,
      tokenValido: true,
      esAdmin: true,
      emailYaExiste: true,
      body: BODY_ALTA_VALIDO,
    })
    expect(r.ok).toBe(false)
    expect(r.status).toBe(400)
    expect(r.error).toBe('El email ya está registrado')
  }

  // Nodo 10: hash bcrypt 12 rounds
  async N10_hashPassword() {
    expect(getBcryptSaltRounds()).toBe(12)
    const hash = await hashPassword(BODY_ALTA_VALIDO.password)
    expect(isBcryptHash(hash)).toBe(true)
    expect(hash.startsWith('$2b$12$')).toBe(true)
    expect(hash).not.toBe(BODY_ALTA_VALIDO.password)
  }

  // Nodo 10: alta válida → 201 sin devolver password
  N10_usuarioCreado() {
    const r = decidirCreacionUsuario({
      tieneToken: true,
      tokenValido: true,
      esAdmin: true,
      emailYaExiste: false,
      body: BODY_ALTA_VALIDO,
    })
    expect(r).toMatchObject({
      ok: true,
      status: 201,
      data: { message: 'Usuario creado exitosamente' },
    })
    const publico = usuarioSinPassword({
      ...BODY_ALTA_VALIDO,
      id: 'u-1',
      activo: true,
    })
    expect(publico).not.toHaveProperty('password')
    expect(publico).toMatchObject({
      email: 'nuevo@test.com',
      nombre: 'Ana',
      tipo_usuario: 'estudiante',
    })
  }

  // Nodo 12-14: PUT sin id → 400
  N14_putSinId() {
    const r = validarActualizacionUsuario({ id: '', existe: true, nombre: 'Ana' })
    expect(r.status).toBe(400)
    expect(r.error).toBe('ID de usuario requerido')
  }

  // Nodo 12-14: usuario no existe → 404
  N14_putNoExiste() {
    const r = decidirActualizacionUsuario({
      autenticado: true,
      esAdmin: true,
      id: 'u-404',
      existe: false,
      nombre: 'Ana',
    })
    expect(r.status).toBe(404)
    expect(r.error).toBe('Usuario no encontrado')
  }

  // Nodo 12-14: tipo_usuario inválido → 400
  N14_tipoInvalido() {
    const r = validarActualizacionUsuario({
      id: 'u-1',
      existe: true,
      tipo_usuario: 'invitado',
    })
    expect(r.status).toBe(400)
    expect(r.error).toBe('tipo_usuario inválido')
  }

  // Nodo 12-14: password corta al actualizar → 400
  N14_putPasswordCorta() {
    const r = validarActualizacionUsuario({
      id: 'u-1',
      existe: true,
      password: 'corta',
    })
    expect(r.status).toBe(400)
    expect(r.error).toBe('La contraseña debe tener al menos 8 caracteres')
  }

  // Nodo 12-14: body vacío → 400
  N14_sinCampos() {
    const r = validarActualizacionUsuario({ id: 'u-1', existe: true })
    expect(r.status).toBe(400)
    expect(r.error).toBe('No hay campos para actualizar')
  }

  // Nodo 12-14: email de otro usuario → 400
  N14_emailConflicto() {
    const r = decidirActualizacionUsuario({
      autenticado: true,
      esAdmin: true,
      id: 'u-1',
      existe: true,
      email: 'ya@existe.com',
      emailDeOtro: true,
    })
    expect(r.status).toBe(400)
    expect(r.error).toBe('El email ya está registrado')
  }

  // Nodo 15: PUT válido → 200 Usuario actualizado
  N15_usuarioActualizado() {
    const r = decidirActualizacionUsuario({
      autenticado: true,
      esAdmin: true,
      id: 'u-1',
      existe: true,
      email: '  ANA@UNI.EDU  ',
      nombre: 'Ana María',
      tipo_usuario: 'profesor',
    })
    expect(r.ok).toBe(true)
    expect(r.status).toBe(200)
    expect(r.data?.message).toBe('Usuario actualizado')
    expect(r.data?.user.email).toBe('ana@uni.edu')
    expect(r.data?.user.nombre).toBe('Ana María')
  }

  // Nodo 16-14: DELETE id inexistente → 404, sigue activo
  N14_deleteNoExiste() {
    const r = decidirDesactivacionUsuario({
      autenticado: true,
      esAdmin: true,
      id: 'u-404',
      existe: false,
    })
    expect(r.status).toBe(404)
    expect(r.error).toBe('Usuario no encontrado')
    expect(r.data).toBeUndefined()
  }

  // Nodo 16-14: admin se desactiva a sí mismo → 400
  N14_autoDesactivacion() {
    const r = decidirDesactivacionUsuario({
      autenticado: true,
      esAdmin: true,
      id: 'admin-1',
      existe: true,
      adminId: 'admin-1',
    })
    expect(r.status).toBe(400)
    expect(r.error).toBe('No puedes desactivar tu propia cuenta')
  }

  // Nodo 16-17: DELETE a otro usuario → 200, activo=false
  N17_desactivado() {
    const r = decidirDesactivacionUsuario({
      autenticado: true,
      esAdmin: true,
      id: 'u-9',
      existe: true,
      adminId: 'admin-1',
    })
    expect(r.ok).toBe(true)
    expect(r.status).toBe(200)
    expect(r.data).toEqual({
      message: 'Usuario desactivado',
      user: { activo: false },
    })
  }

  FALLA_N5_sinAdminSeEspera201() {
    const r = decidirCreacionUsuario({
      tieneToken: true,
      tokenValido: true,
      esAdmin: false,
      emailYaExiste: false,
      body: BODY_ALTA_VALIDO,
    })
    expect(r.status).toBe(201)
  }

  FALLA_N9_emailDuplicadoSeEspera201() {
    const r = decidirCreacionUsuario({
      tieneToken: true,
      tokenValido: true,
      esAdmin: true,
      emailYaExiste: true,
      body: BODY_ALTA_VALIDO,
    })
    expect(r.status).toBe(201)
  }

  FALLA_N14_tipoInvalidoSeEspera200() {
    const r = decidirActualizacionUsuario({
      autenticado: true,
      esAdmin: true,
      id: 'u-1',
      existe: true,
      tipo_usuario: 'invitado',
    })
    expect(r.status).toBe(200)
  }

  FALLA_N14_autoDesactivarSeEspera200() {
    const r = decidirDesactivacionUsuario({
      autenticado: true,
      esAdmin: true,
      id: 'admin-1',
      existe: true,
      adminId: 'admin-1',
    })
    expect(r.status).toBe(200)
    expect(r.data?.user.activo).toBe(false)
  }
}

const pruebas = new RQ13GestionarUsuarios()

describe('RQ13 — Gestionar usuarios', () => {
  it('Nodo 3-5: sin JWT → 401', () => pruebas.N5_sinToken())
  it('Nodo 3-5: no es admin → 403', () => pruebas.N5_noEsAdmin())
  it('Nodo 3-4: admin autenticado continúa', () => pruebas.N4_adminContinua())
  it('Nodo 7-9: campos faltantes → 400', () => pruebas.N9_camposFaltantes())
  it('Nodo 7-9: password corta → 400', () => pruebas.N9_passwordCorta())
  it('Nodo 7-9: email duplicado → 400', () => pruebas.N9_emailDuplicado())
  it('Nodo 10: password se hashea con bcrypt 12', () => pruebas.N10_hashPassword())
  it('Nodo 10: alta válida → 201 sin password', () => pruebas.N10_usuarioCreado())
  it('Nodo 12-14: PUT sin id → 400', () => pruebas.N14_putSinId())
  it('Nodo 12-14: PUT usuario inexistente → 404', () => pruebas.N14_putNoExiste())
  it('Nodo 12-14: tipo_usuario inválido → 400', () => pruebas.N14_tipoInvalido())
  it('Nodo 12-14: password corta al actualizar → 400', () => pruebas.N14_putPasswordCorta())
  it('Nodo 12-14: sin campos → 400', () => pruebas.N14_sinCampos())
  it('Nodo 12-14: email en conflicto → 400', () => pruebas.N14_emailConflicto())
  it('Nodo 15: PUT válido → 200', () => pruebas.N15_usuarioActualizado())
  it('Nodo 16-14: DELETE inexistente → 404', () => pruebas.N14_deleteNoExiste())
  it('Nodo 16-14: auto-desactivación → 400', () => pruebas.N14_autoDesactivacion())
  it('Nodo 16-17: DELETE a otro → 200 activo=false', () => pruebas.N17_desactivado())
  it('FALLA N5: no admin — se espera (mal) 201', () => pruebas.FALLA_N5_sinAdminSeEspera201())
  it('FALLA N9: email duplicado — se espera (mal) 201', () => pruebas.FALLA_N9_emailDuplicadoSeEspera201())
  it('FALLA N14: tipo inválido — se espera (mal) 200', () => pruebas.FALLA_N14_tipoInvalidoSeEspera200())
  it('FALLA N14: auto-desactivar — se espera (mal) 200', () =>
    pruebas.FALLA_N14_autoDesactivarSeEspera200())
})
