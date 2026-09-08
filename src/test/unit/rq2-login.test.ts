import { describe, expect, it } from 'vitest'
import {
  decidirLogin,
  descripcionRol,
  normalizarTipoUsuario,
  validarDatosLogin,
} from '../helpers/auth'
import { dashboardDesdeRoles } from '../helpers/dashboard'
import { hashPassword, verifyStoredPassword } from '../../utils/passwordSecurity'

/**
 * RQ2 — Login (POST /auth/login)
 *
 * Pruebas unitarias sencillas, sin mocks. Cada prueba cubre uno o varios
 * nodos del diagrama de flujo del endpoint:
 *
 *  1  POST /auth/login
 *  2  loginSchema.parse(req.body) ¿válido?
 *  3  findUserByEmail(email)
 *  4  400 'Datos inválidos' (ZodError)
 *  5  ¿user existe?
 *  6  401 'Credenciales inválidas'
 *  7  ¿user.activo?
 *  8  401 'Credenciales inválidas'
 *  9  verifyStoredPassword(password, user.password)
 * 10  ¿passwordCheck.ok?
 * 11  401 'Credenciales inválidas'
 * 12  ¿passwordCheck.migratePlaintextToHash?
 * 13  hashPassword + updateUser
 * 14  catch → console.error
 * 15  RoleService.obtenerRolesUsuario(user.id)
 * 16  ¿tieneRolValido?
 * 17  401 'Tipo de usuario no válido'
 * 18  ¿roles.length > 1?
 * 19  respuesta de múltiples roles
 * 20  200 requires_role_selection: true (sin token)
 * 21  Generar JWT
 * 22  obtenerDashboardUsuario, obtenerPermisosUsuario
 * 23  role_description según rol principal
 * 24  200 'Login exitoso' + token + user
 * 25  500 'Error interno del servidor'
 */

// Nodo 23: role_description según el rol principal (lógica del endpoint real)
function descripcionRolPrincipal(roles: string[]): string | undefined {
  if (roles.includes('admin')) return 'Administrador del sistema'
  if (roles.includes('decano')) return 'Decano de la facultad'
  if (roles.includes('coordinador')) return 'Coordinador del sistema'
  if (roles.includes('profesor') || roles.includes('docente')) return 'Profesor/Docente del sistema'
  if (roles.includes('estudiante')) return 'Estudiante del sistema'
  return undefined
}

const credenciales = { email: 'user@test.com', password: 'password123' }
const usuarioActivo = { activo: true, tipo_usuario: 'estudiante' }

class RQ2Login {
  // Nodo 2-4: body que no cumple loginSchema → 400 'Datos inválidos'
  N4_bodyInvalido() {
    const r = validarDatosLogin({ email: 'no-es-un-email', password: 'x' })
    expect(r.ok).toBe(false)
    expect(r.status).toBe(400)
    expect(r.error).toBe('Datos inválidos')
    if (!r.ok) {
      expect(Array.isArray(r.details)).toBe(true)
    }
  }

  // Nodo 2-4: falta la contraseña → 400 'Datos inválidos'
  N4_faltaPassword() {
    const r = validarDatosLogin({ email: 'user@test.com' })
    expect(r.ok).toBe(false)
    expect(r.status).toBe(400)
    expect(r.error).toBe('Datos inválidos')
  }

  // Nodo 2: body válido → sigue el flujo
  N2_bodyValido() {
    const r = validarDatosLogin(credenciales)
    expect(r.ok).toBe(true)
    expect(r.status).toBe(200)
  }

  // Nodo 3-6: el usuario no existe → 401 'Credenciales inválidas'
  N6_usuarioNoExiste() {
    const r = decidirLogin({ usuario: null, passwordOk: false, roles: [] })
    expect(r.status).toBe(401)
    expect(r.error).toBe('Credenciales inválidas')
  }

