import { hashPassword } from '../../utils/passwordSecurity'
import { dashboardDesdeRoles, dashboardDesdeTipoUsuario } from './dashboard'
import { logger } from '../../shared/logger'
import { roleRepository } from './role.repository'
import type { CoordinadorInfo } from './role.types'

export type { CoordinadorInfo, DecanoPorFacultad, DecanoPorUsuario, UserRole } from './role.types'

function permisosDesdeRoles(roles: string[]): string[] {
  const permisos = new Set<string>()
  for (const rol of roles) {
    switch (rol) {
      case 'admin':
        permisos.add('all')
        break
      case 'decano':
        permisos.add('view_evaluations')
        permisos.add('create_evaluations')
        permisos.add('view_reports')
        permisos.add('manage_users')
        permisos.add('manage_department')
        permisos.add('manage_faculty')
        permisos.add('view_all_professors')
        permisos.add('view_all_careers')
        break
      case 'coordinador':
        permisos.add('view_evaluations')
        permisos.add('create_evaluations')
        permisos.add('view_reports')
        permisos.add('manage_users')
        permisos.add('manage_department')
        break
      case 'profesor':
      case 'docente':
        permisos.add('view_evaluations')
        permisos.add('create_evaluations')
        permisos.add('view_reports')
        break
      case 'estudiante':
        permisos.add('view_evaluations')
        permisos.add('submit_evaluations')
        break
    }
  }
  return Array.from(permisos)
}

export class RoleService {
  static async asignarRol(usuarioId: string, rol: string): Promise<boolean> {
    try {
      await roleRepository.upsertRol(usuarioId, rol)
      return true
    } catch (error) {
      logger.error('Error asignando rol:', error)
      return false
    }
  }

  static async removerRol(usuarioId: string, rol: string): Promise<boolean> {
    try {
      await roleRepository.desactivarRol(usuarioId, rol)
      return true
    } catch (error) {
      logger.error('Error removiendo rol:', error)
      return false
    }
  }

  static async obtenerRolesUsuario(usuarioId: string): Promise<string[]> {
    try {
      return await roleRepository.listRolesActivos(usuarioId)
    } catch (error) {
      logger.error('Error obteniendo roles:', error)
      return []
    }
  }

  static async usuarioTieneRol(usuarioId: string, rol: string): Promise<boolean> {
    try {
      const row = await roleRepository.findRolActivo(usuarioId, rol)
      return !!row
    } catch (error) {
      logger.error('Error verificando rol:', error)
      return false
    }
  }

  static async crearCoordinadorProfesor(coordinadorData: {
    email: string
    password: string
    nombre: string
    apellido: string
    carrera_id?: number
    departamento?: string
  }): Promise<{ success: boolean; usuario_id?: string; error?: string }> {
    try {
      const hashedPassword = await hashPassword(coordinadorData.password)
      const usuario = await roleRepository.insertUsuarioProfesor({
        email: coordinadorData.email,
        password: hashedPassword,
        nombre: coordinadorData.nombre,
        apellido: coordinadorData.apellido,
      })
      const usuarioId = usuario.id
      await this.asignarRol(usuarioId, 'profesor')
      await this.asignarRol(usuarioId, 'coordinador')
      await roleRepository.insertCoordinador({
        usuario_id: usuarioId,
        carrera_id: coordinadorData.carrera_id,
        departamento: coordinadorData.departamento,
        fecha_nombramiento: new Date().toISOString().split('T')[0],
      })
      return { success: true, usuario_id: usuarioId }
    } catch (error) {
      logger.error('Error en crearCoordinadorProfesor:', error)
      return { success: false, error: 'Error interno del servidor' }
    }
  }

  static async obtenerCoordinadores(): Promise<CoordinadorInfo[]> {
    try {
      return await roleRepository.listCoordinadoresActivos()
    } catch (error) {
      logger.error('Error obteniendo coordinadores:', error)
      return []
    }
  }

  static async obtenerCoordinadorPorUsuario(usuarioId: string): Promise<CoordinadorInfo | null> {
    try {
      return await roleRepository.findCoordinadorPorUsuario(usuarioId)
    } catch (error) {
      logger.error('Error en obtenerCoordinadorPorUsuario:', error)
      return null
    }
  }

  static async obtenerDashboardUsuario(usuarioId: string): Promise<string> {
    try {
      const roles = await this.obtenerRolesUsuario(usuarioId)
      const porRoles = dashboardDesdeRoles(roles)
      if (porRoles) return porRoles
      const usuario = await roleRepository.findTipoUsuario(usuarioId)
      if (usuario?.tipo_usuario) {
        return dashboardDesdeTipoUsuario(usuario.tipo_usuario)
      }
      return '/dashboard'
    } catch (error) {
      logger.error('Error en obtenerDashboardUsuario:', error)
      return '/dashboard'
    }
  }

  static async obtenerPermisosUsuario(usuarioId: string): Promise<string[]> {
    try {
      const roles = await this.obtenerRolesUsuario(usuarioId)
      return permisosDesdeRoles(roles)
    } catch (error) {
      logger.error('Error en obtenerPermisosUsuario:', error)
      return []
    }
  }

  static async usuarioPuedeAcceder(usuarioId: string, permiso: string): Promise<boolean> {
    try {
      const permisos = await this.obtenerPermisosUsuario(usuarioId)
      return permisos.includes('all') || permisos.includes(permiso)
    } catch (error) {
      logger.error('Error en usuarioPuedeAcceder:', error)
      return false
    }
  }

  static async obtenerDecanoPorUsuario(usuarioId: string) {
    try {
      return await roleRepository.findDecanoPorUsuario(usuarioId)
    } catch (error) {
      logger.error('Error obteniendo decano por usuario:', error)
      return null
    }
  }

  static async obtenerDecanoFacultad(facultadId: number) {
    try {
      return await roleRepository.findDecanoPorFacultad(facultadId)
    } catch (error) {
      logger.error('Error obteniendo decano de facultad:', error)
      return null
    }
  }
}

export default RoleService
