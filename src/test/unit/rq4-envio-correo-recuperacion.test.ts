import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import net from 'net'
import express from 'express'
import request from 'supertest'
import passwordResetRoutes from '../../modules/auth/password-reset.routes'

const MENSAJE_GENERICO =
  'Si el correo electrónico existe en nuestro sistema, recibirás un enlace de recuperación'

// Usuario ACTIVO que exista en la BD de pruebas (necesario para N5).
const EMAIL_EXISTENTE =
  process.env.RQ4_EMAIL_EXISTENTE ?? process.env.RQ3_EMAIL_EXISTENTE ?? 'usuario.activo@entreaulas.test'
const EMAIL_INEXISTENTE = 'no-registrado-rq4@entreaulas.test'

const app = express()
app.use(express.json())
app.use('/api/auth', passwordResetRoutes)

const forgot = (email: unknown) =>
  request(app).post('/api/auth/forgot-password').send({ email })


function iniciarBuzonSmtp(): Promise<{ puerto: number; mensajes: string[]; cerrar: () => Promise<void> }> {
  const mensajes: string[] = []
  return new Promise((resolve) => {
    const server = net.createServer((socket) => {
      let enData = false
      let buffer = ''
      socket.write('220 buzon-test\r\n')
      socket.on('data', (chunk) => {
        const texto = chunk.toString('utf8')
        if (enData) {
          buffer += texto
          if (buffer.includes('\r\n.\r\n')) {
            mensajes.push(buffer)
            enData = false
            buffer = ''
            socket.write('250 mensaje aceptado\r\n')
          }
          return
        }
        for (const linea of texto.split('\r\n').filter(Boolean)) {
          const cmd = linea.slice(0, 4).toUpperCase()
          if (cmd === 'EHLO' || cmd === 'HELO') socket.write('250 buzon-test\r\n')
          else if (cmd === 'DATA') {
            socket.write('354 fin con <CRLF>.<CRLF>\r\n')
            enData = true
          } else if (cmd === 'QUIT') {
            socket.write('221 adios\r\n')
            socket.end()
          } else socket.write('250 OK\r\n')
        }
      })
      socket.on('error', () => undefined)
    })
    server.listen(0, '127.0.0.1', () => {
      const dir = server.address() as net.AddressInfo
      resolve({
        puerto: dir.port,
        mensajes,
        cerrar: () => new Promise<void>((r) => server.close(() => r())),
      })
    })
  })
}

const ENV_KEYS = [
  'PASSWORD_RESET_DEBUG_RESPONSE',
  'NODE_ENV',
  'FRONTEND_URL',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_SECURE',
  'SMTP_USER',
  'SMTP_PASS',
  'SMTP_FROM',
] as const
let envPrevio: Record<string, string | undefined> = {}

beforeEach(() => {
  envPrevio = {}
  for (const k of ENV_KEYS) envPrevio[k] = process.env[k]
})

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (envPrevio[k] === undefined) delete process.env[k]
    else process.env[k] = envPrevio[k] as string
  }
})

