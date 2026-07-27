import 'express-serve-static-core'

/**
 * Usuario autenticado adjunto por `authenticateToken`.
 * Disponible como `req.user` en rutas protegidas.
 */
declare module 'express-serve-static-core' {
  interface Request {
    user?: {
      id: string
      email: string
      tipo_usuario: string
      roles?: string[]
      permisos?: string[]
    }
  }
}
