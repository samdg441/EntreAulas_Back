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
      const { email, nombre, apellido, tipo_usuario, activo, password } = req.body || {}

      if (!id) {
        throw badRequest('ID de usuario requerido')
      }

      const existing = await authRepository.findUserById(id)
      if (!existing) {
        throw notFound('Usuario no encontrado')
      }

      const updates: Record<string, unknown> = {}
      if (typeof email === 'string' && email.trim()) updates.email = email.trim().toLowerCase()
      if (typeof nombre === 'string' && nombre.trim()) updates.nombre = nombre.trim()
      if (typeof apellido === 'string' && apellido.trim()) updates.apellido = apellido.trim()
      if (typeof tipo_usuario === 'string') {
        if (!ALLOWED_USER_TYPES.includes(tipo_usuario as (typeof ALLOWED_USER_TYPES)[number])) {
          throw badRequest('tipo_usuario inválido')
        }
        updates.tipo_usuario = tipo_usuario
      }
      if (typeof activo === 'boolean') updates.activo = activo

      if (typeof password === 'string' && password.length > 0) {
        if (password.length < 8) {
          throw badRequest('La contraseña debe tener al menos 8 caracteres')
        }
        updates.password = await hashPassword(password)
      }

      if (Object.keys(updates).length === 0) {
        throw badRequest('No hay campos para actualizar')
      }

      if (updates.email && updates.email !== existing.email) {
        const conflict = await authRepository.findUserByEmail(String(updates.email))
        if (conflict && conflict.id !== id) {
          throw badRequest('El email ya está registrado')
        }
      }

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
