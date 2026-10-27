import type { NextFunction, Request, Response } from 'express'

type Registro = { cuenta: number; reinicio: number }

export type OpcionesDeLimite = {
  /** Agrupa los contadores (p. ej. «login»): rutas con el mismo nombre comparten límite. */
  nombre: string
  ventanaMs: number
  maximo: number
  clave: (req: Request) => string
  /** «fallidas»: solo cuentan las respuestas 4xx/5xx (un login correcto no consume intentos). */
  contar?: 'todas' | 'fallidas'
}

const registros = new Map<string, Registro>()
const MAX_REGISTROS = 10_000

function podarVencidos(ahora: number) {
  if (registros.size < MAX_REGISTROS) return
  for (const [k, r] of registros) if (r.reinicio <= ahora) registros.delete(k)
}

/** IP del cliente (con `trust proxy` en app.ts, la que entrega el proxy de Render) y correo normalizado. */
export const ipDe = (req: Request) => req.ip ?? req.socket.remoteAddress ?? 'desconocida'
export const correoDe = (req: Request) => {
  const cuerpo = req.body as { email?: unknown } | undefined
  const desdeCuerpo = cuerpo?.email
  if (typeof desdeCuerpo === 'string') return desdeCuerpo.trim().toLowerCase()
  if (desdeCuerpo != null) return ''
  const desdeQuery = req.query.email
  return typeof desdeQuery === 'string' ? desdeQuery.trim().toLowerCase() : ''
}

/**
 * Límite de intentos en memoria (DEF-34, DEF-43). Al superarlo responde 429 con Retry-After.
 * En memoria basta para una sola instancia (Render free); con varias réplicas habría que moverlo a Redis.
 */
export function limitarIntentos(op: OpcionesDeLimite) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (process.env.LIMITE_INTENTOS_DESACTIVADO === 'true') return next()

    const ahora = Date.now()
    podarVencidos(ahora)
    const k = `${op.nombre}:${op.clave(req)}`
    let r = registros.get(k)
    if (!r || r.reinicio <= ahora) {
      r = { cuenta: 0, reinicio: ahora + op.ventanaMs }
      registros.set(k, r)
    }

    if (r.cuenta >= op.maximo) {
      res.setHeader('Retry-After', String(Math.ceil((r.reinicio - ahora) / 1000)))
      return res.status(429).json({ error: 'Demasiados intentos. Intenta de nuevo más tarde', code: 'RATE_LIMITED' })
    }

    const registro = r
    if (op.contar === 'fallidas') {
      res.on('finish', () => {
        if (res.statusCode >= 400) registro.cuenta++
      })
    } else {
      registro.cuenta++
    }
    next()
  }
}

/** Solo para pruebas: cada prueba empieza sin intentos acumulados. */
export function reiniciarLimitesDeIntentos() {
  registros.clear()
}

const QUINCE_MINUTOS = 15 * 60_000

/** Login y login-with-role: 10 fallos por IP y correo cada 15 min (DEF-34). */
export const limiteLogin = limitarIntentos({
  nombre: 'login',
  ventanaMs: QUINCE_MINUTOS,
  maximo: 10,
  contar: 'fallidas',
  clave: (req) => `${ipDe(req)}|${correoDe(req)}`,
})

/** forgot-password: 5 solicitudes por IP y correo cada 15 min (evita llenar el buzón ajeno y adivinar cuentas). */
export const limiteSolicitudRecuperacion = limitarIntentos({
  nombre: 'forgot',
  ventanaMs: QUINCE_MINUTOS,
  maximo: 5,
  clave: (req) => `${ipDe(req)}|${correoDe(req)}`,
})

/** validate-reset-token y reset-password: 20 fallos por IP cada 15 min (impide adivinar tokens, DEF-43). */
export const limiteTokenRecuperacion = limitarIntentos({
  nombre: 'token-recuperacion',
  ventanaMs: QUINCE_MINUTOS,
  maximo: 20,
  contar: 'fallidas',
  clave: ipDe,
})
