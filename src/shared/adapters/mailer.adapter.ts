import nodemailer from 'nodemailer'
import { brevoConfigured } from './mail-config'

/**
 * Facade/Adapter sobre Nodemailer y la API de Brevo.
 * Aísla el envío de correo del resto de la aplicación (V&V / tests con mock).
 */
export interface MailOptions {
  to: string
  subject: string
  text?: string
  html?: string
  encoding?: string
}

export interface MailerPort {
  sendMail(opts: MailOptions): Promise<void>
}

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email'

class NodemailerAdapter implements MailerPort {
  private getTransporter() {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    })
  }

  async sendMail(opts: MailOptions): Promise<void> {
    const transporter = this.getTransporter()
    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
      encoding: opts.encoding,
    })
  }
}

/** Convierte "Nombre <correo@x.com>" en el objeto sender que espera Brevo. */
export function parseRemitente(from: string): { name?: string; email: string } {
  const abre = from.lastIndexOf('<')
  const cierra = from.lastIndexOf('>')
  if (abre === -1 || cierra < abre) return { email: from.trim() }
  const email = from.slice(abre + 1, cierra).trim()
  const name = from.slice(0, abre).trim().replace(/^"|"$/g, '')
  return name ? { name, email } : { email }
}

class BrevoApiAdapter implements MailerPort {
  async sendMail(opts: MailOptions): Promise<void> {
    const res = await fetch(BREVO_URL, {
      method: 'POST',
      headers: {
        'api-key': String(process.env.BREVO_API_KEY),
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: parseRemitente(String(process.env.SMTP_FROM)),
        to: [{ email: opts.to }],
        subject: opts.subject,
        textContent: opts.text,
        htmlContent: opts.html,
      }),
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) {
      throw new Error(`Brevo respondió ${res.status}: ${await res.text()}`)
    }
  }
}

const smtpAdapter = new NodemailerAdapter()
const brevoAdapter = new BrevoApiAdapter()

export const mailerAdapter: MailerPort = {
  sendMail: (opts) => (brevoConfigured() ? brevoAdapter : smtpAdapter).sendMail(opts),
}

export async function sendMail(opts: MailOptions): Promise<void> {
  return mailerAdapter.sendMail(opts)
}

export function getTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  })
}
