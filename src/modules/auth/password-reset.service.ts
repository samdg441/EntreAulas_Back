import crypto from 'node:crypto'
import { authRepository } from './auth.repository'
import { badRequest } from '../../shared/errors'
import { validarPoliticaDeClave } from '../../utils/passwordSecurity'

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

/** Alias histórico: la política vive en utils/passwordSecurity para que alta y recuperación no diverjan (DEF-45). */
export const validarFortalezaPassword = (newPassword: string): string | null => validarPoliticaDeClave(newPassword)

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
