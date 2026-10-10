/**
 * RQ19 — Ataques al token y a los roles contra el middleware `authenticateToken` real.
 * Regla clave: los roles salen de la base en cada petición, nunca del contenido del JWT.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { supabaseModuleMock } from '../helpers/supabase-mock'
import { firmarToken, iniciarSesion, reiniciarSesion } from '../helpers/sesion-http'
import { estudianteUser } from '../fixtures/users'

vi.mock('../../config/supabase-only', () => supabaseModuleMock)
vi.mock('../../config/supabaseClient', () => supabaseModuleMock)

import { app } from '../../app'

const findUserById = supabaseModuleMock.SupabaseDB.findUserById as ReturnType<typeof vi.fn>
const RUTA_ADMIN = '/api/users'
const RUTA_COORDINADOR = '/api/coordinador/dashboard-summary'

const base64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')

describe('RQ19 — Seguridad del token y los roles', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
    reiniciarSesion()
  })

  it.each([
    ['sin cabecera', undefined, 'NO_TOKEN'],
    ['esquema distinto de Bearer', 'Token abc', 'NO_TOKEN'],
    ['Bearer vacío', 'Bearer ', 'NO_TOKEN'],
    ['basura', 'Bearer abc.def.ghi', 'TOKEN_INVALID'],
    ['alg none sin firma', `Bearer ${base64url({ alg: 'none', typ: 'JWT' })}.${base64url({ userId: 'user-admin' })}.`, 'TOKEN_INVALID'],
    ['firmado con otra clave', `Bearer ${firmarToken({ userId: 'user-admin' }, { secreto: 'clave-del-atacante' })}`, 'TOKEN_INVALID'],
    ['vencido', `Bearer ${firmarToken({ userId: 'user-admin' }, { expiresIn: -10 })}`, 'TOKEN_EXPIRED'],
    ['sin userId', `Bearer ${firmarToken({ email: 'admin@test.com' })}`, 'TOKEN_INVALID'],
  ])('%s → 401 %s sin consultar la base', async (_caso, authorization, code) => {
    const peticion = request(app).get(RUTA_COORDINADOR)
    if (authorization) peticion.set('Authorization', authorization)

    const res = await peticion

    expect(res.status).toBe(401)
    expect(res.body.code).toBe(code)
    expect(findUserById).not.toHaveBeenCalled()
  })

  it('un payload alterado (otro userId con la firma original) → 401', async () => {
    const [cabecera, , firma] = firmarToken({ userId: 'user-estudiante' }).split('.')
    const alterado = `${cabecera}.${base64url({ userId: 'user-admin' })}.${firma}`

    const res = await request(app).get(RUTA_ADMIN).set('Authorization', `Bearer ${alterado}`)

    expect(res.status).toBe(401)
    expect(res.body.code).toBe('TOKEN_INVALID')
  })

  it('un token válido de un usuario desactivado → 401 USER_INVALID', async () => {
    const auth = iniciarSesion(estudianteUser, { activo: false })

    const res = await request(app).get(RUTA_COORDINADOR).set('Authorization', auth)

    expect(res.status).toBe(401)
    expect(res.body.code).toBe('USER_INVALID')
  })

  it('un token válido de un usuario borrado → 401 USER_INVALID', async () => {
    findUserById.mockResolvedValue(null)

    const res = await request(app).get(RUTA_COORDINADOR).set('Authorization', `Bearer ${firmarToken({ userId: 'ya-no-existe' })}`)

    expect(res.status).toBe(401)
    expect(res.body.code).toBe('USER_INVALID')
  })

  it('Regresión RQ19: decir "admin" dentro del JWT no da permisos de admin', async () => {
    iniciarSesion(estudianteUser)
    const token = firmarToken({ userId: estudianteUser.id, tipo_usuario: 'admin', roles: ['admin'] })

    const res = await request(app).get(RUTA_ADMIN).set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(403)
    expect(res.body.code).toBe('FORBIDDEN_ROLE')
  })

  it('las respuestas 401 no revelan detalles de la librería JWT', async () => {
    const res = await request(app).get(RUTA_COORDINADOR).set('Authorization', 'Bearer abc.def.ghi')

    expect(Object.keys(res.body).sort()).toEqual(['code', 'error'])
    expect(JSON.stringify(res.body)).not.toMatch(/jsonwebtoken|stack|malformed|invalid signature/i)
  })
})
