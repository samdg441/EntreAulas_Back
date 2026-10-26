import type { Request, Response, NextFunction } from 'express'
import { logger } from './logger'

/** Error de aplicación con status HTTP. Las rutas lo lanzan; sendError lo serializa. */
export class AppError extends Error {
  readonly status: number
  readonly details?: unknown

  constructor(status: number, message: string, details?: unknown) {
    super(message)
    this.name = 'AppError'
    this.status = status
    this.details = details
  }
}

export function badRequest(message: string, details?: unknown) {
  return new AppError(400, message, details)
}

export function unauthorized(message: string, details?: unknown) {
  return new AppError(401, message, details)
}

export function forbidden(message: string, details?: unknown) {
  return new AppError(403, message, details)
}

export function notFound(message: string, details?: unknown) {
  return new AppError(404, message, details)
}

export function conflict(message: string, details?: unknown) {
  return new AppError(409, message, details)
}

export function internal(message: string, details?: unknown) {
  return new AppError(500, message, details)
}

export function unavailable(message: string, details?: unknown) {
  return new AppError(503, message, details)
}

/**
 * Respuesta JSON estable: { error, details? }.
 * AppError → su status. Cualquier otra cosa → 500.
 * Los 5xx nunca devuelven details: el mensaje de la base o del proveedor solo va al log (DEF-31, DEF-40).
 */
export function sendError(res: Response, error: unknown): Response {
  if (error instanceof AppError && error.status < 500) {
    const body: { error: string; details?: unknown } = { error: error.message }
    if (error.details !== undefined) body.details = error.details
    return res.status(error.status).json(body)
  }

  logger.error(error instanceof AppError ? { error: error.message, details: error.details } : error)
  const status = error instanceof AppError ? error.status : 500
  const mensaje = error instanceof AppError ? error.message : 'Error interno del servidor'
  return res.status(status).json({ error: mensaje })
}

/** Evita try/catch en cada handler: los throw AppError llegan a sendError. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch((error) => sendError(res, error))
  }
}
