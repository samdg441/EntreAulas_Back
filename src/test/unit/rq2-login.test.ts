import { afterEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { describirRolPrincipal, normalizarTipoUsuario } from '../../modules/auth/auth.service'
import { dashboardDesdeRoles } from '../../modules/auth/dashboard'
import { authRepository } from '../../modules/auth/auth.repository'
import { supabaseAdmin } from '../../config/supabase-only'

/**
 * RQ2 — Login (POST /auth/login)
 *
 * Pruebas contra el código y la base de datos reales (sin mocks), salvo dos
 * excepciones documentadas explícitamente donde no es posible o no es seguro
 * representar el escenario con una fila real:
 *
 *  - "tipo_usuario inválido": la tabla `usuarios` tiene un CHECK constraint
 *    (usuarios_tipo_usuario_check) que solo permite los mismos valores de
 *    VALID_USER_TYPES — es estructuralmente imposible insertar un tipo
 *    inválido, así que esa rama defensiva se prueba mockeando la fila.
 *  - "falla obtener info de coordinador/decano": forzar un fallo real de
 *    RoleService contra Supabase no es reproducible de forma segura ni
 *    determinística, así que se espía (vi.spyOn) para forzar el rechazo.
 *
 * Requiere el seed de src/scripts/seed-rq1-rq2-fixtures.ts ya corrido.
 *
 * Nodos del diagrama de flujo cubiertos:
 *  1  POST /auth/login              14  catch → console.error
 *  2  loginSchema.parse ¿válido?    15  RoleService.obtenerRolesUsuario
 *  3  findUserByEmail(email)        16  ¿tieneRolValido?
 *  4  400 'Datos inválidos'         17  401 'Tipo de usuario no válido'
 *  5  ¿user existe?                 18  ¿roles.length > 1?
 *  6  401 'Credenciales inválidas'  19  respuesta de múltiples roles
 *  7  ¿user.activo?                 20  200 requires_role_selection
 *  8  401 'Credenciales inválidas'  21  Generar JWT
 *  9  verifyStoredPassword          22  dashboard/permisos
 * 10  ¿passwordCheck.ok?            23  role_description
 * 11  401 'Credenciales inválidas'  24  200 'Login exitoso' + token + user
 * 12  ¿migratePlaintextToHash?      25  500 'Error interno del servidor'
 * 13  hashPassword + updateUser
 */

import { app } from '../../app'
import { RoleService } from '../../modules/auth/role.service'

const PASSWORD = 'password123'
const login = (body: Record<string, unknown>) => request(app).post('/api/auth/login').send(body)

const EMAIL_ACTIVO = 'rq2.activo.estudiante@entreaulas.test'
const EMAIL_INACTIVO = 'rq2.inactivo@entreaulas.test'
const EMAIL_MULTIROLES = 'rq2.multiroles@entreaulas.test'
const EMAIL_COORDINADOR = 'rq2.coordinador@entreaulas.test'
const EMAIL_DECANO = 'rq2.decano@entreaulas.test'
const EMAIL_MIGRACION = 'rq2.migracion@entreaulas.test'

/** El login exitoso re-hashea el password en texto plano; lo reponemos para que el test sea repetible. */
async function resetearPasswordEnTextoPlano(email: string) {
  await supabaseAdmin.from('usuarios').update({ password: PASSWORD }).eq('email', email)
}

class RQ2Login {
  // Nodo 2-4: body que no cumple loginSchema → 400 'Datos inválidos'
  async N4_bodyInvalido() {
    const res = await login({ email: 'no-es-un-email', password: 'x' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Datos inválidos')
    expect(Array.isArray(res.body.details)).toBe(true)
  }

  // Nodo 2-4: falta la contraseña → 400 'Datos inválidos'
  async N4_faltaPassword() {
    const res = await login({ email: EMAIL_ACTIVO })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Datos inválidos')
  }

  // Nodo 2: body válido → sigue el flujo (no 400 de validación)
  async N2_bodyValido() {
    const res = await login({ email: 'no-existe@entreaulas.test', password: PASSWORD })
    expect(res.body.error).not.toBe('Datos inválidos')
  }

  // Nodo 3-6: el usuario no existe → 401 'Credenciales inválidas'
  async N6_usuarioNoExiste() {
    const res = await login({ email: 'no-existe@entreaulas.test', password: PASSWORD })
    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: 'Credenciales inválidas' })
  }

  // Nodo 7-8: el usuario existe pero está inactivo → 401 'Credenciales inválidas'
  async N8_usuarioInactivo() {
    const res = await login({ email: EMAIL_INACTIVO, password: PASSWORD })
    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: 'Credenciales inválidas' })
  }

  // Nodo 9-11: la contraseña no coincide con el hash real → 401 'Credenciales inválidas'
  async N11_contrasenaIncorrecta() {
    const res = await login({ email: EMAIL_ACTIVO, password: 'otra-clave-distinta' })
    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: 'Credenciales inválidas' })
  }

  // Nodo 12-13: contraseña guardada en texto plano → se migra a bcrypt (rama de éxito real, BD real)
  async N13_migracionAHash() {
    const original = process.env.ALLOW_LEGACY_PLAINTEXT_LOGIN
    process.env.ALLOW_LEGACY_PLAINTEXT_LOGIN = 'true'
    try {
      await resetearPasswordEnTextoPlano(EMAIL_MIGRACION)

      const res = await login({ email: EMAIL_MIGRACION, password: PASSWORD })

      expect(res.status).toBe(200)
      const { data: usuario } = await supabaseAdmin
        .from('usuarios')
        .select('password')
        .eq('email', EMAIL_MIGRACION)
        .single()
      expect(String((usuario as { password: string }).password)).toMatch(/^\$2[aby]\$/)
    } finally {
      if (original === undefined) delete process.env.ALLOW_LEGACY_PLAINTEXT_LOGIN
      else process.env.ALLOW_LEGACY_PLAINTEXT_LOGIN = original
    }
  }

  // Nodo 14: si falla la migración (updateUser rechaza), el login NO se interrumpe — solo loguea.
  // No es seguro forzar un fallo real de escritura en Supabase, así que se espía authRepository.updateUser.
  async N14_migracionFallaNoInterrumpe() {
    const original = process.env.ALLOW_LEGACY_PLAINTEXT_LOGIN
    process.env.ALLOW_LEGACY_PLAINTEXT_LOGIN = 'true'
    try {
      await resetearPasswordEnTextoPlano(EMAIL_MIGRACION)
      vi.spyOn(authRepository, 'updateUser').mockRejectedValueOnce(new Error('update bloqueado'))
      vi.spyOn(console, 'error').mockImplementation(() => {})

      const res = await login({ email: EMAIL_MIGRACION, password: PASSWORD })

      expect(res.status).toBe(200)
      expect(res.body.message).toBe('Login exitoso')
    } finally {
      if (original === undefined) delete process.env.ALLOW_LEGACY_PLAINTEXT_LOGIN
      else process.env.ALLOW_LEGACY_PLAINTEXT_LOGIN = original
      await resetearPasswordEnTextoPlano(EMAIL_MIGRACION)
    }
  }

  // Nodo 15-17: tipo_usuario fuera de la lista y sin roles válidos → 401 'Tipo de usuario no válido'.
  // Estructuralmente imposible con una fila real (CHECK constraint en la BD) → se mockea la fila leída.
  async N17_tipoNoValido() {
    vi.spyOn(authRepository, 'findUserByEmail').mockResolvedValueOnce({
      id: 'fake-id-tipo-invalido',
      email: 'tipo-invalido@entreaulas.test',
      activo: true,
      tipo_usuario: 'invitado',
      password: await bcryptHashDePassword(),
    } as never)
    vi.spyOn(RoleService, 'obtenerRolesUsuario').mockResolvedValue([])

    const res = await login({ email: 'tipo-invalido@entreaulas.test', password: PASSWORD })
    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: 'Tipo de usuario no válido' })
  }

  // Nodo 15-16: rol válido tomado de la tabla de roles aunque tipo_usuario no lo sea (misma excepción que N17)
  async N16_rolValidoDesdeRoles() {
    vi.spyOn(authRepository, 'findUserByEmail').mockResolvedValueOnce({
      id: 'fake-id-tipo-invalido',
      email: 'tipo-invalido@entreaulas.test',
      activo: true,
      tipo_usuario: 'invitado',
      password: await bcryptHashDePassword(),
    } as never)
    vi.spyOn(RoleService, 'obtenerRolesUsuario').mockResolvedValue(['coordinador'])
    vi.spyOn(RoleService, 'obtenerCoordinadorPorUsuario').mockResolvedValue(null)

    const res = await login({ email: 'tipo-invalido@entreaulas.test', password: PASSWORD })
    expect(res.status).toBe(200)
  }

  // Nodo 18-20: el usuario tiene más de un rol → 200 requires_role_selection, sin token
  async N20_multiplesRoles() {
    const res = await login({ email: EMAIL_MULTIROLES, password: PASSWORD })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      message: 'Usuario con múltiples roles detectado',
      requires_role_selection: true,
    })
    expect(res.body.available_roles.sort()).toEqual(['estudiante', 'profesor'])
    expect(res.body).not.toHaveProperty('token')
  }

  // Nodo 21-24: un solo rol válido y contraseña correcta → 200 'Login exitoso' (BD real)
  async N24_loginExitoso() {
    const res = await login({ email: EMAIL_ACTIVO, password: PASSWORD })
    expect(res.status).toBe(200)
    expect(res.body.message).toBe('Login exitoso')
    expect(typeof res.body.token).toBe('string')
    expect(res.body.user.role_description).toBe('Estudiante del sistema')
  }

  // Rama de armarPerfilConRoles que agrega additionalInfo.coordinador (BD real: tabla coordinadores)
  async N24_perfilConCoordinador() {
    const res = await login({ email: EMAIL_COORDINADOR, password: PASSWORD })
    expect(res.status).toBe(200)
    expect(res.body.user.coordinador).toBeTruthy()
    expect(res.body.user.coordinador).toHaveProperty('carrera_id')
  }

  // Rama de armarPerfilConRoles que agrega additionalInfo.decano (BD real: tabla decanos)
  async N24_perfilConDecano() {
    const res = await login({ email: EMAIL_DECANO, password: PASSWORD })
    expect(res.status).toBe(200)
    expect(res.body.user.decano).toMatchObject({
      facultad_nombre: 'Facultad RQ2 Fixtures',
    })
  }

  // Rama catch de obtenerCoordinadorInfo: RoleService falla → se ignora (forzado con spy, no reproducible con datos reales)
  async N24_perfilCoordinadorFallaSeIgnora() {
    vi.spyOn(RoleService, 'obtenerCoordinadorPorUsuario').mockRejectedValue(new Error('falló'))
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    const res = await login({ email: EMAIL_COORDINADOR, password: PASSWORD })
    expect(res.status).toBe(200)
    expect(res.body.user).not.toHaveProperty('coordinador')
  }

  // Rama catch de obtenerDecanoInfo: RoleService falla → se ignora (forzado con spy, no reproducible con datos reales)
  async N24_perfilDecanoFallaSeIgnora() {
    vi.spyOn(RoleService, 'obtenerDecanoPorUsuario').mockRejectedValue(new Error('falló'))
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    const res = await login({ email: EMAIL_DECANO, password: PASSWORD })
    expect(res.status).toBe(200)
    expect(res.body.user).not.toHaveProperty('decano')
  }

  // Nodo 22: dashboard según el rol principal del usuario (función real de modules/auth/dashboard)
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

  // Nodo 23: role_description según el rol principal (función real de auth.service.ts)
  N23_roleDescription() {
    expect(describirRolPrincipal(['admin'], 'admin')).toBe('Administrador del sistema')
    expect(describirRolPrincipal(['decano'], 'decano')).toBe('Decano de la facultad')
    expect(describirRolPrincipal(['coordinador'], 'coordinador')).toBe('Coordinador del sistema')
    expect(describirRolPrincipal(['profesor'], 'profesor')).toBe('Profesor/Docente del sistema')
    expect(describirRolPrincipal(['docente'], 'docente')).toBe('Profesor/Docente del sistema')
    expect(describirRolPrincipal(['estudiante'], 'estudiante')).toBe('Estudiante del sistema')
    // Precedencia: admin manda sobre estudiante
    expect(describirRolPrincipal(['estudiante', 'admin'], 'estudiante')).toBe('Administrador del sistema')
    // Rama default: sin match — multi-rol y single-rol
    expect(describirRolPrincipal(['x', 'y'], 'invitado')).toBe('Usuario con múltiples roles: x, y')
    expect(describirRolPrincipal(['x'], 'invitado')).toBe('Usuario con rol: x')
    expect(describirRolPrincipal([], 'invitado')).toBe('Usuario con rol: invitado')
  }

  // Nodo 24: 'docente' se normaliza a 'profesor' para user_type / user_role (función real)
  N24_docenteSeNormaliza() {
    expect(normalizarTipoUsuario('docente')).toBe('profesor')
    expect(normalizarTipoUsuario('estudiante')).toBe('estudiante')
    expect(describirRolPrincipal(['docente'], 'docente')).toBe('Profesor/Docente del sistema')
  }

  // Nodo 25: cualquier excepción no controlada → 500 'Error interno del servidor' (forzado con spy: no hay forma
  // segura de tumbar Supabase real bajo demanda)
  async N25_errorInterno() {
    vi.spyOn(authRepository, 'findUserByEmail').mockRejectedValueOnce(new Error('caída inesperada'))
    const res = await login({ email: EMAIL_ACTIVO, password: PASSWORD })
    expect(res.status).toBe(500)
    expect(res.body.error).toBe('Error interno del servidor')
  }
}

