import { Request, Response } from 'express'
import { z } from 'zod'
import { PasswordResetError } from './password-reset.errors'
import { passwordResetService } from './password-reset.service'

const forgotPasswordSchema = z.object({
  email: z
    .string({ required_error: 'El correo electrónico es requerido' })
    .trim()
    .min(1, 'El correo electrónico es requerido')
    .email('Formato de correo electrónico inválido'),
})

const resetPasswordSchema = z.object({
  token: z.string({ required_error: 'El token de recuperación es requerido' }).min(1, 'El token de recuperación es requerido'),
  email: z
    .string({ required_error: 'El correo electrónico es requerido' })
    .trim()
    .min(1, 'El correo electrónico es requerido')
    .email('Formato de correo electrónico inválido'),
  newPassword: z.string({ required_error: 'La nueva contraseña es requerida' }).min(1, 'La nueva contraseña es requerida'),
  confirmPassword: z.string({ required_error: 'Confirma tu contraseña' }).min(1, 'Confirma tu contraseña'),
})

export class PasswordResetController {
  static async forgotPassword(req: Request, res: Response) {
    try {
      const { email } = forgotPasswordSchema.parse(req.body)
      const result = await passwordResetService.requestReset(email)
      return res.status(200).json(result)
    } catch (error) {
      return handlePasswordResetError(res, error, 'forgot-password')
    }
  }

  static async validateResetToken(req: Request, res: Response) {
    try {
      const token = String(req.params.token || '')
      const email = String(req.query.email || '')
      const result = await passwordResetService.validateResetToken(token, email)
      return res.status(200).json(result)
    } catch (error) {
      return handlePasswordResetError(res, error, 'validate-reset-token')
    }
  }

  static async resetPassword(req: Request, res: Response) {
    try {
      const payload = resetPasswordSchema.parse(req.body)
      const result = await passwordResetService.resetPassword(payload)
      return res.status(200).json(result)
    } catch (error) {
      return handlePasswordResetError(res, error, 'reset-password')
    }
  }
}

function handlePasswordResetError(res: Response, error: unknown, context: string) {
  if (error instanceof PasswordResetError) {
    return res.status(error.statusCode).json({ error: error.message })
  }

  if (error instanceof z.ZodError) {
    return res.status(400).json({
      error: error.errors[0]?.message || 'Datos inválidos',
    })
  }

  console.error(`Error en ${context}:`, error)
  return res.status(500).json({ error: 'Error interno del servidor' })
}
