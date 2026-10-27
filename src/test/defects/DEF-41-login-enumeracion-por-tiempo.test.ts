/**
 * DEF-41 — El login permite enumerar cuentas por tiempo de respuesta (RQ2)
 *
 * Severidad: Media | Estado: CORREGIDO (2026-10-26)
 *
 * Con correo inexistente el login responde sin ejecutar bcrypt (≈ 5 ms); con correo existente y clave
 * incorrecta ejecuta bcrypt con 12 rondas (≈ 300–400 ms). Aunque el cuerpo sea idéntico (RQ19), el
 * atacante distingue qué correos están registrados midiendo el tiempo. Corrección: comparar siempre
 * contra un hash ficticio cuando el usuario no existe.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { supabaseModuleMock } from '../helpers/supabase-mock'
import { hashPassword } from '../../utils/passwordSecurity'

const { repo } = vi.hoisted(() => ({
  repo: { findUserByEmail: vi.fn(), findUserById: vi.fn(), updateUser: vi.fn(), createUserWithType: vi.fn(), countUsers: vi.fn() },
}))
vi.mock('../../config/supabase-only', () => supabaseModuleMock)
vi.mock('../../config/supabaseClient', () => supabaseModuleMock)
vi.mock('../../modules/auth/auth.repository', () => ({ authRepository: repo }))

import { app } from '../../app'

const medir = async (email: string) => {
  const inicio = performance.now()
  await request(app).post('/api/auth/login').send({ email, password: 'Mala-Clave2026!' })
  return performance.now() - inicio
}

describe('DEF-41 — Tiempo de respuesta uniforme en el login', () => {
  afterEach(() => vi.restoreAllMocks())

  it('un correo inexistente tarda al menos la mitad que uno existente', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const hash = await hashPassword('Clave-Segura2026!')
    const cuenta = { id: 'u-1', email: 'ana@soyudemedellin.edu.co', tipo_usuario: 'estudiante', activo: true, password: hash }

    repo.findUserByEmail.mockResolvedValue(cuenta)
    await medir(cuenta.email) // calentamiento
    const existente = await medir(cuenta.email)

    repo.findUserByEmail.mockResolvedValue(null)
    const inexistente = await medir('nadie@soyudemedellin.edu.co')

    expect(inexistente, `inexistente ${inexistente.toFixed(0)} ms vs existente ${existente.toFixed(0)} ms`).toBeGreaterThan(existente * 0.5)
  })
})
