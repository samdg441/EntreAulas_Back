/**
 * Límite de intentos (DEF-34, DEF-43) y errores del cuerpo (DEF-38): cobertura de los middlewares nuevos.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextFunction, Request, Response } from 'express'
import { EventEmitter } from 'node:events'
import { correoDe, ipDe, limitarIntentos, reiniciarLimitesDeIntentos } from '../../../middleware/limite-de-intentos'
import { erroresDelCuerpo } from '../../../middleware/errores-del-cuerpo'

type Capturada = Response & EventEmitter & { statusCode: number; body?: unknown; cabeceras: Record<string, string>; headersSent: boolean }

function respuesta(): Capturada {
  const res = new EventEmitter() as Capturada
  res.statusCode = 200
  res.cabeceras = {}
  res.headersSent = false
  res.status = vi.fn((c: number) => {
    res.statusCode = c
    return res
  }) as never
  res.json = vi.fn((b: unknown) => {
    res.body = b
    return res
  }) as never
  res.setHeader = vi.fn((k: string, v: string) => {
    res.cabeceras[k] = v
    return res
  }) as never
  return res
}

const peticion = (over: Partial<Request> = {}) => ({ ip: '10.0.0.1', body: { email: ' Ana@UdeM.edu.co ' }, query: {}, socket: {}, ...over }) as Request

/** Ejecuta el middleware y, si deja pasar, simula que la ruta respondió con `estadoFinal`. */
function intentar(mw: ReturnType<typeof limitarIntentos>, estadoFinal = 200, req = peticion()) {
  const res = respuesta()
  const next = vi.fn() as NextFunction
  mw(req, res, next)
  if ((next as unknown as ReturnType<typeof vi.fn>).mock.calls.length) {
    res.statusCode = estadoFinal
    res.emit('finish')
  }
  return { res, paso: (next as unknown as ReturnType<typeof vi.fn>).mock.calls.length === 1 }
}

describe('limitarIntentos', () => {
  beforeEach(() => reiniciarLimitesDeIntentos())
  afterEach(() => {
    vi.useRealTimers()
    delete process.env.LIMITE_INTENTOS_DESACTIVADO
  })

  it('deja pasar hasta el máximo y luego responde 429 con Retry-After', () => {
    const mw = limitarIntentos({ nombre: 't1', ventanaMs: 60_000, maximo: 3, clave: ipDe })
    expect([1, 2, 3].map(() => intentar(mw).paso)).toEqual([true, true, true])
    const { res, paso } = intentar(mw)
    expect(paso).toBe(false)
    expect(res.statusCode).toBe(429)
    expect(res.body).toEqual({ error: 'Demasiados intentos. Intenta de nuevo más tarde', code: 'RATE_LIMITED' })
    expect(Number(res.cabeceras['Retry-After'])).toBeGreaterThan(0)
  })

  it('en modo «fallidas» las respuestas exitosas no consumen intentos', () => {
    const mw = limitarIntentos({ nombre: 't2', ventanaMs: 60_000, maximo: 2, contar: 'fallidas', clave: ipDe })
    for (let i = 0; i < 5; i++) expect(intentar(mw, 200).paso).toBe(true)
    intentar(mw, 401)
    intentar(mw, 401)
    expect(intentar(mw, 401).res.statusCode).toBe(429)
  })

  it('la ventana se reinicia al vencer', () => {
    vi.useFakeTimers()
    const mw = limitarIntentos({ nombre: 't3', ventanaMs: 1_000, maximo: 1, clave: ipDe })
    intentar(mw)
    expect(intentar(mw).paso).toBe(false)
    vi.advanceTimersByTime(1_001)
    expect(intentar(mw).paso).toBe(true)
  })

  it('cada clave lleva su propio contador', () => {
    const mw = limitarIntentos({ nombre: 't4', ventanaMs: 60_000, maximo: 1, clave: (r) => `${ipDe(r)}|${correoDe(r)}` })
    intentar(mw)
    expect(intentar(mw).paso).toBe(false)
    expect(intentar(mw, 200, peticion({ body: { email: 'otra@udem.edu.co' } })).paso).toBe(true)
  })

  it('LIMITE_INTENTOS_DESACTIVADO=true lo apaga (pruebas de carga locales)', () => {
    process.env.LIMITE_INTENTOS_DESACTIVADO = 'true'
    const mw = limitarIntentos({ nombre: 't5', ventanaMs: 60_000, maximo: 0, clave: ipDe })
    expect(intentar(mw).paso).toBe(true)
  })

  it('poda los registros vencidos cuando crece demasiado', () => {
    vi.useFakeTimers()
    const mw = limitarIntentos({ nombre: 't6', ventanaMs: 10, maximo: 5, clave: (r) => String(r.ip) })
    for (let i = 0; i < 10_001; i++) intentar(mw, 200, peticion({ ip: `ip-${i}` } as Partial<Request>))
    vi.advanceTimersByTime(20)
    expect(intentar(mw, 200, peticion({ ip: 'nueva' } as Partial<Request>)).paso).toBe(true)
  })

  it('ipDe y correoDe normalizan la clave', () => {
    expect(ipDe(peticion({ ip: undefined, socket: { remoteAddress: '1.2.3.4' } } as never))).toBe('1.2.3.4')
    expect(ipDe(peticion({ ip: undefined } as never))).toBe('desconocida')
    expect(correoDe(peticion())).toBe('ana@udem.edu.co')
    expect(correoDe(peticion({ body: undefined, query: { email: 'Q@x.co' } } as never))).toBe('q@x.co')
    expect(correoDe(peticion({ body: {}, query: {} } as never))).toBe('')
  })
})

describe('erroresDelCuerpo', () => {
  const llamar = (err: unknown, headersSent = false) => {
    const res = respuesta()
    res.headersSent = headersSent
    const next = vi.fn()
    erroresDelCuerpo(err as never, {} as Request, res, next)
    return { res, next }
  }

  it.each([
    ['entity.parse.failed', 400],
    ['entity.too.large', 413],
    ['encoding.unsupported', 415],
  ])('%s → %i en JSON', (type, status) => {
    const { res } = llamar(Object.assign(new Error('x'), { type }))
    expect(res.statusCode).toBe(status)
    expect(res.body).toHaveProperty('error')
  })

  it('otro error 4xx conserva su estado y uno sin estado es 500 sin detalles', () => {
    expect(llamar(Object.assign(new Error('x'), { status: 404 })).res.statusCode).toBe(404)
    const { res } = llamar(new Error('secreto de la base'))
    expect(res.statusCode).toBe(500)
    expect(JSON.stringify(res.body)).not.toContain('secreto')
  })

  it('si la respuesta ya empezó, delega en Express', () => {
    const err = new Error('tarde')
    const { next } = llamar(err, true)
    expect(next).toHaveBeenCalledWith(err)
  })
})
