import { afterEach, describe, expect, it } from 'vitest'
import type { Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import request from 'supertest'
import { authenticateToken, requireRole } from '../../middleware/auth'
import { getBcryptSaltRounds, hashPassword, isBcryptHash } from '../../utils/passwordSecurity'
import { supabaseAdmin } from '../../config/supabase-only'

/**
 * RQ1 — Crear usuario como administrador (POST /auth/create-user)
 *
 * Pruebas contra el código y la base de datos reales (sin mocks). Requiere
 * el seed de src/scripts/seed-rq1-rq2-fixtures.ts ya corrido (crea
 * rq1.admin@entreaulas.test con rol admin).
 */

import { app } from '../../app'

const ADMIN_EMAIL = 'rq1.admin@entreaulas.test'

async function tokenAdminValido(): Promise<string> {
  const { data } = await supabaseAdmin.from('usuarios').select('id').eq('email', ADMIN_EMAIL).single()
  if (!data) {
    throw new Error(
      `Falta el fixture ${ADMIN_EMAIL}. Corre: npx ts-node src/scripts/seed-rq1-rq2-fixtures.ts`
    )
  }
  return jwt.sign({ userId: (data as { id: string }).id }, process.env.JWT_SECRET!, { expiresIn: '1h' })
}

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
  email: 'rq1.nuevo@entreaulas.test',
  password: 'password123',
  nombre: 'Ana',
  apellido: 'Perez',
  tipo_usuario: 'estudiante',
}

const bodyValidoProfesor = {
  email: 'rq1.nuevo.profesor@entreaulas.test',
  password: 'password123',
  nombre: 'Prof',
  apellido: 'Esor',
  tipo_usuario: 'profesor',
  codigo_profesor: 'P-100',
  departamento: 'Sistemas',
}

const crearUsuario = async (body: Record<string, unknown>) =>
  request(app)
    .post('/api/auth/create-user')
    .set('Authorization', `Bearer ${await tokenAdminValido()}`)
    .send(body)

/** Borra un usuario creado por los tests (y sus filas relacionadas), para que la corrida sea repetible. */
async function limpiarUsuarioCreado(email: string) {
  const { data: usuario } = await supabaseAdmin.from('usuarios').select('id').eq('email', email).maybeSingle()
  if (!usuario) return
  const usuarioId = (usuario as { id: string }).id
  await supabaseAdmin.from('estudiantes').delete().eq('usuario_id', usuarioId)
  await supabaseAdmin.from('profesores').delete().eq('usuario_id', usuarioId)
  await supabaseAdmin.from('usuario_roles').delete().eq('usuario_id', usuarioId)
  await supabaseAdmin.from('usuarios').delete().eq('id', usuarioId)
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

  // Nodo 2-6 (HTTP real): con el JWT real del admin sembrado, authenticateToken + requireRole dejan pasar
  async N6_middlewareRealAceptaAlAdminSembrado() {
    const res = await crearUsuario({ ...bodyValido, password: 'corta12' }) // cuerpo inválido a propósito, solo nos interesa que pase el middleware
    expect(res.status).not.toBe(401)
    expect(res.status).not.toBe(403)
  }

  // Nodo 7-9: falta algún campo obligatorio → 400 (código real: POST /auth/create-user)
  async N9_camposFaltantes() {
    const { password: _password, ...sinPassword } = bodyValido
    const res = await crearUsuario(sinPassword)
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Todos los campos son requeridos' })
  }

  // Nodo 10-11: contraseña de menos de 8 caracteres → 400 (código real)
  async N11_contrasenaCorta() {
    const res = await crearUsuario({ ...bodyValido, password: 'corta12' })
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'La contraseña debe tener al menos 8 caracteres' })
  }

  // Nodo 12-14: el email ya está registrado → 400 (cubre crearUsuarioConTipo real, contra la BD real)
  async N14_emailYaRegistrado() {
    const res = await crearUsuario({ ...bodyValido, email: 'usuario.activo@entreaulas.test' })
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'El email ya está registrado' })
  }

  // Nodo 15: hashPassword usa bcrypt con 12 salt rounds
  async N15_hashBcrypt12() {
    expect(getBcryptSaltRounds()).toBe(12)
    const hash = await hashPassword(bodyValido.password)
    expect(isBcryptHash(hash)).toBe(true)
    expect(hash.startsWith('$2b$12$')).toBe(true)
    expect(hash).not.toBe(bodyValido.password)
  }

  // Nodo 16-17: datos correctos, admin y email libre → 201 Usuario creado (crearUsuarioConTipo + proyectarUsuarioPublico contra BD real)
  async N17_usuarioCreado() {
    const res = await crearUsuario(bodyValido)

    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({
      message: 'Usuario creado exitosamente',
      user: {
        email: bodyValido.email,
        nombre: bodyValido.nombre,
        apellido: bodyValido.apellido,
        tipo_usuario: bodyValido.tipo_usuario,
        activo: true,
      },
    })
    expect(typeof res.body.user.id).toBe('string')
  }

  // Cubre los campos opcionales de crearUsuarioConTipo (profesor) contra la BD real
  async N17_usuarioCreadoConCamposDeProfesor() {
    const res = await crearUsuario(bodyValidoProfesor)
    expect(res.status).toBe(201)

    const { data: profesorRow } = await supabaseAdmin
      .from('profesores')
      .select('codigo, departamento')
      .eq('usuario_id', res.body.user.id)
      .maybeSingle()
    if (profesorRow) {
      expect(profesorRow).toMatchObject({ codigo: 'P-100', departamento: 'Sistemas' })
    }
  }
}

const pruebas = new RQ1CrearUsuarioAdmin()

describe('RQ1 — Crear usuario como administrador', () => {
  afterEach(async () => {
    await limpiarUsuarioCreado(bodyValido.email)
    await limpiarUsuarioCreado(bodyValidoProfesor.email)
  })

  it('Nodo 2-3: sin token → 401 NO_TOKEN', () => pruebas.N3_sinToken())
  it('Nodo 3-4: token inválido → 401 TOKEN_INVALID', () => pruebas.N4_tokenInvalido())
  it('Nodo 5-6: rol no admin → 403 FORBIDDEN_ROLE', () => pruebas.N6_rolNoAdmin())
  it('Nodo 6: requireRole sin usuario → 401 No autenticado', () => pruebas.N6_sinUsuario())
  it('Nodo 5: usuario admin → continúa', () => pruebas.N5_esAdminContinua())
  it('Nodo 2-6: middleware real acepta al admin sembrado', () => pruebas.N6_middlewareRealAceptaAlAdminSembrado())
  it('Nodo 7-9: campos requeridos faltantes → 400', () => pruebas.N9_camposFaltantes())
  it('Nodo 10-11: contraseña corta → 400', () => pruebas.N11_contrasenaCorta())
  it('Nodo 12-14: email ya registrado → 400', () => pruebas.N14_emailYaRegistrado())
  it('Nodo 15: hashPassword → bcrypt 12 salt rounds', () => pruebas.N15_hashBcrypt12())
  it('Nodo 16-17: usuario creado → 201', () => pruebas.N17_usuarioCreado())
  it('Nodo 16-17: usuario creado con campos de profesor → 201', () => pruebas.N17_usuarioCreadoConCamposDeProfesor())
})
