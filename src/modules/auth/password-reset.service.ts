import crypto from 'crypto'
import type { MailerPort } from '../../shared/adapters/mailer.adapter'
import { mailerAdapter } from '../../shared/adapters/mailer.adapter'
import { hashPassword } from '../../utils/passwordSecurity'
import { PasswordResetError } from './password-reset.errors'
import {
  PasswordResetRepository,
  passwordResetRepository,
} from './password-reset.repository'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const TOKEN_TTL_MS = 60 * 60 * 1000
const GENERIC_REQUEST_MESSAGE =
  'Si el correo electrónico existe en nuestro sistema, recibirás un enlace de recuperación'

export interface RequestResetResult {
  message: string
  resetToken?: string
  resetLink?: string
}

export class PasswordResetService {
  constructor(
    private readonly repo: PasswordResetRepository = passwordResetRepository,
    private readonly mailer: MailerPort = mailerAdapter
  ) {}

  async requestReset(emailRaw: string): Promise<RequestResetResult> {
    const email = this.normalizeEmail(emailRaw)

    if (!email) {
      throw new PasswordResetError(400, 'El correo electrónico es requerido')
    }
    if (!EMAIL_REGEX.test(email)) {
      throw new PasswordResetError(400, 'Formato de correo electrónico inválido')
    }

    const debug = this.isDebugResponseEnabled()
    if (!this.isSmtpConfigured() && !debug) {
      throw new PasswordResetError(
        503,
        'Servicio de correo no configurado. Faltan variables SMTP en el backend.'
      )
    }

    const user = await this.repo.findActiveUserByEmail(email)
    if (!user) {
      return { message: GENERIC_REQUEST_MESSAGE }
    }

    const canonicalEmail = user.email
    const plainToken = crypto.randomBytes(32).toString('hex')
    const tokenHash = this.hashToken(plainToken)
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString()
    const resetLink = this.buildResetLink(plainToken, canonicalEmail)

    await this.repo.invalidateUnusedTokens(canonicalEmail)
    await this.repo.insertToken({ email: canonicalEmail, token: tokenHash, expiresAt })

    if (this.isSmtpConfigured()) {
      try {
        await this.sendRecoveryEmail({
          to: canonicalEmail,
          nombre: user.nombre,
          resetLink,
        })
      } catch (error) {
        console.error('Error enviando correo de recuperación:', error)
        if (!debug) {
          throw new PasswordResetError(
            500,
            'No se pudo enviar el correo de recuperación. Intenta de nuevo más tarde.'
          )
        }
        console.warn(
          'SMTP falló y PASSWORD_RESET_DEBUG_RESPONSE=true: se devuelve el enlace en la respuesta.'
        )
      }
    } else {
      console.warn(
        'SMTP no configurado: el enlace de recuperación solo se incluye en modo debug.'
      )
    }

    return {
      message: GENERIC_REQUEST_MESSAGE,
      ...(debug && { resetToken: plainToken, resetLink }),
    }
  }

  async validateResetToken(token: string, emailRaw: string): Promise<{ valid: true; message: string }> {
    await this.getValidToken(token, emailRaw)
    return { valid: true, message: 'Token válido' }
  }

  async resetPassword(input: {
    token: string
    email: string
    newPassword: string
    confirmPassword: string
  }): Promise<{ message: string }> {
    const { token, newPassword, confirmPassword } = input
    const email = this.normalizeEmail(input.email)

    if (!token || !email || !newPassword || !confirmPassword) {
      throw new PasswordResetError(400, 'Todos los campos son requeridos')
    }
    if (newPassword !== confirmPassword) {
      throw new PasswordResetError(400, 'Las contraseñas no coinciden')
    }

    const strengthError = this.validatePasswordStrength(newPassword)
    if (strengthError) {
      throw new PasswordResetError(400, strengthError)
    }

    const tokenRow = await this.getValidToken(token, email)

    const user = await this.repo.findActiveUserByEmail(email)
    if (!user) {
      throw new PasswordResetError(400, 'Usuario no encontrado')
    }

    const hashedPassword = await hashPassword(newPassword)
    await this.repo.updateUserPassword(user.id, hashedPassword)
    await this.repo.markTokenUsed(tokenRow.id)
    await this.repo.invalidateUnusedTokens(email)

    return { message: 'Contraseña actualizada exitosamente' }
  }

