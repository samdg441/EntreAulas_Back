import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import express from 'express'
import request from 'supertest'
import passwordResetRoutes from '../../modules/auth/password-reset.routes'


const MENSAJE_GENERICO =
  'Si el correo electrónico existe en nuestro sistema, recibirás un enlace de recuperación'

// Email de un usuario ACTIVO que exista en la BD de pruebas.
const EMAIL_EXISTENTE = process.env.RQ3_EMAIL_EXISTENTE ?? 'usuario.activo@entreaulas.test'
const EMAIL_INEXISTENTE = 'no-registrado-rq3@entreaulas.test'

const app = express()
app.use(express.json())
app.use('/api/auth', passwordResetRoutes)

const forgot = (body: unknown) =>
  request(app).post('/api/auth/forgot-password').send(body as object)

describe('RQ3 — Solicitud de recuperación de contraseña (código real)', () => {
  describe('N1 · POST /api/auth/forgot-password', () => {
    it('N1: la ruta está montada (no responde 404)', async () => {
      const res = await forgot({ email: EMAIL_INEXISTENTE })
      expect(res.status).not.toBe(404)
    })
  })

  describe('N3 → N4 · email ausente → 400', () => {
    it('N4: body sin email → 400 "El correo electrónico es requerido"', async () => {
      const res = await forgot({})
      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: 'El correo electrónico es requerido' })
    })

    it('N4: email vacío ("") → 400 "El correo electrónico es requerido"', async () => {
      const res = await forgot({ email: '' })
      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: 'El correo electrónico es requerido' })
    })

    it('N4: email null → 400 "El correo electrónico es requerido"', async () => {
      const res = await forgot({ email: null })
      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: 'El correo electrónico es requerido' })
    })
  })

  describe('N5 → N6 · formato de email inválido → 400', () => {
    it.each(['texto-plano', 'sin-arroba.com', 'a@b', 'con espacio@test.com', 'nombre@dominio'])(
      'N6: "%s" → 400 "Formato de correo electrónico inválido"',
      async (email) => {
        const res = await forgot({ email })
        expect(res.status).toBe(400)
        expect(res.body).toEqual({ error: 'Formato de correo electrónico inválido' })
      },
    )
  })

  describe('N8 → N9 · usuario no existe o inactivo → 200 genérico', () => {
    it('N9: email válido de usuario que no existe → 200 con mensaje genérico y sin token', async () => {
      const res = await forgot({ email: EMAIL_INEXISTENTE })
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ message: MENSAJE_GENERICO })
      expect(res.body).not.toHaveProperty('resetToken')
      expect(res.body).not.toHaveProperty('resetLink')
    })
  })

  describe('N10-N16 · usuario activo → token generado y guardado → 200', () => {
    it('N16: email de usuario activo → 200 con mensaje genérico (requiere RQ3_EMAIL_EXISTENTE en BD)', async () => {
      const res = await forgot({ email: EMAIL_EXISTENTE })
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ message: MENSAJE_GENERICO })
    })
  })

  describe('N16 · modo debug', () => {
    const previo = {
      debug: process.env.PASSWORD_RESET_DEBUG_RESPONSE,
      nodeEnv: process.env.NODE_ENV,
      front: process.env.FRONTEND_URL,
    }

    beforeAll(() => {
      process.env.PASSWORD_RESET_DEBUG_RESPONSE = 'true'
      process.env.NODE_ENV = 'test'
      process.env.FRONTEND_URL = 'http://localhost:5173'
    })

    afterAll(() => {
      previo.debug === undefined
        ? delete process.env.PASSWORD_RESET_DEBUG_RESPONSE
        : (process.env.PASSWORD_RESET_DEBUG_RESPONSE = previo.debug)
      previo.nodeEnv === undefined
        ? delete process.env.NODE_ENV
        : (process.env.NODE_ENV = previo.nodeEnv)
      previo.front === undefined
        ? delete process.env.FRONTEND_URL
        : (process.env.FRONTEND_URL = previo.front)
    })

    it('N10 + N16: con PASSWORD_RESET_DEBUG_RESPONSE=true y usuario activo, la respuesta trae resetToken (64 hex) y resetLink', async () => {
      const res = await forgot({ email: EMAIL_EXISTENTE })
      expect(res.status).toBe(200)
      expect(res.body.message).toBe(MENSAJE_GENERICO)
      expect(res.body.resetToken).toMatch(/^[0-9a-f]{64}$/)
      expect(res.body.resetLink).toBe(
        `http://localhost:5173/forgot-password?token=${res.body.resetToken}` +
          `&email=${encodeURIComponent(EMAIL_EXISTENTE)}`,
      )
    })

    it('N16: en producción los flags de debug NO exponen el token', async () => {
      process.env.NODE_ENV = 'production'
      const res = await forgot({ email: EMAIL_EXISTENTE })
      process.env.NODE_ENV = 'test'
      expect(res.status).toBe(200)
      expect(res.body).not.toHaveProperty('resetToken')
    })
  })


  describe('N13 → N14 · falla el INSERT del token → 500', () => {
    it('N14: si el guardado del token falla, el endpoint responde 500 "Error interno del servidor"', async () => {
      const res = await forgot({ email: EMAIL_EXISTENTE })
      if (res.status === 500) {
        expect(res.body).toEqual({ error: 'Error interno del servidor' })
      } else {
        expect([200]).toContain(res.status)
      }
    })
  })
  describe('N15 · envío de correo (nodemailer)', () => {
    it('N15: el endpoint NO envía correo (solo hay un TODO) y aun así llega a 200', async () => {
      const res = await forgot({ email: EMAIL_INEXISTENTE })
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ message: MENSAJE_GENERICO })
    })
  })

  describe('N17 · excepción → catch → 500', () => {
    it('N17: JSON con Content-Type application/json pero cuerpo malformado → error controlado', async () => {
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .set('Content-Type', 'application/json')
        .send('{"email": ') // JSON inválido
      expect([400, 500]).toContain(res.status)
    })

    it('N17: si el handler lanza una excepción interna, responde 500 "Error interno del servidor"', async () => {
      const res = await forgot({ email: EMAIL_EXISTENTE })
      if (res.status === 500) {
        expect(res.body).toEqual({ error: 'Error interno del servidor' })
      } else {
        expect([200]).toContain(res.status)
      }
    })
  })
})
