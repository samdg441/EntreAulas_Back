/**
 * DEF-45 — create-user acepta contraseñas que reset-password rechaza (RQ1/RQ5)
 *
 * Severidad: Baja | Estado: CORREGIDO (2026-10-26)
 *
 * reset-password exige mayúscula, minúscula, número y carácter especial (`validarFortalezaPassword`);
 * create-user y register solo exigen 8 caracteres, así que el admin puede crear la cuenta con
 * "12345678". La política debe ser la misma en todos los puntos de entrada.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { supabaseModuleMock } from '../helpers/supabase-mock'
import { iniciarSesion, reiniciarSesion } from '../helpers/sesion-http'
import { adminUser } from '../fixtures/users'

const { repo } = vi.hoisted(() => ({
  repo: {
    findUserByEmail: vi.fn().mockResolvedValue(null),
    findUserById: vi.fn(),
    updateUser: vi.fn(),
    createUserWithType: vi.fn(async (d: Record<string, unknown>) => ({ id: 'n', activo: true, ...d })),
    countUsers: vi.fn(),
  },
}))
vi.mock('../../config/supabase-only', () => supabaseModuleMock)
vi.mock('../../config/supabaseClient', () => supabaseModuleMock)
vi.mock('../../modules/auth/auth.repository', () => ({ authRepository: repo }))

import { app } from '../../app'

describe('DEF-45 — Misma política de contraseña en alta y recuperación', () => {
  beforeEach(() => vi.spyOn(console, 'log').mockImplementation(() => {}))
  afterEach(() => {
    vi.restoreAllMocks()
    reiniciarSesion()
  })

  it.each(['12345678', 'aaaaaaaa', 'password'])('create-user rechaza la clave débil "%s"', async (password) => {
    const res = await request(app)
      .post('/api/auth/create-user')
      .set('Authorization', iniciarSesion(adminUser))
      .send({ email: 'nuevo@udemedellin.edu.co', password, nombre: 'Nuevo', apellido: 'Docente', tipo_usuario: 'profesor' })

    expect(res.status).toBe(400)
  })
})
