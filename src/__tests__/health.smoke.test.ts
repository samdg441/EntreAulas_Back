import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { app } from '../app'

describe('Smoke API', () => {
  it('GET /health responde ok', async () => {
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
  })

  it('GET /api/openapi.json expone contrato', async () => {
    const res = await request(app).get('/api/openapi.json')
    expect(res.status).toBe(200)
    expect(res.body.openapi).toBe('3.0.3')
    expect(res.body.paths['/api/auth/login']).toBeTruthy()
  })
})
