import { afterAll, beforeAll, describe, it } from 'vitest'
import { expect } from 'chai'
import net from 'net'
import jwt from 'jsonwebtoken'
import request from 'supertest'
import type { Response as SupertestResponse } from 'supertest'
import { supabaseAdmin } from '../../config/supabase-only'
import { app } from '../../app'

const ADMIN_EMAIL = 'rq1.admin@entreaulas.test'
const EMAIL_NUEVO = 'rq1-5.regresion@entreaulas.test'
const PASSWORD_INICIAL = 'Password123!'
const PASSWORD_NUEVA = 'NuevaClave456?'

async function tokenAdminValido(): Promise<string> {
  const { data } = await supabaseAdmin.from('usuarios').select('id').eq('email', ADMIN_EMAIL).single()
  if (!data) {
    throw new Error(
      `Falta el fixture ${ADMIN_EMAIL}. Corre: npx ts-node src/scripts/seed-rq1-rq2-fixtures.ts`
    )
  }
  return jwt.sign({ userId: (data as { id: string }).id }, process.env.JWT_SECRET!, { expiresIn: '1h' })
}

async function limpiarUsuarioDeRegresion(): Promise<void> {
  const { data: usuario } = await supabaseAdmin
    .from('usuarios')
    .select('id')
    .eq('email', EMAIL_NUEVO)
    .maybeSingle()

  await supabaseAdmin.from('password_reset_tokens').delete().eq('email', EMAIL_NUEVO)

  if (!usuario) return
  const usuarioId = (usuario as { id: string }).id
  await supabaseAdmin.from('estudiantes').delete().eq('usuario_id', usuarioId)
  await supabaseAdmin.from('usuario_roles').delete().eq('usuario_id', usuarioId)
  await supabaseAdmin.from('usuarios').delete().eq('id', usuarioId)
}


interface EstadoSmtp {
  enData: boolean
  buffer: string
}

function procesarComandoSmtp(linea: string, socket: net.Socket, estado: EstadoSmtp): void {
  const cmd = linea.slice(0, 4).toUpperCase()
  if (cmd === 'EHLO' || cmd === 'HELO') socket.write('250 buzon-test\r\n')
  else if (cmd === 'DATA') {
    socket.write('354 fin con <CRLF>.<CRLF>\r\n')
    estado.enData = true
  } else if (cmd === 'QUIT') {
    socket.write('221 adios\r\n')
    socket.end()
  } else {
    socket.write('250 OK\r\n')
  }
}

