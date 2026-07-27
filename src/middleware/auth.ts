import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { SupabaseDB } from '../config/supabase-only'
import { RoleService } from '../services/roleService'

/**
 * Verifica JWT en `Authorization: Bearer <token>`.
 * - 401: sin token, token inválido/expirado, usuario inactivo o JWT_SECRET ausente
 * - Siguiente middleware solo si el token es válido
 */
export const authenticateToken = async (req: Request, res: Response, next: NextFunction) => {
  const secret = process.env.JWT_SECRET
  if (!secret) {
    console.error('JWT_SECRET no está definido en el entorno')
    return res.status(500).json({ error: 'Configuración del servidor incompleta' })
  }

  const authHeader = req.headers.authorization
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null

  if (!token) {
    return res.status(401).json({ error: 'Token de acceso requerido', code: 'NO_TOKEN' })
  }

  try {
    const decoded = jwt.verify(token, secret) as jwt.JwtPayload & { userId?: string }

    if (!decoded.userId) {
      return res.status(401).json({ error: 'Token mal formado', code: 'TOKEN_INVALID' })
    }

    const user = await SupabaseDB.findUserById(decoded.userId)

    if (!user || !user.activo) {
      return res.status(401).json({ error: 'Usuario no válido o inactivo', code: 'USER_INVALID' })
    }

    const roles = await RoleService.obtenerRolesUsuario(user.id)
    const permisos = await RoleService.obtenerPermisosUsuario(user.id)

    req.user = {
      id: user.id,
      email: user.email,
      tipo_usuario: user.tipo_usuario,
      roles,
      permisos
    }

    next()
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ error: 'Token expirado', code: 'TOKEN_EXPIRED' })
    }
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({ error: 'Token inválido', code: 'TOKEN_INVALID' })
    }
    console.error('authenticateToken:', error)
    return res.status(401).json({ error: 'No autorizado' })
  }
}

/** Alias semántico: misma función que `authenticateToken`. */
export { authenticateToken as requireAuth }

export const requireRole = (roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'No autenticado' })
    }

    // Verificar si el usuario tiene alguno de los roles requeridos
    const tieneRol = req.user.roles?.some(rol => roles.includes(rol)) || 
                    roles.includes(req.user.tipo_usuario)

    if (!tieneRol) {
      return res.status(403).json({
        error: 'Permisos insuficientes',
        code: 'FORBIDDEN_ROLE'
      })
    }

    next()
  }
}

export const requirePermission = (permiso: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'No autenticado' })
    }

    // Verificar si el usuario tiene el permiso requerido
    const tienePermiso = req.user.permisos?.includes('all') || 
                        req.user.permisos?.includes(permiso)

    if (!tienePermiso) {
      return res.status(403).json({
        error: 'Permisos insuficientes',
        code: 'FORBIDDEN_PERMISSION'
      })
    }

    next()
  }
}

