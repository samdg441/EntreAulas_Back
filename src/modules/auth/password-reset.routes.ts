import { Router } from 'express'
import crypto from 'crypto'
import { hashPassword } from '../../utils/passwordSecurity'
import {
  badRequest,
  internal,
  sendError,
} from '../../shared/errors'
import { logger } from '../../shared/logger'
import { authRepository } from './auth.repository'

const router = Router()

// Interfaz para el token de reset
interface ResetToken {
  id: string
  email: string
  token: string
  expires_at: string
  used: boolean
  created_at: string
}

// Función para generar token seguro
function generateResetToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

// Función para generar fecha de expiración (1 hora)
function generateExpirationDate(): string {
  const expirationDate = new Date()
  expirationDate.setHours(expirationDate.getHours() + 1)
  return expirationDate.toISOString()
}

// Endpoint para solicitar reset de contraseña
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body

    // Validar que se proporcione el email
    if (!email) {
      throw badRequest('El correo electrónico es requerido')
    }

    // Validar formato de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
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

    // TODO: enviar correo con enlace (nodemailer); nunca devolver el token en JSON en producción.

    const debugReset =
      process.env.PASSWORD_RESET_DEBUG_RESPONSE === 'true' &&
      process.env.NODE_ENV !== 'production'

    res.status(200).json({
      message:
        'Si el correo electrónico existe en nuestro sistema, recibirás un enlace de recuperación',
      ...(debugReset && {
        resetToken,
        resetLink: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/forgot-password?token=${resetToken}&email=${encodeURIComponent(email)}`
      })
    })
  } catch (error) {
    return sendError(res, error)
  }
})

// Endpoint para validar token de reset
router.get('/validate-reset-token/:token', async (req, res) => {
  try {
    const { token } = req.params
    const { email } = req.query

    if (!email) {
      throw badRequest('El correo electrónico es requerido')
    }

    // Buscar el token en la base de datos
    const tokenData = await authRepository.findUnusedResetToken(token, String(email)) as ResetToken | null

    if (!tokenData) {
      throw badRequest('Token inválido o ya utilizado')
    }

    // Verificar si el token ha expirado
    const now = new Date()
    const expirationDate = new Date(tokenData.expires_at)

    if (now > expirationDate) {
      throw badRequest('El token ha expirado. Solicita uno nuevo.')
    }

    res.status(200).json({
      message: 'Token válido',
      valid: true
    })
  } catch (error) {
    return sendError(res, error)
  }
})

// Endpoint para resetear la contraseña
router.post('/reset-password', async (req, res) => {
  try {
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
    const minLength = 8
    const hasUpperCase = /[A-Z]/.test(newPassword)
    const hasLowerCase = /[a-z]/.test(newPassword)
    const hasNumbers = /\d/.test(newPassword)
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(newPassword)

    if (newPassword.length < minLength) {
      throw badRequest('La contraseña debe tener al menos 8 caracteres')
    }
    if (!hasUpperCase) {
      throw badRequest('La contraseña debe contener al menos una letra mayúscula')
    }
    if (!hasLowerCase) {
      throw badRequest('La contraseña debe contener al menos una letra minúscula')
    }
    if (!hasNumbers) {
      throw badRequest('La contraseña debe contener al menos un número')
    }
    if (!hasSpecialChar) {
      throw badRequest('La contraseña debe contener al menos un carácter especial')
    }

    // Buscar y validar el token
    const tokenData = await authRepository.findUnusedResetToken(token, email) as ResetToken | null

    if (!tokenData) {
      throw badRequest('Token inválido o ya utilizado')
    }

    // Verificar si el token ha expirado
    const now = new Date()
    const expirationDate = new Date(tokenData.expires_at)

    if (now > expirationDate) {
      throw badRequest('El token ha expirado. Solicita uno nuevo.')
    }

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
  } catch (error) {
    return sendError(res, error)
  }
})

export default router