  private async getValidToken(token: string, emailRaw: string) {
    const email = this.normalizeEmail(emailRaw)

    if (!token) {
      throw new PasswordResetError(400, 'El token de recuperación es requerido')
    }
    if (!email) {
      throw new PasswordResetError(400, 'El correo electrónico es requerido')
    }

    const tokenRow = await this.repo.findUnusedToken(this.hashToken(token), email)
    if (!tokenRow) {
      throw new PasswordResetError(400, 'Token inválido o ya utilizado')
    }

    if (new Date() > new Date(tokenRow.expires_at)) {
      throw new PasswordResetError(400, 'El token ha expirado. Solicita uno nuevo.')
    }

    return tokenRow
  }

  private async sendRecoveryEmail(input: {
    to: string
    nombre: string
    resetLink: string
  }): Promise<void> {
    const subject = 'Recuperación de contraseña — EntreAulas'
    const text = [
      `Hola ${input.nombre},`,
      '',
      'Recibimos una solicitud para restablecer la contraseña de tu cuenta en EntreAulas.',
      'Abre el siguiente enlace (válido por 1 hora):',
      input.resetLink,
      '',
      'Si no solicitaste este cambio, ignora este correo. Tu contraseña no se modificará.',
    ].join('\n')

    const html = `
      <div style="font-family: Arial, sans-serif; color: #111827; max-width: 560px; margin: 0 auto;">
        <h2 style="color: #b91c1c; margin-bottom: 8px;">EntreAulas</h2>
        <p>Hola ${this.escapeHtml(input.nombre)},</p>
        <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta. El enlace caduca en <strong>1 hora</strong>.</p>
        <p style="margin: 24px 0;">
          <a href="${input.resetLink}"
             style="background:#b91c1c;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block;">
            Restablecer contraseña
          </a>
        </p>
        <p style="font-size: 13px; color: #4b5563;">
          Si el botón no funciona, copia y pega esta URL en tu navegador:<br/>
          <a href="${input.resetLink}">${input.resetLink}</a>
        </p>
        <p style="font-size: 13px; color: #6b7280;">
          Si no solicitaste este cambio, ignora este correo. Tu contraseña no se modificará.
        </p>
      </div>
    `

    await this.mailer.sendMail({ to: input.to, subject, text, html })
  }

  validatePasswordStrength(password: string): string | null {
    if (password.length < 8) {
      return 'La contraseña debe tener al menos 8 caracteres'
    }
    if (!/[A-Z]/.test(password)) {
      return 'La contraseña debe contener al menos una letra mayúscula'
    }
    if (!/[a-z]/.test(password)) {
      return 'La contraseña debe contener al menos una letra minúscula'
    }
    if (!/\d/.test(password)) {
      return 'La contraseña debe contener al menos un número'
    }
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      return 'La contraseña debe contener al menos un carácter especial'
    }
    return null
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex')
  }

  private normalizeEmail(email: string): string {
    return String(email || '').trim()
  }

  private buildResetLink(token: string, email: string): string {
    const base = String(
      process.env.FRONTEND_URL || process.env.CORS_ORIGIN || 'http://localhost:5173'
    ).replace(/\/+$/, '')
    return `${base}/reset-password?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`
  }

  private isSmtpConfigured(): boolean {
    return Boolean(
      process.env.SMTP_HOST?.trim() &&
        process.env.SMTP_USER?.trim() &&
        process.env.SMTP_PASS?.trim() &&
        process.env.SMTP_FROM?.trim()
    )
  }

  private isDebugResponseEnabled(): boolean {
    return (
      process.env.PASSWORD_RESET_DEBUG_RESPONSE === 'true' &&
      process.env.NODE_ENV !== 'production'
    )
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }
}

export const passwordResetService = new PasswordResetService()
