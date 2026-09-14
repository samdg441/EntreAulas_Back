import crypto from 'crypto'
import { authRepository } from './auth.repository'
import { badRequest } from '../../shared/errors'

export interface ResetToken {
  id: string
  email: string
  token: string
  expires_at: string
  used: boolean
  created_at: string
}

export function generateResetToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

export function generateExpirationDate(): string {
  const expirationDate = new Date()
  expirationDate.setHours(expirationDate.getHours() + 1)
  return expirationDate.toISOString()
}

export function validarFortalezaPassword(newPassword: string): string | null {
  const minLength = 8
  const hasUpperCase = /[A-Z]/.test(newPassword)
  const hasLowerCase = /[a-z]/.test(newPassword)
  const hasNumbers = /\d/.test(newPassword)
  const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(newPassword)

  if (newPassword.length < minLength) {
    return 'La contraseña debe tener al menos 8 caracteres'
  }
  if (!hasUpperCase) {
    return 'La contraseña debe contener al menos una letra mayúscula'
  }
  if (!hasLowerCase) {
    return 'La contraseña debe contener al menos una letra minúscula'
  }
  if (!hasNumbers) {
    return 'La contraseña debe contener al menos un número'
  }
  if (!hasSpecialChar) {
    return 'La contraseña debe contener al menos un carácter especial'
  }
  return null
}

export async function buscarTokenDeResetValido(token: string, email: string): Promise<ResetToken> {
  const tokenData = await authRepository.findUnusedResetToken(token, email) as ResetToken | null

  if (!tokenData) {
    throw badRequest('Token inválido o ya utilizado')
  }

  const now = new Date()
  const expirationDate = new Date(tokenData.expires_at)

  if (now > expirationDate) {
    throw badRequest('El token ha expirado. Solicita uno nuevo.')
  }

  return tokenData
}
