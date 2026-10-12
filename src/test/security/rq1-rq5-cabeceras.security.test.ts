import { afterEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { supabaseModuleMock } from '../helpers/supabase-mock'

vi.hoisted(() => {
  process.env.CORS_ORIGIN = 'https://entre-aulas-front.vercel.app'
})
vi.mock('../../config/supabase-only', () => supabaseModuleMock)
vi.mock('../../config/supabaseClient', () => supabaseModuleMock)

import { app } from '../../app'

const RUTAS_POST = ['/api/auth/login', '/api/auth/login-with-role', '/api/auth/forgot-password', '/api/auth/reset-password', '/api/auth/create-user']

describe('RQ1–RQ5 — Cabeceras, CORS y errores de cuerpo en /api/auth', () => {
  afterEach(() => vi.restoreAllMocks())

  it.each(RUTAS_POST)('%s no anuncia Express (x-powered-by)', async (ruta) => {
    const res = await request(app).post(ruta).send({})

    expect(res.headers['x-powered-by']).toBeUndefined()
  })

  it('el preflight de un origen NO autorizado no recibe Access-Control-Allow-Origin', async () => {
    const res = await request(app)
      .options('/api/auth/login')
      .set('Origin', 'https://sitio-malicioso.example')
      .set('Access-Control-Request-Method', 'POST')

    expect(res.headers['access-control-allow-origin']).not.toBe('*')
    expect(res.headers['access-control-allow-origin']).not.toBe('https://sitio-malicioso.example')
  })

  it('el preflight del front oficial sí se acepta', async () => {
    const res = await request(app)
      .options('/api/auth/login')
      .set('Origin', 'https://entre-aulas-front.vercel.app')
      .set('Access-Control-Request-Method', 'POST')

    expect(res.headers['access-control-allow-origin']).toBe('https://entre-aulas-front.vercel.app')
  })

  it.each(['/api/auth/login', '/api/auth/forgot-password', '/api/auth/reset-password'])('%s con un cuerpo de más de 100 KB → 413', async (ruta) => {
    const res = await request(app).post(ruta).send({ email: 'a'.repeat(150_000) })

    expect(res.status).toBe(413)
  })

  it.each(RUTAS_POST)('%s con JSON mal formado → 400 (no 500)', async (ruta) => {
    const res = await request(app).post(ruta).set('Content-Type', 'application/json').send('{"email": ')

    expect(res.status).toBe(400)
  })

  it('un método no permitido en login no ejecuta la lógica de login', async () => {
    const res = await request(app).get('/api/auth/login')

    expect(res.status).toBe(404)
  })

  it('HTTP verb tampering: PUT/DELETE sobre create-user no crean usuarios', async () => {
    for (const metodo of ['put', 'delete', 'patch'] as const) {
      const res = await request(app)[metodo]('/api/auth/create-user').send({})
      expect(res.status, metodo).toBe(404)
    }
  })
})
