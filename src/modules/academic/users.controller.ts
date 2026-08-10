import { Request, Response } from 'express'
import { academicService } from './academic.service'
import { authRepository } from '../auth/auth.repository'
import { hashPassword } from '../../utils/passwordSecurity'

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
      console.error('GET /api/users:', e)
      res.status(500).json({ error: 'Error al listar usuarios' })
    }
  }

  static async updateUser(req: Request, res: Response) {
    try {
      const { id } = req.params
      const { email, nombre, apellido, tipo_usuario, activo, password } = req.body || {}

      if (!id) {
        return res.status(400).json({ error: 'ID de usuario requerido' })
      }

      const existing = await authRepository.findUserById(id)
      if (!existing) {
        return res.status(404).json({ error: 'Usuario no encontrado' })
      }

      const updates: Record<string, unknown> = {}
      if (typeof email === 'string' && email.trim()) updates.email = email.trim().toLowerCase()
      if (typeof nombre === 'string' && nombre.trim()) updates.nombre = nombre.trim()
      if (typeof apellido === 'string' && apellido.trim()) updates.apellido = apellido.trim()
      if (typeof tipo_usuario === 'string') {
        if (!ALLOWED_USER_TYPES.includes(tipo_usuario as (typeof ALLOWED_USER_TYPES)[number])) {
          return res.status(400).json({ error: 'tipo_usuario inválido' })
        }
        updates.tipo_usuario = tipo_usuario
      }
      if (typeof activo === 'boolean') updates.activo = activo

      if (typeof password === 'string' && password.length > 0) {
        if (password.length < 8) {
          return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' })
        }
        updates.password = await hashPassword(password)
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'No hay campos para actualizar' })
      }

      if (updates.email && updates.email !== existing.email) {
        const conflict = await authRepository.findUserByEmail(String(updates.email))
        if (conflict && conflict.id !== id) {
          return res.status(400).json({ error: 'El email ya está registrado' })
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
      console.error('PUT /api/users/:id:', e)
      res.status(500).json({ error: 'Error al actualizar usuario' })
    }
  }

  static async deactivateUser(req: Request, res: Response) {
    try {
      const { id } = req.params
      if (!id) {
        return res.status(400).json({ error: 'ID de usuario requerido' })
      }

      const existing = await authRepository.findUserById(id)
      if (!existing) {
        return res.status(404).json({ error: 'Usuario no encontrado' })
      }

      // Evitar que un admin se desactive a sí mismo
      if (req.user?.id === id) {
        return res.status(400).json({ error: 'No puedes desactivar tu propia cuenta' })
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
      console.error('DELETE /api/users/:id:', e)
      res.status(500).json({ error: 'Error al desactivar usuario' })
    }
  }

  static async getAcademicStructure(_req: Request, res: Response) {
    try {
      const facultades = await academicService.getAcademicStructure()
      res.json({ facultades })
    } catch (e) {
      console.error('GET /api/users/academic-structure:', e)
      res.status(500).json({ error: 'Error al obtener estructura académica' })
    }
  }

  static async getDashboardStats(_req: Request, res: Response) {
    try {
      const stats = await academicService.getDashboardStats()
      res.json(stats)
    } catch (e) {
      console.error('GET /api/users/stats:', e)
      res.status(500).json({ error: 'Error al obtener estadísticas' })
    }
  }

  static async getGruposByCareer(req: Request, res: Response) {
    try {
      const careerId = Number(req.params.careerId)
      if (!Number.isFinite(careerId)) {
        return res.status(400).json({ error: 'careerId inválido' })
      }
      const grupos = await academicService.getGruposConProfesorByCareer(careerId)
      res.json(grupos)
    } catch (e: any) {
      console.error('GET /api/users/grupos-by-career:', e)
      res.status(500).json({ error: 'Error al obtener grupos', details: e?.message })
    }
  }
}
