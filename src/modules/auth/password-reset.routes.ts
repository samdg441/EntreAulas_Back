import { Router } from 'express'
import { hashPassword } from '../../utils/passwordSecurity'
import {
  badRequest,
  internal,
  asyncHandler
} from '../../shared/errors'
import { logger } from '../../shared/logger'
import { sendMail } from '../../shared/adapters/mailer.adapter'
import { authRepository } from './auth.repository'
import {
  buscarTokenDeResetValido,
  generateExpirationDate,
  generateResetToken,
  validarFortalezaPassword
} from './password-reset.service'

const router = Router()

function appBaseUrl(): string {
  return String(process.env.FRONTEND_URL || 'http://localhost:5173')
}

function smtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM)
}

async function enviarCorreoRecuperacion(email: string, resetLink: string): Promise<void> {
  if (!smtpConfigured()) return

  try {
    await sendMail({
      to: email,
      subject: 'Recuperación de contraseña - EntreAulas',
      text:
        'Solicitaste recuperar tu contraseña. Usa el siguiente enlace (válido por 1 hora) ' +
        `para continuar:\n\n${resetLink}`,
      html:
        '<p>Solicitaste recuperar tu contraseña. Usa el siguiente enlace ' +
        `(válido por 1 hora) para continuar:</p><p><a href="${resetLink}">${resetLink}</a></p>`,
      encoding: '7bit'
    })
  } catch (mailError) {
    logger.error('Error enviando correo de recuperación:', mailError)
  }
}

// Endpoint para solicitar reset de contraseña
router.post('/forgot-password', asyncHandler(async (req, res) => {
  const { email } = req.body

  // Validar que se proporcione el email
  if (!email) {
    throw badRequest('El correo electrónico es requerido')
  }

  // Validar formato de email
  const emailRegex = /^[^\s@]+@[^\s@.]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    throw badRequest('Formato de correo electrónico inválido')
  }

  // Verificar que el usuario existe
  const user = await authRepository.findActiveByEmail(email)

  if (!user) {
    // No revelar si el correo existe
    return res.status(200).json({
      message: 'Si el correo electrónico existe en nuestro sistema, recibirás un enlace de recuperación'
    })
  }

  // Generar token de reset
  const resetToken = generateResetToken()
  const expiresAt = generateExpirationDate()

  // Guardar token en la base de datos
  try {
    await authRepository.insertResetToken({
      email: email,
      token: resetToken,
      expires_at: expiresAt,
      used: false
    })
  } catch (tokenError) {
    throw internal('Error interno del servidor', tokenError)
  }

  // Enviar correo con enlace de recuperación; nunca devolver el token en JSON en producción.
  const resetLink = `${appBaseUrl()}/forgot-password?token=${resetToken}&email=${encodeURIComponent(email)}`
  await enviarCorreoRecuperacion(email, resetLink)

  const debugReset =
    process.env.PASSWORD_RESET_DEBUG_RESPONSE === 'true' &&
    process.env.NODE_ENV !== 'production'

  res.status(200).json({
    message:
      'Si el correo electrónico existe en nuestro sistema, recibirás un enlace de recuperación',
    ...(debugReset && {
      resetToken,
      resetLink
    })
  })
}))

// Endpoint para validar token de reset
router.get('/validate-reset-token/:token', asyncHandler(async (req, res) => {
  const { token } = req.params
  const { email } = req.query

  if (!email || typeof email !== 'string') {
    throw badRequest('El correo electrónico es requerido')
  }

  await buscarTokenDeResetValido(token, email)

  res.status(200).json({
    message: 'Token válido',
    valid: true
  })
}))

// Endpoint para resetear la contraseña
router.post('/reset-password', asyncHandler(async (req, res) => {
  const { token, email, newPassword, confirmPassword } = req.body

  // Validar datos requeridos
  if (!token || !email || !newPassword || !confirmPassword) {
    throw badRequest('Todos los campos son requeridos')
  }

  // Validar que las contraseñas coincidan
  if (newPassword !== confirmPassword) {
    throw badRequest('Las contraseñas no coinciden')
  }

  // Validar fortaleza de la contraseña
  const passwordError = validarFortalezaPassword(newPassword)
  if (passwordError) {
    throw badRequest(passwordError)
  }

  // Buscar y validar el token
  const tokenData = await buscarTokenDeResetValido(token, email)

  // Verificar que el usuario existe
  const user = await authRepository.findActiveByEmail(email, 'id, email') as { id: string; email: string } | null

  if (!user) {
    throw badRequest('Usuario no encontrado')
  }

  const hashedPassword = await hashPassword(newPassword)

  // Actualizar la contraseña del usuario
  try {
    await authRepository.updateUser(user.id, {
      password: hashedPassword,
      updated_at: new Date().toISOString()
    })
  } catch (updateError) {
    throw internal('Error al actualizar la contraseña', updateError)
  }

  // Marcar el token como usado
  const markUsedError = await authRepository.markResetTokenUsed(tokenData.id)

  if (markUsedError) {
    logger.error('Error al marcar token como usado:', markUsedError)
  }

  res.status(200).json({
    message: 'Contraseña actualizada exitosamente'
  })
}))

export default router
