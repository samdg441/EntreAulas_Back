import type { Request, Response, NextFunction } from 'express'

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
 */
export function sendError(res: Response, error: unknown): Response {
  if (error instanceof AppError) {
    const body: { error: string; details?: unknown } = { error: error.message }
    if (error.details !== undefined) body.details = error.details
    return res.status(error.status).json(body)
  }

  const details = error instanceof Error ? error.message : String(error)
  return res.status(500).json({ error: 'Error interno del servidor', details })
}

/** Evita try/catch en cada handler: los throw AppError llegan a sendError. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown> | unknown
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch((error) => sendError(res, error))
  }
}
