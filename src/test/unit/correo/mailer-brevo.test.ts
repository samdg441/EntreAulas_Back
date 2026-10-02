import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseRemitente, sendMail } from '../../../shared/adapters/mailer.adapter'
import { brevoConfigured, mailConfigured } from '../../../shared/adapters/mail-config'

const fetchMock = vi.fn()

describe('Correo vía API de Brevo', () => {
  beforeEach(() => {
    process.env.BREVO_API_KEY = 'xkeysib-prueba'
    process.env.SMTP_FROM = 'EntreAulas <remitente@test.com>'
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    process.env.BREVO_API_KEY = ''
    process.env.SMTP_FROM = ''
    vi.unstubAllGlobals()
  })

  it('envía a la API de Brevo con la api-key, el remitente y el destinatario', async () => {
    fetchMock.mockResolvedValue(new Response('{"messageId":"1"}', { status: 201 }))

    await sendMail({ to: 'destino@test.com', subject: 'Hola', text: 'texto', html: '<p>html</p>' })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.brevo.com/v3/smtp/email')
    expect(init.headers['api-key']).toBe('xkeysib-prueba')
    expect(JSON.parse(init.body)).toEqual({
      sender: { name: 'EntreAulas', email: 'remitente@test.com' },
      to: [{ email: 'destino@test.com' }],
      subject: 'Hola',
      textContent: 'texto',
      htmlContent: '<p>html</p>',
    })
  })

  it('manda los adjuntos en base64 con su nombre', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 201 }))

    await sendMail({
      to: 'destino@test.com',
      subject: 'QR',
      text: 't',
      attachments: [{ filename: 'QR-C1-G1.png', content: Buffer.from('png'), contentType: 'image/png' }],
    })

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.attachment).toEqual([{ name: 'QR-C1-G1.png', content: Buffer.from('png').toString('base64') }])
  })

  it('lanza error con el detalle cuando Brevo rechaza el envío', async () => {
    fetchMock.mockResolvedValue(new Response('{"message":"sender not valid"}', { status: 400 }))

    await expect(sendMail({ to: 'destino@test.com', subject: 'Hola', text: 't' })).rejects.toThrow(
      /Brevo respondió 400: .*sender not valid/
    )
  })

  it('no usa la API si falta BREVO_API_KEY', () => {
    process.env.BREVO_API_KEY = ''
    expect(brevoConfigured()).toBe(false)
    expect(mailConfigured({ smtpAuth: false })).toBe(false)
  })

  it('con BREVO_API_KEY el correo cuenta como configurado aunque no haya SMTP', () => {
    expect(mailConfigured({ smtpAuth: true })).toBe(true)
  })
})

describe('parseRemitente', () => {
  it.each([
    ['EntreAulas <a@b.com>', { name: 'EntreAulas', email: 'a@b.com' }],
    ['"Entre Aulas" <a@b.com>', { name: 'Entre Aulas', email: 'a@b.com' }],
    ['<a@b.com>', { email: 'a@b.com' }],
    ['a@b.com', { email: 'a@b.com' }],
  ])('%s', (entrada, esperado) => {
    expect(parseRemitente(entrada)).toEqual(esperado)
  })
})
