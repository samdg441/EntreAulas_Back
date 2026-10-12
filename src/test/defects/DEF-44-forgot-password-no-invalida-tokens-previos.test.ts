/**
 * DEF-44 — Cada solicitud de recuperación deja vivos los tokens anteriores (RQ3.1)
 *
 * Severidad: Baja | Estado: ABIERTO
 *
 * Si el usuario pide el enlace varias veces, todos los tokens siguen válidos durante 1 h. Aumenta la
 * ventana de ataque (un correo antiguo reenviado o filtrado sigue sirviendo). Lo esperado: al emitir un
 * token nuevo se invalidan (used = true) los anteriores del mismo correo.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'

vi.mock('../../config/supabase-only', () => import('../helpers/dobles-supabase'))
vi.mock('../../config/supabaseClient', () => import('../helpers/dobles-supabase'))

import { app } from '../../app'
import { fakeDb } from '../helpers/fake-supabase'

describe('DEF-44 — Un solo token de recuperación vigente por usuario', () => {
  beforeEach(() => {
    fakeDb.reset()
    fakeDb.seed('usuarios', [{ id: 'u-1', email: 'ana@soyudemedellin.edu.co', nombre: 'Ana', activo: true, password: 'x' }])
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })
  afterEach(() => vi.restoreAllMocks())

  it('tras dos solicitudes solo queda un token sin usar', async () => {
    await request(app).post('/api/auth/forgot-password').send({ email: 'ana@soyudemedellin.edu.co' })
    await request(app).post('/api/auth/forgot-password').send({ email: 'ana@soyudemedellin.edu.co' })

    const vigentes = (fakeDb.filas('password_reset_tokens') as { used: boolean }[]).filter((t) => !t.used)

    expect(vigentes).toHaveLength(1)
  })
})
