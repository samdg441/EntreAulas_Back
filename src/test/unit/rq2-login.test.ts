import { describe, expect, it } from 'vitest'
import { decidirLogin, descripcionRol, normalizarTipoUsuario, validarDatosLogin } from '../helpers/auth'
import { dashboardParaUsuario } from '../helpers/dashboard'
import { hashPassword, verifyStoredPassword } from '../../utils/passwordSecurity'

const credenciales = { email: 'user@test.com', password: 'password123' }
const usuarioActivo = { activo: true, tipo_usuario: 'estudiante' }

class RQ2Login {
  C1_usuarioNoExiste() {
    const r = decidirLogin({ usuario: null, passwordOk: false, roles: [] })
    expect(r.status).toBe(401)
    expect(r.error).toBe('Credenciales inválidas')
  }

  C2_usuarioInactivo() {
    const r = decidirLogin({
      usuario: { ...usuarioActivo, activo: false },
      passwordOk: true,
      roles: ['estudiante'],
    })
    expect(r.status).toBe(401)
    expect(r.error).toBe('Credenciales inválidas')
  }

  async C3_contrasenaIncorrecta() {
    const hash = await hashPassword('otra-clave')
    const check = await verifyStoredPassword(credenciales.password, hash)
    expect(check.ok).toBe(false)
    const r = decidirLogin({ usuario: usuarioActivo, passwordOk: check.ok, roles: ['estudiante'] })
    expect(r.status).toBe(401)
  }

  C4_tipoNoValido() {
    const r = decidirLogin({
      usuario: { activo: true, tipo_usuario: 'invitado' },
      passwordOk: true,
      roles: [],
    })
    expect(r.status).toBe(401)
    expect(r.error).toBe('Tipo de usuario no válido')
  }

  async C5_loginExitosoUnRol() {
    const hash = await hashPassword(credenciales.password)
    const check = await verifyStoredPassword(credenciales.password, hash)
    expect(check.ok).toBe(true)
    const r = decidirLogin({ usuario: usuarioActivo, passwordOk: true, roles: ['estudiante'] })
    expect(r.status).toBe(200)
    expect(r.data).toEqual({ message: 'Login exitoso' })
    expect(dashboardParaUsuario(['estudiante'])).toBe('/dashboard-estudiante')
    expect(descripcionRol('estudiante')).toBe('Estudiante del sistema')
  }

  C6_multiplesRoles() {
    const r = decidirLogin({
      usuario: usuarioActivo,
      passwordOk: true,
      roles: ['estudiante', 'profesor'],
    })
    expect(r.status).toBe(200)
    expect(r.data).toEqual({
      message: 'Usuario con múltiples roles detectado',
      requires_role_selection: true,
      available_roles: ['estudiante', 'profesor'],
    })
  }

  C8_bodyInvalido() {
    const r = validarDatosLogin({ email: 'no-es-un-email' })
    expect(r.status).toBe(400)
    expect(r.error).toBe('Datos inválidos')
    expect(Array.isArray(r.details)).toBe(true)
  }

  C9_errorInterno() {
    const r = decidirLogin({
      usuario: usuarioActivo,
      passwordOk: true,
      roles: ['estudiante'],
      errorInterno: true,
    })
    expect(r.status).toBe(500)
    expect(r.error).toBe('Error interno del servidor')
  }

  C10_docenteSeNormaliza() {
    const n = normalizarTipoUsuario('docente')
    expect(n.userType).toBe('profesor')
    expect(n.userRole).toBe('profesor')
    expect(descripcionRol('docente')).toBe('Profesor/Docente del sistema')
    expect(dashboardParaUsuario(['docente'])).toBe('/dashboard-profesor')
  }

  FALLA_C1_usuarioNoExiste() {
    const r = decidirLogin({ usuario: null, passwordOk: false, roles: [] })
    expect(r.status).toBe(200)
  }

  FALLA_C5_dashboardIncorrecto() {
    expect(dashboardParaUsuario(['estudiante'])).toBe('/dashboard-admin')
  }

  FALLA_C9_errorInterno() {
    const r = decidirLogin({
      usuario: usuarioActivo,
      passwordOk: true,
      roles: ['estudiante'],
      errorInterno: true,
    })
    expect(r.status).toBe(200)
  }
}

const pruebas = new RQ2Login()

describe('RQ2 — Login', () => {
  it('C1: usuario no existe → 401', () => pruebas.C1_usuarioNoExiste())
  it('C2: usuario inactivo → 401', () => pruebas.C2_usuarioInactivo())
  it('C3: contraseña incorrecta → 401', () => pruebas.C3_contrasenaIncorrecta())
  it('C4: tipo de usuario no válido → 401', () => pruebas.C4_tipoNoValido())
  it('C5: login exitoso con un rol → 200', () => pruebas.C5_loginExitosoUnRol())
  it('C6: múltiples roles → requiere selección', () => pruebas.C6_multiplesRoles())
  it('C8: body inválido → 400', () => pruebas.C8_bodyInvalido())
  it('C9: error interno → 500', () => pruebas.C9_errorInterno())
  it('C10: docente se normaliza a profesor', () => pruebas.C10_docenteSeNormaliza())
  it('FALLA C1: usuario no existe — se espera (mal) 200 en vez de 401', () =>
    pruebas.FALLA_C1_usuarioNoExiste())
  it('FALLA C5: dashboard incorrecto', () => pruebas.FALLA_C5_dashboardIncorrecto())
  it('FALLA C9: error interno — se espera (mal) 200 en vez de 500', () => pruebas.FALLA_C9_errorInterno())
})