  // Nodo 7-8: el usuario existe pero está inactivo → 401 'Credenciales inválidas'
  N8_usuarioInactivo() {
    const r = decidirLogin({
      usuario: { activo: false, tipo_usuario: 'estudiante' },
      passwordOk: true,
      roles: ['estudiante'],
    })
    expect(r.status).toBe(401)
    expect(r.error).toBe('Credenciales inválidas')
  }

  // Nodo 9-11: la contraseña no coincide con el hash → 401 'Credenciales inválidas'
  async N11_contrasenaIncorrecta() {
    const hash = await hashPassword('otra-clave-distinta')
    const check = await verifyStoredPassword(credenciales.password, hash)
    expect(check.ok).toBe(false)

    const r = decidirLogin({ usuario: usuarioActivo, passwordOk: check.ok, roles: ['estudiante'] })
    expect(r.status).toBe(401)
    expect(r.error).toBe('Credenciales inválidas')
  }

  // Nodo 12-13: contraseña guardada en texto plano → se detecta la migración a bcrypt
  async N13_migracionAHash() {
    const original = process.env.ALLOW_LEGACY_PLAINTEXT_LOGIN
    process.env.ALLOW_LEGACY_PLAINTEXT_LOGIN = 'true'
    try {
      const check = await verifyStoredPassword('clave-en-plano', 'clave-en-plano')
      expect(check.ok).toBe(true)
      if (check.ok) {
        expect(check.migratePlaintextToHash).toBe('clave-en-plano')
        const nuevoHash = await hashPassword(check.migratePlaintextToHash!)
        expect(nuevoHash.startsWith('$2b$')).toBe(true)
        expect(nuevoHash).not.toBe('clave-en-plano')
      }
    } finally {
      if (original === undefined) delete process.env.ALLOW_LEGACY_PLAINTEXT_LOGIN
      else process.env.ALLOW_LEGACY_PLAINTEXT_LOGIN = original
    }
  }

  // Nodo 15-17: tipo_usuario fuera de la lista y sin roles válidos → 401 'Tipo de usuario no válido'
  N17_tipoNoValido() {
    const r = decidirLogin({
      usuario: { activo: true, tipo_usuario: 'invitado' },
      passwordOk: true,
      roles: [],
    })
    expect(r.status).toBe(401)
    expect(r.error).toBe('Tipo de usuario no válido')
  }

  // Nodo 15-16: rol válido tomado de la tabla de roles aunque tipo_usuario no lo sea
  N16_rolValidoDesdeRoles() {
    const r = decidirLogin({
      usuario: { activo: true, tipo_usuario: 'invitado' },
      passwordOk: true,
      roles: ['coordinador'],
    })
    expect(r.status).toBe(200)
  }

  // Nodo 18-20: el usuario tiene más de un rol → 200 requires_role_selection, sin token
  N20_multiplesRoles() {
    const r = decidirLogin({
      usuario: usuarioActivo,
      passwordOk: true,
      roles: ['estudiante', 'profesor'],
    })
    expect(r.status).toBe(200)
    expect(r).toMatchObject({
      data: {
        message: 'Usuario con múltiples roles detectado',
        requires_role_selection: true,
        available_roles: ['estudiante', 'profesor'],
      },
    })
    if (r.ok) {
      expect(r.data).not.toHaveProperty('token')
    }
  }

  // Nodo 21-24: un solo rol válido y contraseña correcta → 200 'Login exitoso'
  async N24_loginExitoso() {
    const hash = await hashPassword(credenciales.password)
    const check = await verifyStoredPassword(credenciales.password, hash)
    expect(check.ok).toBe(true)

    const r = decidirLogin({ usuario: usuarioActivo, passwordOk: check.ok, roles: ['estudiante'] })
    expect(r.status).toBe(200)
    expect(r).toMatchObject({ data: { message: 'Login exitoso' } })
  }

