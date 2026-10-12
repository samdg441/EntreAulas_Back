/**
 * DEF-40 — Los 500 de create-user y reset-password devuelven el mensaje interno (RQ1/RQ5)
 *
 * Severidad: Media | Estado: ABIERTO | Mismo origen que DEF-31 (`sendError` copia `error.message`)
 *
 * Ante un fallo de base de datos el cuerpo trae `details` con texto de PostgreSQL/Supabase
 * (restricciones, nombres de tabla, host). Debe responder solo `{ error: 'Error interno del servidor' }`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { supabaseModuleMock } from '../helpers/supabase-mock'
import { iniciarSesion, reiniciarSesion } from '../helpers/sesion-http'
import { adminUser } from '../fixtures/users'

const { repo } = vi.hoisted(() => ({
  repo: { findUserByEmail: vi.fn().mockResolvedValue(null), findUserById: vi.fn(), updateUser: vi.fn(), createUserWithType: vi.fn(), countUsers: vi.fn() },
}))
vi.mock('../../config/supabase-only', () => supabaseModuleMock)
vi.mock('../../config/supabaseClient', () => supabaseModuleMock)
vi.mock('../../modules/auth/auth.repository', () => ({ authRepository: repo }))

import { app } from '../../app'

const FILTRA = /constraint|usuarios_pkey|supabase\.co|violates|relation "/i

describe('DEF-40 — Un 500 en auth no debe exponer detalles internos', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
    reiniciarSesion()
  })

  it('create-user: el fallo de la base no aparece en el cuerpo', async () => {
    repo.createUserWithType.mockRejectedValue(new Error('duplicate key value violates unique constraint "usuarios_pkey" at db.supabase.co'))

    const res = await request(app)
      .post('/api/auth/create-user')
      .set('Authorization', iniciarSesion(adminUser))
      .send({ email: 'nuevo@udemedellin.edu.co', password: 'Clave-Segura2026!', nombre: 'Nuevo', apellido: 'Docente', tipo_usuario: 'profesor' })

    expect(res.status).toBe(500)
    expect(JSON.stringify(res.body)).not.toMatch(FILTRA)
  })

  it('login: un fallo de la base no aparece en el cuerpo', async () => {
    repo.findUserByEmail.mockRejectedValueOnce(new Error('connection to server at "db.supabase.co" failed: relation "usuarios" does not exist'))

    const res = await request(app).post('/api/auth/login').send({ email: 'ana@soyudemedellin.edu.co', password: 'Clave-Segura2026!' })

    expect(res.status).toBe(500)
    expect(JSON.stringify(res.body)).not.toMatch(FILTRA)
  })
})
