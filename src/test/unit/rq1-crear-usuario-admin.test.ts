import { describe, expect, it } from 'vitest'
import { decidirCreacionUsuario, validarCamposCreacionUsuario } from '../helpers/auth'
import { hashPassword, isBcryptHash } from '../../utils/passwordSecurity'

const bodyValido = {
  email: 'nuevo@test.com',
  password: 'password123',
  nombre: 'Ana',
  apellido: 'Perez',
  tipo_usuario: 'estudiante',
}

class RQ1CrearUsuarioAdmin {
  C1_camposFaltantes() {
    const { password: _p, ...sinPassword } = bodyValido
    const r = validarCamposCreacionUsuario(sinPassword)
    expect(r.ok).toBe(false)
    expect(r.status).toBe(400)
    expect(r.error).toBe('Todos los campos son requeridos')
  }

  C2_contrasenaCorta() {
    const r = validarCamposCreacionUsuario({ ...bodyValido, password: 'short1' })
    expect(r.ok).toBe(false)
    expect(r.status).toBe(400)
    expect(r.error).toBe('La contraseña debe tener al menos 8 caracteres')
  }

  C3_emailYaRegistrado() {
    const r = decidirCreacionUsuario({
      tieneToken: true,
      tokenValido: true,
      esAdmin: true,
      emailYaExiste: true,
      body: bodyValido,
    })
    expect(r.status).toBe(400)
    expect(r.error).toBe('El email ya está registrado')
  }

  async C4_caminoIdeal() {
    const r = decidirCreacionUsuario({
      tieneToken: true,
      tokenValido: true,
      esAdmin: true,
      emailYaExiste: false,
      body: bodyValido,
    })
    expect(r.ok).toBe(true)
    expect(r.status).toBe(201)
    expect(r.data).toEqual({ message: 'Usuario creado exitosamente' })
    const hash = await hashPassword(bodyValido.password)
    expect(isBcryptHash(hash)).toBe(true)
  }

  C5_rolNoAdmin() {
    const r = decidirCreacionUsuario({
      tieneToken: true,
      tokenValido: true,
      esAdmin: false,
      emailYaExiste: false,
      body: bodyValido,
    })
    expect(r.status).toBe(403)
    expect(r.code).toBe('FORBIDDEN_ROLE')
  }

  C6_tokenInvalido() {
    const r = decidirCreacionUsuario({
      tieneToken: true,
      tokenValido: false,
      esAdmin: true,
      emailYaExiste: false,
      body: bodyValido,
    })
    expect(r.status).toBe(401)
    expect(r.code).toBe('TOKEN_INVALID')
  }

  C7_errorInterno() {
    const r = decidirCreacionUsuario({
      tieneToken: true,
      tokenValido: true,
      esAdmin: true,
      emailYaExiste: false,
      errorInterno: true,
      body: bodyValido,
    })
    expect(r.status).toBe(500)
    expect(r.error).toBe('Error interno del servidor')
  }

  C8_sinToken() {
    const r = decidirCreacionUsuario({
      tieneToken: false,
      tokenValido: false,
      esAdmin: false,
      emailYaExiste: false,
      body: bodyValido,
    })
    expect(r.status).toBe(401)
    expect(r.code).toBe('NO_TOKEN')
  }

  C9_correoInvalido() {
    const r = validarCamposCreacionUsuario({ ...bodyValido, email: 'no-es-correo' })
    expect(r.ok).toBe(false)
    expect(r.status).toBe(400)
    expect(r.error).toBe('Correo inválido')
  }
}

const pruebas = new RQ1CrearUsuarioAdmin()

describe('RQ1 — Crear usuario como administrador', () => {
  it('C1: campos requeridos faltantes → 400', () => pruebas.C1_camposFaltantes())
  it('C2: contraseña corta → 400', () => pruebas.C2_contrasenaCorta())
  it('C3: email ya registrado → 400', () => pruebas.C3_emailYaRegistrado())
  it('C4: camino ideal → 201', () => pruebas.C4_caminoIdeal())
  it('C5: no es admin → 403', () => pruebas.C5_rolNoAdmin())
  it('C6: token inválido → 401', () => pruebas.C6_tokenInvalido())
  it('C7: error interno → 500', () => pruebas.C7_errorInterno())
  it('C8: sin token → 401', () => pruebas.C8_sinToken())
  it('C9: correo inválido → 400', () => pruebas.C9_correoInvalido())
})
