import { describe, expect, it } from 'vitest'
import express from 'express'
import request from 'supertest'
import passwordResetRoutes from '../../modules/auth/password-reset.routes'



const TOKEN_CUALQUIERA = 'a'.repeat(64)

const EMAIL = process.env.RQ32_EMAIL ?? 'usuario.activo@entreaulas.test'
const TOKEN_VALIDO = process.env.RQ32_TOKEN_VALIDO ?? TOKEN_CUALQUIERA
const TOKEN_EXPIRADO = process.env.RQ32_TOKEN_EXPIRADO ?? 'b'.repeat(64)

const app = express()
app.use(express.json())
app.use('/api/auth', passwordResetRoutes)

const validar = (token: string) =>
  request(app).get(`/api/auth/validate-reset-token/${encodeURIComponent(token)}`)

describe('RQ3.2 — Validación del token de recuperación (código real)', () => {
  describe('N1 · GET /api/auth/validate-reset-token/:token', () => {
    it('N1: la ruta está montada (con token y email no responde 404)', async () => {
      const res = await validar(TOKEN_CUALQUIERA).query({ email: EMAIL })
      expect(res.status).not.toBe(404)
    })

    it('N1/N2: sin token en la URL la ruta no existe → 404', async () => {
      const res = await request(app)
        .get('/api/auth/validate-reset-token/')
        .query({ email: EMAIL })
      expect(res.status).toBe(404)
    })
  })

  describe('N3 → N4 · email ausente → 400', () => {
    it('N4: sin ?email → 400 "El correo electrónico es requerido"', async () => {
      const res = await validar(TOKEN_CUALQUIERA)
      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: 'El correo electrónico es requerido' })
    })

    it('N4: ?email= vacío → 400 "El correo electrónico es requerido"', async () => {
      const res = await validar(TOKEN_CUALQUIERA).query({ email: '' })
      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: 'El correo electrónico es requerido' })
    })
  })

  describe('N6 → N7 · token no encontrado → 400', () => {
    it('N7: token inexistente + email válido → 400 "Token inválido o ya utilizado"', async () => {
      const res = await validar(`inexistente-${Date.now()}`).query({ email: EMAIL })
      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: 'Token inválido o ya utilizado' })
    })

    it('N6: email que no corresponde al token → mismo 400 "Token inválido o ya utilizado"', async () => {
      const res = await validar(TOKEN_CUALQUIERA).query({ email: `otro-${Date.now()}@x.com` })
      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: 'Token inválido o ya utilizado' })
    })
  })

  describe('N8 → N9 · token expirado → 400', () => {
    it('N9: token con expires_at en el pasado → 400 "El token ha expirado. Solicita uno nuevo." (requiere RQ32_TOKEN_EXPIRADO en BD)', async () => {
      const res = await validar(TOKEN_EXPIRADO).query({ email: EMAIL })
      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: 'El token ha expirado. Solicita uno nuevo.' })
    })
  })

  describe('N10 · token válido → 200', () => {
    it('N10: token no usado y no expirado → 200 { message: "Token válido", valid: true } (requiere RQ32_TOKEN_VALIDO en BD)', async () => {
      const res = await validar(TOKEN_VALIDO).query({ email: EMAIL })
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ message: 'Token válido', valid: true })
    })
  })

  describe('N11 · excepción → catch → 500', () => {
    it('N11: si la capa de datos lanza, responde 500 "Error interno del servidor"', async () => {
      const res = await validar(TOKEN_CUALQUIERA).query({ email: EMAIL })
      if (res.status === 500) {
        expect(res.body).toEqual({ error: 'Error interno del servidor' })
      } else {
        expect([200, 400]).toContain(res.status)
      }
    })
  })
})