  // Nodo 22: dashboard según el rol principal del usuario
  N22_dashboardSegunRol() {
    expect(dashboardDesdeRoles(['estudiante'])).toBe('/dashboard-estudiante')
    expect(dashboardDesdeRoles(['profesor'])).toBe('/dashboard-profesor')
    expect(dashboardDesdeRoles(['docente'])).toBe('/dashboard-profesor')
    expect(dashboardDesdeRoles(['coordinador'])).toBe('/dashboard-coordinador')
    expect(dashboardDesdeRoles(['admin'])).toBe('/dashboard-admin')
    expect(dashboardDesdeRoles(['decano'])).toBe('/dashboard-decano')
    // Precedencia: admin manda sobre estudiante
    expect(dashboardDesdeRoles(['estudiante', 'admin'])).toBe('/dashboard-admin')
  }

  // Nodo 23: role_description según el rol principal
  N23_roleDescription() {
    expect(descripcionRolPrincipal(['admin'])).toBe('Administrador del sistema')
    expect(descripcionRolPrincipal(['decano'])).toBe('Decano de la facultad')
    expect(descripcionRolPrincipal(['coordinador'])).toBe('Coordinador del sistema')
    expect(descripcionRolPrincipal(['profesor'])).toBe('Profesor/Docente del sistema')
    expect(descripcionRolPrincipal(['docente'])).toBe('Profesor/Docente del sistema')
    expect(descripcionRolPrincipal(['estudiante'])).toBe('Estudiante del sistema')
    // Precedencia: admin manda sobre estudiante
    expect(descripcionRolPrincipal(['estudiante', 'admin'])).toBe('Administrador del sistema')
  }

  // Nodo 24: 'docente' se normaliza a 'profesor' para user_type / user_role
  N24_docenteSeNormaliza() {
    const n = normalizarTipoUsuario('docente')
    expect(n.userType).toBe('profesor')
    expect(n.userRole).toBe('profesor')
    expect(descripcionRol('docente')).toBe('Profesor/Docente del sistema')
  }

  // Nodo 25: cualquier excepción no controlada → 500 'Error interno del servidor'
  N25_errorInterno() {
    const r = decidirLogin({
      usuario: usuarioActivo,
      passwordOk: true,
      roles: ['estudiante'],
      errorInterno: true,
    })
    expect(r.status).toBe(500)
    expect(r.error).toBe('Error interno del servidor')
  }
}

const pruebas = new RQ2Login()

describe('RQ2 — Login', () => {
  it('Nodo 2-4: body inválido → 400 Datos inválidos', () => pruebas.N4_bodyInvalido())
  it('Nodo 2-4: falta password → 400 Datos inválidos', () => pruebas.N4_faltaPassword())
  it('Nodo 2: body válido → continúa', () => pruebas.N2_bodyValido())
  it('Nodo 3-6: usuario no existe → 401', () => pruebas.N6_usuarioNoExiste())
  it('Nodo 7-8: usuario inactivo → 401', () => pruebas.N8_usuarioInactivo())
  it('Nodo 9-11: contraseña incorrecta → 401', () => pruebas.N11_contrasenaIncorrecta())
  it('Nodo 12-13: migración de contraseña en texto plano', () => pruebas.N13_migracionAHash())
  it('Nodo 15-17: tipo de usuario no válido → 401', () => pruebas.N17_tipoNoValido())
  it('Nodo 15-16: rol válido desde la tabla de roles → 200', () => pruebas.N16_rolValidoDesdeRoles())
  it('Nodo 18-20: múltiples roles → 200 sin token', () => pruebas.N20_multiplesRoles())
  it('Nodo 21-24: login exitoso con un rol → 200', () => pruebas.N24_loginExitoso())
  it('Nodo 22: dashboard según rol principal', () => pruebas.N22_dashboardSegunRol())
  it('Nodo 23: role_description según rol principal', () => pruebas.N23_roleDescription())
  it('Nodo 24: docente se normaliza a profesor', () => pruebas.N24_docenteSeNormaliza())
  it('Nodo 25: error interno → 500', () => pruebas.N25_errorInterno())
})
