import type { NextFunction, Request, Response } from 'express'

type ErrorDeBodyParser = Error & { type?: string; status?: number }

const MENSAJES: Record<string, { status: number; error: string }> = {
  'entity.parse.failed': { status: 400, error: 'El cuerpo de la petición no es JSON válido' },
  'entity.too.large': { status: 413, error: 'El cuerpo de la petición es demasiado grande' },
  'encoding.unsupported': { status: 415, error: 'Codificación del cuerpo no soportada' },
}

/**
 * Manejador de errores de express.json() (DEF-38). Sin él, Express responde HTML con la traza.
 * Los demás errores siguen su curso (cada ruta ya los serializa con sendError).
 */
export function erroresDelCuerpo(err: ErrorDeBodyParser, _req: Request, res: Response, next: NextFunction) {
  const conocido = err?.type ? MENSAJES[err.type] : undefined
  if (conocido) return res.status(conocido.status).json({ error: conocido.error })
  if (res.headersSent) return next(err)
  return res.status(err?.status && err.status >= 400 && err.status < 500 ? err.status : 500).json({ error: 'Error interno del servidor' })
}
