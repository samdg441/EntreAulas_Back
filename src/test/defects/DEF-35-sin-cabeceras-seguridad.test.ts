/**
 * DEF-35 — La API no envía cabeceras de seguridad HTTP (RQ18–RQ25)
 *
 * Severidad: Baja | Estado: ABIERTO | Visto en producción como DEF-API-04
 *
 * `app.ts` desactiva `x-powered-by`, pero no usa `helmet`: faltan `X-Content-Type-Options`,
 * `Strict-Transport-Security`, `X-Frame-Options` y `Referrer-Policy`. La imagen PNG del QR
 * y los JSON pueden ser reinterpretados por el navegador (MIME sniffing) o enmarcados.
 */
import { describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { supabaseModuleMock } from '../helpers/supabase-mock'

vi.mock('../../config/supabase-only', () => supabaseModuleMock)
vi.mock('../../config/supabaseClient', () => supabaseModuleMock)

import { app } from '../../app'

describe('DEF-35 — Cabeceras de seguridad', () => {
  it.each([
    ['x-content-type-options', /nosniff/],
    ['strict-transport-security', /max-age=\d+/],
    ['x-frame-options', /DENY|SAMEORIGIN/],
    ['referrer-policy', /.+/],
  ])('/health envía %s', async (cabecera, valor) => {
    const res = await request(app).get('/health')
    expect(res.headers[cabecera]).toMatch(valor)
  })
})
