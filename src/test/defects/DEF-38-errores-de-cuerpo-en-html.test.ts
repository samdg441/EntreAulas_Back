/**
 * DEF-38 — JSON malformado y cuerpo demasiado grande responden HTML (RQ19/RQ18)
 *
 * Severidad: Baja | Estado: ABIERTO | Encontrado con Cypress contra Render
 *
 * El código de estado es correcto (400 / 413), pero el cuerpo es la página HTML por defecto
 * de Express (`<pre>Bad Request</pre>`), no `{ error }`. El front espera JSON en todos los
 * errores: `getApiErrorMessage` no encuentra el mensaje y muestra uno genérico.
 */
import { describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { supabaseModuleMock } from '../helpers/supabase-mock'

vi.mock('../../config/supabase-only', () => supabaseModuleMock)
vi.mock('../../config/supabaseClient', () => supabaseModuleMock)

import { app } from '../../app'

describe('DEF-38 — Los errores de lectura del cuerpo deben ser JSON', () => {
  it('JSON malformado → 400 application/json con { error }', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{mal')

    expect(res.status).toBe(400)
    expect(res.headers['content-type']).toMatch(/application\/json/)
    expect(res.body).toHaveProperty('error')
  })

  it('cuerpo de más de 100 KB → 413 application/json con { error }', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'a@udemedellin.edu.co', password: 'x'.repeat(200_000) })

    expect(res.status).toBe(413)
    expect(res.headers['content-type']).toMatch(/application\/json/)
    expect(res.body).toHaveProperty('error')
  })
})
