import nodemailer from 'nodemailer'

/**
 * Facade/Adapter sobre Nodemailer.
 * Aísla SMTP del resto de la aplicación (V&V / tests con mock).
 */
export interface MailOptions {
  to: string
  subject: string
  text?: string
  html?: string
}

export interface MailerPort {
  sendMail(opts: MailOptions): Promise<void>
}

function env(name: string): string {
  return String(process.env[name] || '').trim()
}

class NodemailerAdapter implements MailerPort {
  private getTransporter() {
    return nodemailer.createTransport({
      host: env('SMTP_HOST'),
      port: Number(env('SMTP_PORT') || '587'),
      secure: env('SMTP_SECURE') === 'true',
      auth: {
        user: env('SMTP_USER'),
        pass: env('SMTP_PASS'),
      },
    })
  }

  async sendMail(opts: MailOptions): Promise<void> {
    const transporter = this.getTransporter()
    await transporter.sendMail({
      from: env('SMTP_FROM'),
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
    })
  }
}

export const mailerAdapter: MailerPort = new NodemailerAdapter()

export async function sendMail(opts: MailOptions): Promise<void> {
  return mailerAdapter.sendMail(opts)
}

export function getTransporter() {
  return nodemailer.createTransport({
    host: env('SMTP_HOST'),
    port: Number(env('SMTP_PORT') || '587'),
    secure: env('SMTP_SECURE') === 'true',
    auth: {
      user: env('SMTP_USER'),
      pass: env('SMTP_PASS'),
    },
  })
}
