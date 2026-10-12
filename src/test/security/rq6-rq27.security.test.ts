/**
 * RQ6, RQ14 y RQ16 — Controles de seguridad sobre las rutas de acceso, QR y correo.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { fromMock, supabaseModuleMock } from '../helpers/supabase-mock'
import { iniciarSesion, reiniciarSesion } from '../helpers/sesion-http'
import { adminUser, estudianteUser } from '../fixtures/users'

vi.mock('../../config/supabase-only', () => supabaseModuleMock)
vi.mock('../../config/supabaseClient', () => supabaseModuleMock)

import { app } from '../../app'

describe('RQ6, RQ14 y RQ16 — Seguridad', () => {
  beforeEach(() => {
    fromMock.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
    reiniciarSesion()
  })

  it.each([
    ['listar usuarios', 'get', '/api/users'],
    ['generar QR', 'post', '/api/qr-evaluaciones/batch'],
    ['compartir QR', 'post', '/api/qr-evaluaciones/share-email'],
    ['auto-inscribirse', 'post', '/api/qr-evaluaciones/tok-14/auto-enroll'],
    ['ver materias', 'get', '/api/teachers/student-enrolled-subjects'],
  ] as const)('sin token, %s responde 401 y no abre datos', async (_caso, metodo, ruta) => {
    const res = await request(app)[metodo](ruta).send({ grupoIds: [63], to: 'ana@udemedellin.edu.co', subject: 'QR' })

    expect(res.status).toBe(401)
    expect(res.body.code).toBe('NO_TOKEN')
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('un estudiante no genera ni envía QR', async () => {
    const auth = iniciarSesion(estudianteUser)

    const batch = await request(app).post('/api/qr-evaluaciones/batch').set('Authorization', auth).send({ grupoIds: [63] })
    const correo = await request(app)
      .post('/api/qr-evaluaciones/share-email')
      .set('Authorization', auth)
      .send({ to: 'ana@udemedellin.edu.co', subject: 'QR', grupoIds: [63] })

    expect(batch.status).toBe(403)
    expect(correo.status).toBe(403)
    expect(batch.body.code).toBe('FORBIDDEN_ROLE')
  })

  it.each([
    ['salto de línea', 'ana@udemedellin.edu.co\nBcc: todos@evil.co'],
    ['retorno de carro', 'ana@udemedellin.edu.co\r\nCc: x@evil.co'],
  ])('RQ16: %s no se acepta como destinatario', async (_caso, to) => {
    const auth = iniciarSesion(adminUser)

    const res = await request(app)
      .post('/api/qr-evaluaciones/share-email')
      .set('Authorization', auth)
      .send({ to, subject: 'Evaluación', grupoIds: [63] })

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Correo de destino inválido.' })
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('un token basura no resuelve una encuesta', async () => {
    const res = await request(app).get("/api/qr-evaluaciones/'%20OR%201=1")

    expect(res.status).not.toBe(200)
    expect(res.body).not.toHaveProperty('grupoId')
  })
})
