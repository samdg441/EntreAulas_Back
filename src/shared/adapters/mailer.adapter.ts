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
    })
  }
}

export const mailerAdapter: MailerPort = new NodemailerAdapter()

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
