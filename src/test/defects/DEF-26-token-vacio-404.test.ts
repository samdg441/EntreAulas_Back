/**
 * DEF-26 — GET /qr-evaluaciones/ vacío no es 400 (RQ17)
 *
 * Severidad: Baja | Estado: ABIERTO
 *
 * El grafo de RQ17 (C1) pide 400 "Token requerido" cuando no hay token.
 * El handler sí lo hace si `params.token` es vacío, pero Express no monta
 * GET /api/qr-evaluaciones/ sobre `/:token`, así que la respuesta es 404.
 */
import { describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { supabaseModuleMock } from '../helpers/supabase-mock'

vi.mock('../../config/supabase-only', () => supabaseModuleMock)
vi.mock('../../config/supabaseClient', () => supabaseModuleMock)

import { app } from '../../app'

describe('DEF-26 — Sin token en la URL debe ser 400 Token requerido', () => {
  it('GET /api/qr-evaluaciones/ responde 400', async () => {
    const res = await request(app).get('/api/qr-evaluaciones/')
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Token requerido/i)
  })
})
