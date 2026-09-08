import { describe, expect, it, vi } from 'vitest'
import type { Response } from 'express'
import {
  AppError,
  badRequest,
  conflict,
  forbidden,
  internal,
  notFound,
  sendError,
  unauthorized,
  unavailable,
} from '../../shared/errors'

function respuestaCapturada() {
  const capturado = { statusCode: 0, body: null as unknown }
  const res = {
    status(code: number) {
      capturado.statusCode = code
      return this
    },
    json(body: unknown) {
      capturado.body = body
      return this
    },
  }
  return { res: res as unknown as Response, capturado }
}

class AppErrorPruebas {
  C1_helpersStatus() {
    expect(badRequest('x').status).toBe(400)
    expect(unauthorized('x').status).toBe(401)
    expect(forbidden('x').status).toBe(403)
    expect(notFound('x').status).toBe(404)
    expect(conflict('x').status).toBe(409)
    expect(internal('x').status).toBe(500)
    expect(unavailable('x').status).toBe(503)
  }

  C2_sendErrorAppError() {
    const { res, capturado } = respuestaCapturada()
    sendError(res, notFound('Profesor no encontrado'))
    expect(capturado.statusCode).toBe(404)
    expect(capturado.body).toEqual({ error: 'Profesor no encontrado' })
  }

  C3_sendErrorConDetails() {
    const { res, capturado } = respuestaCapturada()
    sendError(res, internal('DB grupos', { code: '42703' }))
    expect(capturado.statusCode).toBe(500)
    expect(capturado.body).toEqual({ error: 'DB grupos', details: { code: '42703' } })
  }

  C4_sendErrorInesperado() {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { res, capturado } = respuestaCapturada()
    sendError(res, new Error('boom'))
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
    expect(capturado.statusCode).toBe(500)
    expect(capturado.body).toEqual({
      error: 'Error interno del servidor',
      details: 'boom',
    })
  }

  C5_esAppError() {
    const err = forbidden('Solo coordinadores')
    expect(err).toBeInstanceOf(AppError)
    expect(err).toBeInstanceOf(Error)
  }
}

const pruebas = new AppErrorPruebas()

describe('AppError — respuestas HTTP unificadas', () => {
  it('C1: helpers con status 400–500', () => pruebas.C1_helpersStatus())
  it('C2: sendError serializa AppError', () => pruebas.C2_sendErrorAppError())
  it('C3: sendError incluye details', () => pruebas.C3_sendErrorConDetails())
  it('C4: error inesperado → 500 genérico', () => pruebas.C4_sendErrorInesperado())
  it('C5: AppError extiende Error', () => pruebas.C5_esAppError())
})