describe('RQ4 — Envío de correo de recuperación (código real)', () => {

  describe('N2 · el endpoint debe enviar el correo de recuperación (requisito NO implementado — FALLA a propósito)', () => {
    const rutaFuente = join(__dirname, '../../modules/auth/password-reset.routes.ts')
    const fuente = readFileSync(rutaFuente, 'utf8')

    const configurarSmtp = (puerto: number) => {
      process.env.SMTP_HOST = '127.0.0.1'
      process.env.SMTP_PORT = String(puerto)
      process.env.SMTP_SECURE = 'false'
      process.env.SMTP_FROM = 'recuperacion@entreaulas.test'
      process.env.NODE_ENV = 'production' // sin modo debug: el único canal debe ser el correo
      delete process.env.PASSWORD_RESET_DEBUG_RESPONSE
    }

    const esperarMensaje = async (buzon: { mensajes: string[] }) => {
      const hasta = Date.now() + 1500
      while (buzon.mensajes.length === 0 && Date.now() < hasta) {
        await new Promise((r) => setTimeout(r, 50))
      }
    }

    it('N2: el handler debe usar el servicio de correo (mailer.adapter / sendMail)', () => {
      expect(fuente).toMatch(/mailer\.adapter|mailerAdapter|sendMail\s*\(/)
    })

    it('N2: no debe quedar pendiente el TODO de envío de correo', () => {
      expect(fuente).not.toMatch(/TODO:\s*enviar correo con enlace/)
    })

    it('N2: al solicitar recuperación de un usuario activo, el endpoint entrega un correo al servidor SMTP', async () => {
      const buzon = await iniciarBuzonSmtp()
      try {
        configurarSmtp(buzon.puerto)
        const res = await forgot(EMAIL_EXISTENTE)
        expect(res.status).toBe(200)
        await esperarMensaje(buzon)
        expect(buzon.mensajes.length).toBeGreaterThan(0)
      } finally {
        await buzon.cerrar()
      }
    })

    it('N2: el correo enviado contiene el enlace de recuperación con el token', async () => {
      const buzon = await iniciarBuzonSmtp()
      try {
        configurarSmtp(buzon.puerto)
        await forgot(EMAIL_EXISTENTE)
        await esperarMensaje(buzon)
        const cuerpo = buzon.mensajes.join('\n')
        expect(cuerpo).toMatch(/forgot-password\?token=[0-9a-f]{64}/)
      } finally {
        await buzon.cerrar()
      }
    })

    it('N2: el correo se dirige a la dirección del usuario que lo solicitó', async () => {
      const buzon = await iniciarBuzonSmtp()
      try {
        configurarSmtp(buzon.puerto)
        await forgot(EMAIL_EXISTENTE)
        await esperarMensaje(buzon)
        const cuerpo = buzon.mensajes.join('\n').toLowerCase()
        expect(cuerpo).toContain(`rcpt to:<${EMAIL_EXISTENTE.toLowerCase()}>`)
      } finally {
        await buzon.cerrar()
      }
    })

    it('N2: en producción NO se debe exponer el token en el JSON (debe ir por correo)', async () => {
      // Complemento del anterior: hoy en producción el usuario no recibe NADA
      // (ni token en JSON ni correo). Este test documenta que el único canal
      // válido debería ser el correo y que ese canal no existe.
      const buzon = await iniciarBuzonSmtp()
      try {
        configurarSmtp(buzon.puerto)
        const res = await forgot(EMAIL_EXISTENTE)
        expect(res.body).not.toHaveProperty('resetToken')
        await esperarMensaje(buzon)
        // Si no hay token en el JSON, el correo es obligatorio:
        expect(buzon.mensajes.length).toBeGreaterThan(0)
      } finally {
        await buzon.cerrar()
      }
    })
  })

  describe('N4 → N6 · debugReset = false → 200 sin token ni link ni correo', () => {
    it('N6: sin PASSWORD_RESET_DEBUG_RESPONSE → 200 solo { message }', async () => {
      delete process.env.PASSWORD_RESET_DEBUG_RESPONSE
      process.env.NODE_ENV = 'test'
      const res = await forgot(EMAIL_INEXISTENTE)
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ message: MENSAJE_GENERICO })
      expect(res.body).not.toHaveProperty('resetToken')
      expect(res.body).not.toHaveProperty('resetLink')
    })

    it('N6: PASSWORD_RESET_DEBUG_RESPONSE="false" → 200 sin token', async () => {
      process.env.PASSWORD_RESET_DEBUG_RESPONSE = 'false'
      process.env.NODE_ENV = 'development'
      const res = await forgot(EMAIL_INEXISTENTE)
      expect(res.status).toBe(200)
      expect(res.body).not.toHaveProperty('resetToken')
    })

    it('N4: PASSWORD_RESET_DEBUG_RESPONSE="true" pero NODE_ENV="production" → 200 sin token', async () => {
      process.env.PASSWORD_RESET_DEBUG_RESPONSE = 'true'
      process.env.NODE_ENV = 'production'
      const res = await forgot(EMAIL_EXISTENTE)
      expect(res.status).toBe(200)
      expect(res.body).not.toHaveProperty('resetToken')
      expect(res.body).not.toHaveProperty('resetLink')
    })

    it('N4: el flag debe ser exactamente "true" (cualquier otro valor → N6)', async () => {
      process.env.PASSWORD_RESET_DEBUG_RESPONSE = '1'
      process.env.NODE_ENV = 'test'
      const res = await forgot(EMAIL_EXISTENTE)
      expect(res.status).toBe(200)
      expect(res.body).not.toHaveProperty('resetToken')
    })
  })

  describe('N4 → N5 · debugReset = true → 200 con resetToken y resetLink', () => {
    beforeEach(() => {
      process.env.PASSWORD_RESET_DEBUG_RESPONSE = 'true'
      process.env.NODE_ENV = 'test'
    })

    it('N5: usuario activo + flags de debug → 200 con resetToken (64 hex) y message genérico', async () => {
      const res = await forgot(EMAIL_EXISTENTE)
      expect(res.status).toBe(200)
      expect(res.body.message).toBe(MENSAJE_GENERICO)
      expect(res.body.resetToken).toMatch(/^[0-9a-f]{64}$/)
    })

    it('N5: el resetLink usa FRONTEND_URL cuando está definido', async () => {
      process.env.FRONTEND_URL = 'https://app.entreaulas.com'
      const res = await forgot(EMAIL_EXISTENTE)
      expect(res.status).toBe(200)
      expect(res.body.resetLink).toBe(
        `https://app.entreaulas.com/forgot-password?token=${res.body.resetToken}` +
          `&email=${encodeURIComponent(EMAIL_EXISTENTE)}`,
      )
    })

    it('N5: el resetLink cae en http://localhost:5173 cuando FRONTEND_URL no está definido', async () => {
      delete process.env.FRONTEND_URL
      const res = await forgot(EMAIL_EXISTENTE)
      expect(res.status).toBe(200)
      expect(res.body.resetLink.startsWith('http://localhost:5173/forgot-password?')).toBe(true)
    })

    it('N5: el email del resetLink va codificado con encodeURIComponent', async () => {
      const emailConMas = 'prueba+rq4@entreaulas.test'
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: emailConMas })
      expect(res.status).toBe(200)
      expect(res.body.resetLink).toContain(`email=${encodeURIComponent(emailConMas)}`)
      expect(res.body.resetLink).not.toContain(`email=${emailConMas}`)
    })

    it('N5 vs N6: ambas ramas devuelven el mismo message genérico', async () => {
      const conDebug = await forgot(EMAIL_EXISTENTE)
      process.env.PASSWORD_RESET_DEBUG_RESPONSE = 'false'
      const sinDebug = await forgot(EMAIL_EXISTENTE)
      expect(conDebug.body.message).toBe(MENSAJE_GENERICO)
      expect(sinDebug.body.message).toBe(MENSAJE_GENERICO)
    })
  })

  describe('N4 · tabla de verdad de debugReset', () => {
    it.each([
      { flag: 'true', node_env: 'production', esperaToken: false },
      { flag: 'true', node_env: 'development', esperaToken: true },
      { flag: 'true', node_env: 'test', esperaToken: true },
      { flag: 'false', node_env: 'development', esperaToken: false },
      { flag: undefined, node_env: 'development', esperaToken: false },
    ])(
      'flag=$flag, NODE_ENV=$node_env → ¿token en respuesta? $esperaToken',
      async ({ flag, node_env, esperaToken }) => {
        if (flag === undefined) delete process.env.PASSWORD_RESET_DEBUG_RESPONSE
        else process.env.PASSWORD_RESET_DEBUG_RESPONSE = flag
        process.env.NODE_ENV = node_env

        const res = await forgot(EMAIL_EXISTENTE)
        expect(res.status).toBe(200)
        expect(Object.prototype.hasOwnProperty.call(res.body, 'resetToken')).toBe(esperaToken)
      },
    )
  })
})
