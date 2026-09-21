import { Request, Response } from 'express'
import { academicService } from './academic.service'
import { authRepository } from '../auth/auth.repository'
import { hashPassword } from '../../utils/passwordSecurity'
import {
  AppError,
  badRequest,
  internal,
  notFound,
  sendError,
} from '../../shared/errors'

const ALLOWED_USER_TYPES = [
  'estudiante',
  'profesor',
  'docente',
  'coordinador',
  'admin',
  'decano',
] as const

type AllowedUserType = (typeof ALLOWED_USER_TYPES)[number]

export function isAllowedUserType(value: string): value is AllowedUserType {
  return (ALLOWED_USER_TYPES as readonly string[]).includes(value)
}

export function assignTrimmedField(
  updates: Record<string, unknown>,
  field: string,
  value: unknown,
  transform: (trimmed: string) => string = (trimmed) => trimmed,
) {
  if (typeof value !== 'string') return
  const trimmed = value.trim()
  if (!trimmed) return
  updates[field] = transform(trimmed)
}

export function applyUserType(updates: Record<string, unknown>, tipo_usuario: unknown) {
  if (typeof tipo_usuario !== 'string') return
  if (!isAllowedUserType(tipo_usuario)) {
    throw badRequest('tipo_usuario inválido')
  }
  updates.tipo_usuario = tipo_usuario
}

export async function applyPassword(updates: Record<string, unknown>, password: unknown) {
  if (typeof password !== 'string' || password.length === 0) return
  if (password.length < 8) {
    throw badRequest('La contraseña debe tener al menos 8 caracteres')
  }
  updates.password = await hashPassword(password)
}

export async function collectUserUpdates(body: Record<string, unknown> | undefined) {
  const { email, nombre, apellido, tipo_usuario, activo, password } = body ?? {}
  const updates: Record<string, unknown> = {}

  assignTrimmedField(updates, 'email', email, (value) => value.toLowerCase())
  assignTrimmedField(updates, 'nombre', nombre)
  assignTrimmedField(updates, 'apellido', apellido)
  applyUserType(updates, tipo_usuario)

  if (typeof activo === 'boolean') {
    updates.activo = activo
  }

  await applyPassword(updates, password)
  return updates
}

export function assertHasUpdates(updates: Record<string, unknown>) {
  if (Object.keys(updates).length === 0) {
    throw badRequest('No hay campos para actualizar')
  }
}

export function ensureEmailIsAvailable(
  userId: string,
  currentEmail: string,
  nextEmail: unknown,
  conflict: { id: string } | null | undefined,
) {
  if (typeof nextEmail !== 'string' || nextEmail === currentEmail) return
  if (conflict?.id === userId) return
  if (conflict) {
    throw badRequest('El email ya está registrado')
  }
}

export class UsersController {
  static async listUsers(_req: Request, res: Response) {
    try {
      const users = await academicService.listUsersSummary()
      res.json({ users })
    } catch (e) {
      return sendError(res, e instanceof AppError ? e : internal('Error al listar usuarios'))
    }
  }

  static async updateUser(req: Request, res: Response) {
    try {
      const { id } = req.params
      if (!id) {
        throw badRequest('ID de usuario requerido')
      }

      const existing = await authRepository.findUserById(id)
      if (!existing) {
        throw notFound('Usuario no encontrado')
      }

      const updates = await collectUserUpdates(req.body)
      assertHasUpdates(updates)

      const nextEmail = updates.email
      const conflict =
        typeof nextEmail === 'string'
          ? await authRepository.findUserByEmail(nextEmail)
          : null
      ensureEmailIsAvailable(id, existing.email, nextEmail, conflict)
      const user = await academicService.updateUser(id, updates as any)
      res.json({
        message: 'Usuario actualizado',
        user: {
          id: user.id,
          email: user.email,
          nombre: user.nombre,
          apellido: user.apellido,
          tipo_usuario: user.tipo_usuario,
          activo: user.activo,
        },
      })
    } catch (e) {
      return sendError(res, e instanceof AppError ? e : internal('Error al actualizar usuario'))
    }
  }

  static async deactivateUser(req: Request, res: Response) {
    try {
      const { id } = req.params
      if (!id) {
        throw badRequest('ID de usuario requerido')
      }

      const existing = await authRepository.findUserById(id)
      if (!existing) {
        throw notFound('Usuario no encontrado')
      }

      // Evitar que un admin se desactive a sí mismo
      if (req.user?.id === id) {
        throw badRequest('No puedes desactivar tu propia cuenta')
      }

      const user = await academicService.deactivateUser(id)
      res.json({
        message: 'Usuario desactivado',
        user: {
          id: user.id,
          email: user.email,
          nombre: user.nombre,
          apellido: user.apellido,
          tipo_usuario: user.tipo_usuario,
          activo: user.activo,
        },
      })
    } catch (e) {
      return sendError(res, e instanceof AppError ? e : internal('Error al desactivar usuario'))
    }
  }

  static async getAcademicStructure(_req: Request, res: Response) {
    try {
      const facultades = await academicService.getAcademicStructure()
      res.json({ facultades })
    } catch (e) {
      return sendError(res, e instanceof AppError ? e : internal('Error al obtener estructura académica'))
    }
  }

  static async getDashboardStats(_req: Request, res: Response) {
    try {
      const stats = await academicService.getDashboardStats()
      res.json(stats)
    } catch (e) {
      return sendError(res, e instanceof AppError ? e : internal('Error al obtener estadísticas'))
    }
  }

  static async getGruposByCareer(req: Request, res: Response) {
    try {
      const careerId = Number(req.params.careerId)
      if (!Number.isFinite(careerId)) {
        throw badRequest('careerId inválido')
      }
      const grupos = await academicService.getGruposConProfesorByCareer(careerId)
      res.json(grupos)
    } catch (e: any) {
      return sendError(res, e instanceof AppError ? e : internal('Error al obtener grupos', e?.message))
    }
  }
}