function procesarChunkSmtp(chunk: Buffer, socket: net.Socket, mensajes: string[], estado: EstadoSmtp): void {
  const texto = chunk.toString('utf8')
  if (estado.enData) {
    estado.buffer += texto
    if (estado.buffer.includes('\r\n.\r\n')) {
      const decodificado = estado.buffer
        .replace(/=\r\n/g, '')
        .replace(/=([0-9A-F]{2})/g, (_m, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
      mensajes.push(decodificado)
      estado.enData = false
      estado.buffer = ''
      socket.write('250 mensaje aceptado\r\n')
    }
    return
  }
  for (const linea of texto.split('\r\n').filter(Boolean)) {
    procesarComandoSmtp(linea, socket, estado)
  }
}

function iniciarBuzonSmtp(): Promise<{ puerto: number; mensajes: string[]; cerrar: () => Promise<void> }> {
  const mensajes: string[] = []
  const server = net.createServer((socket) => {
    const estado: EstadoSmtp = { enData: false, buffer: '' }
    socket.write('220 buzon-test\r\n')
    socket.on('data', (chunk) => procesarChunkSmtp(chunk, socket, mensajes, estado))
    socket.on('error', () => undefined)
  })
  return new Promise((resolve) => {
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

async function esperarCorreo(buzon: { mensajes: string[] }): Promise<void> {
  const hasta = Date.now() + 2000
  while (buzon.mensajes.length === 0 && Date.now() < hasta) {
    await new Promise((r) => setTimeout(r, 50))
  }
}

const ENV_KEYS = [
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_SECURE',
  'SMTP_FROM',
  'NODE_ENV',
  'PASSWORD_RESET_DEBUG_RESPONSE',
] as const

interface ResultadoFlujo {
  alta?: SupertestResponse
  loginInicial?: SupertestResponse
  solicitud?: SupertestResponse
  mensajesCorreo?: string[]
  tokenDelCorreo?: string
  validacion?: SupertestResponse
  reset?: SupertestResponse
  loginConClaveVieja?: SupertestResponse
  loginConClaveNueva?: SupertestResponse
  revalidarTokenUsado?: SupertestResponse
  reusarTokenParaOtroReset?: SupertestResponse
  loginTrasIntentoDeReuso?: SupertestResponse
  errores: Record<string, unknown>
}

const resultado: ResultadoFlujo = { errores: {} }

async function paso(nombre: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn()
  } catch (e) {
    resultado.errores[nombre] = e
  }
}

describe('RQ1→RQ5 — Regresión de punta a punta: alta, login y recuperación de contraseña', () => {
  beforeAll(async () => {
    await limpiarUsuarioDeRegresion()

    await paso('rq1', async () => {
      const tokenAdmin = await tokenAdminValido()
      resultado.alta = await request(app)
        .post('/api/auth/create-user')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({
          email: EMAIL_NUEVO,
          password: PASSWORD_INICIAL,
          nombre: 'Regresion',
          apellido: 'E2E',
          tipo_usuario: 'estudiante',
        })
    })

    await paso('rq2-inicial', async () => {
      resultado.loginInicial = await request(app)
        .post('/api/auth/login')
        .send({ email: EMAIL_NUEVO, password: PASSWORD_INICIAL })
    })

    await paso('rq3.1-rq4', async () => {
      const buzon = await iniciarBuzonSmtp()
      const envPrevio: Record<string, string | undefined> = {}
      for (const k of ENV_KEYS) envPrevio[k] = process.env[k]

      try {
        process.env.SMTP_HOST = '127.0.0.1'
        process.env.SMTP_PORT = String(buzon.puerto)
        process.env.SMTP_SECURE = 'false'
        process.env.SMTP_FROM = 'recuperacion@entreaulas.test'
        process.env.NODE_ENV = 'production' 
        delete process.env.PASSWORD_RESET_DEBUG_RESPONSE

        resultado.solicitud = await request(app).post('/api/auth/forgot-password').send({ email: EMAIL_NUEVO })
        await esperarCorreo(buzon)
        resultado.mensajesCorreo = [...buzon.mensajes]

        const cuerpoCorreo = buzon.mensajes.join('\n')
        const enlace = cuerpoCorreo.match(/forgot-password\?token=([0-9a-f]{64})/)
        if (!enlace) throw new Error('el correo no llegó o no traía el enlace con el token de recuperación')
        resultado.tokenDelCorreo = enlace[1]
      } finally {
        await buzon.cerrar()
        for (const k of ENV_KEYS) {
          if (envPrevio[k] === undefined) delete process.env[k]
          else process.env[k] = envPrevio[k]
        }
      }
    })

    await paso('rq3.2', async () => {
      if (!resultado.tokenDelCorreo) throw new Error('no hay token de correo: falló el paso RQ3.1/RQ4')
      resultado.validacion = await request(app)
        .get(`/api/auth/validate-reset-token/${resultado.tokenDelCorreo}`)
        .query({ email: EMAIL_NUEVO })
    })

    await paso('rq5', async () => {
      if (!resultado.tokenDelCorreo) throw new Error('no hay token de correo: falló el paso RQ3.1/RQ4')
      resultado.reset = await request(app).post('/api/auth/reset-password').send({
        token: resultado.tokenDelCorreo,
        email: EMAIL_NUEVO,
        newPassword: PASSWORD_NUEVA,
        confirmPassword: PASSWORD_NUEVA,
      })
    })

    await paso('regresion-clave-vieja', async () => {
      resultado.loginConClaveVieja = await request(app)
        .post('/api/auth/login')
        .send({ email: EMAIL_NUEVO, password: PASSWORD_INICIAL })
    })

    await paso('regresion-clave-nueva', async () => {
      resultado.loginConClaveNueva = await request(app)
        .post('/api/auth/login')
        .send({ email: EMAIL_NUEVO, password: PASSWORD_NUEVA })
    })

    await paso('regresion-token-reusado', async () => {
      if (!resultado.tokenDelCorreo) throw new Error('no hay token de correo: falló el paso RQ3.1/RQ4')
      resultado.revalidarTokenUsado = await request(app)
        .get(`/api/auth/validate-reset-token/${resultado.tokenDelCorreo}`)
        .query({ email: EMAIL_NUEVO })

      resultado.reusarTokenParaOtroReset = await request(app).post('/api/auth/reset-password').send({
        token: resultado.tokenDelCorreo,
        email: EMAIL_NUEVO,
        newPassword: 'OtraClave789!',
        confirmPassword: 'OtraClave789!',
      })

      resultado.loginTrasIntentoDeReuso = await request(app)
        .post('/api/auth/login')
        .send({ email: EMAIL_NUEVO, password: PASSWORD_NUEVA })
    })
  }, 30000)

  afterAll(async () => {
    await limpiarUsuarioDeRegresion()
  })

  it('RQ1: el admin da de alta al usuario → 201 con los datos correctos', () => {
    expect(resultado.errores.rq1, 'el paso RQ1 no debería haber lanzado').to.be.undefined
    expect(resultado.alta?.status).to.equal(201)
    expect(resultado.alta?.body).to.have.property('message', 'Usuario creado exitosamente')
    expect(resultado.alta?.body.user).to.deep.include({
      email: EMAIL_NUEVO,
      tipo_usuario: 'estudiante',
      activo: true,
    })
  })

  it('RQ2: el usuario recién creado puede iniciar sesión de inmediato con la contraseña asignada', () => {
    expect(resultado.errores['rq2-inicial'], 'el paso RQ2 no debería haber lanzado').to.be.undefined
    expect(resultado.loginInicial?.status).to.equal(200)
    expect(resultado.loginInicial?.body.message).to.equal('Login exitoso')
    expect(resultado.loginInicial?.body.token).to.be.a('string').and.not.empty
  })

  it('RQ3.1 + RQ4: la solicitud de recuperación no expone el token en el JSON; llega por correo', () => {
    expect(resultado.errores['rq3.1-rq4'], 'el paso RQ3.1/RQ4 no debería haber lanzado').to.be.undefined
    expect(resultado.solicitud?.status).to.equal(200)
    expect(resultado.solicitud?.body).to.not.have.property('resetToken')
    expect(resultado.solicitud?.body).to.not.have.property('resetLink')
    expect(resultado.mensajesCorreo).to.have.length.greaterThan(0)
    expect(resultado.tokenDelCorreo).to.match(/^[0-9a-f]{64}$/)
  })

  it('RQ3.2: el token que llegó por correo es válido', () => {
    expect(resultado.errores['rq3.2'], 'el paso RQ3.2 no debería haber lanzado').to.be.undefined
    expect(resultado.validacion?.status).to.equal(200)
    expect(resultado.validacion?.body).to.deep.equal({ message: 'Token válido', valid: true })
  })

  it('RQ5: restablece la contraseña usando ese mismo token', () => {
    expect(resultado.errores.rq5, 'el paso RQ5 no debería haber lanzado').to.be.undefined
    expect(resultado.reset?.status).to.equal(200)
    expect(resultado.reset?.body).to.deep.equal({ message: 'Contraseña actualizada exitosamente' })
  })

  it('Regresión: tras el reset, la contraseña anterior deja de servir', () => {
    expect(resultado.errores['regresion-clave-vieja']).to.be.undefined
    expect(resultado.loginConClaveVieja?.status).to.equal(401)
    expect(resultado.loginConClaveVieja?.body).to.deep.equal({ error: 'Credenciales inválidas' })
  })

  it('Regresión: la contraseña nueva funciona de punta a punta', () => {
    expect(resultado.errores['regresion-clave-nueva']).to.be.undefined
    expect(resultado.loginConClaveNueva?.status).to.equal(200)
    expect(resultado.loginConClaveNueva?.body.message).to.equal('Login exitoso')
    expect(resultado.loginConClaveNueva?.body.token).to.be.a('string').and.not.empty
  })

  it('Regresión: el token ya usado no vuelve a servir, ni para validar ni para resetear otra vez', () => {
    expect(resultado.errores['regresion-token-reusado']).to.be.undefined
    expect(resultado.revalidarTokenUsado?.status).to.equal(400)
    expect(resultado.revalidarTokenUsado?.body).to.deep.equal({ error: 'Token inválido o ya utilizado' })

    expect(resultado.reusarTokenParaOtroReset?.status).to.equal(400)
    expect(resultado.reusarTokenParaOtroReset?.body).to.deep.equal({ error: 'Token inválido o ya utilizado' })

    // El intento de reuso no debe haber cambiado la contraseña otra vez.
    expect(resultado.loginTrasIntentoDeReuso?.status).to.equal(200)
    expect(resultado.loginTrasIntentoDeReuso?.body.message).to.equal('Login exitoso')
  })
})