async function bcryptHashDePassword(): Promise<string> {
  const { hashPassword } = await import('../../utils/passwordSecurity')
  return hashPassword(PASSWORD)
}

const pruebas = new RQ2Login()

describe('RQ2 — Login', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('Nodo 2-4: body inválido → 400 Datos inválidos', () => pruebas.N4_bodyInvalido())
  it('Nodo 2-4: falta password → 400 Datos inválidos', () => pruebas.N4_faltaPassword())
  it('Nodo 2: body válido → continúa', () => pruebas.N2_bodyValido())
  it('Nodo 3-6: usuario no existe → 401', () => pruebas.N6_usuarioNoExiste())
  it('Nodo 7-8: usuario inactivo → 401', () => pruebas.N8_usuarioInactivo())
  it('Nodo 9-11: contraseña incorrecta → 401', () => pruebas.N11_contrasenaIncorrecta())
  it('Nodo 12-13: migración de contraseña en texto plano', () => pruebas.N13_migracionAHash())
  it('Nodo 14: falla la migración → no interrumpe el login', () => pruebas.N14_migracionFallaNoInterrumpe())
  it('Nodo 15-17: tipo de usuario no válido → 401', () => pruebas.N17_tipoNoValido())
  it('Nodo 15-16: rol válido desde la tabla de roles → 200', () => pruebas.N16_rolValidoDesdeRoles())
  it('Nodo 18-20: múltiples roles → 200 sin token', () => pruebas.N20_multiplesRoles())
  it('Nodo 21-24: login exitoso con un rol → 200', () => pruebas.N24_loginExitoso())
  it('Nodo 21-24: perfil incluye datos de coordinador', () => pruebas.N24_perfilConCoordinador())
  it('Nodo 21-24: perfil incluye datos de decano', () => pruebas.N24_perfilConDecano())
  it('Nodo 21-24: falla obtener info de coordinador → se ignora', () => pruebas.N24_perfilCoordinadorFallaSeIgnora())
  it('Nodo 21-24: falla obtener info de decano → se ignora', () => pruebas.N24_perfilDecanoFallaSeIgnora())
  it('Nodo 22: dashboard según rol principal', () => pruebas.N22_dashboardSegunRol())
  it('Nodo 23: role_description según rol principal', () => pruebas.N23_roleDescription())
  it('Nodo 24: docente se normaliza a profesor', () => pruebas.N24_docenteSeNormaliza())
  it('Nodo 25: error interno → 500', () => pruebas.N25_errorInterno())
})
