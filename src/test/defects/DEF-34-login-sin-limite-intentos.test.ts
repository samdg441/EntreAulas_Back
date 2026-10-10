/**
 * DEF-34 — El login no limita intentos fallidos (RQ19)
 *
 * Severidad: Alta | Estado: ABIERTO
 *
 * `/api/auth/login` responde 401 indefinidamente: un atacante puede probar contraseñas
 * sin freno (fuerza bruta / credential stuffing). Lo esperado es 429 tras N fallos
 * desde la misma IP en una ventana de tiempo (p. ej. express-rate-limit, 10 por 15 min).
 */
import { describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { supabaseModuleMock } from '../helpers/supabase-mock'

const { repo } = vi.hoisted(() => ({
  repo: { findUserByEmail: vi.fn().mockResolvedValue(null), findUserById: vi.fn(), updateUser: vi.fn(), createUserWithType: vi.fn(), countUsers: vi.fn() },
}))

vi.mock('../../config/supabase-only', () => supabaseModuleMock)
vi.mock('../../config/supabaseClient', () => supabaseModuleMock)
vi.mock('../../modules/auth/auth.repository', () => ({ authRepository: repo }))

import { app } from '../../app'

describe('DEF-34 — Fuerza bruta contra el login', () => {
  it('30 intentos fallidos seguidos terminan en 429', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const estados: number[] = []
    for (let i = 0; i < 30; i++) {
      const res = await request(app).post('/api/auth/login').send({ email: 'ana@udemedellin.edu.co', password: `Intento-${i}!` })
      estados.push(res.status)
    }
    expect(estados).toContain(429)
  })
})
