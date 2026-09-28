import { beforeEach, describe, expect, it, vi } from 'vitest'
import express from 'express'
import request from 'supertest'
import { AppError } from '../../shared/errors'

const generarQrsBatch = vi.hoisted(() => vi.fn())
const autoEnrollPorQr = vi.hoisted(() => vi.fn())
const compartirQrsPorEmail = vi.hoisted(() => vi.fn())
const errorEnvioCorreo = vi.hoisted(() =>
  vi.fn((error: unknown) => error)
)
const qrRepository = vi.hoisted(() => ({
  findActivoByToken: vi.fn(),
}))

vi.mock('../../middleware/auth', () => ({
  authenticateToken: (req: { user?: unknown }, _res: unknown, next: () => void) => {
    req.user = { id: 'u-admin', tipo_usuario: 'admin', roles: ['admin'] }
    next()
  },
  requireRole: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}))

vi.mock('../../modules/evaluations/qr-batch', () => ({ generarQrsBatch }))
vi.mock('../../modules/evaluations/qr-auto-enroll', () => ({ autoEnrollPorQr }))
vi.mock('../../modules/evaluations/qr-share-email', () => ({
  compartirQrsPorEmail,
  errorEnvioCorreo,
}))
vi.mock('../../modules/evaluations/qr.repository', () => ({ qrRepository }))

import router from '../../modules/evaluations/qr-evaluaciones.routes'

function appQr() {
  const app = express()
  app.use(express.json())
  app.use(router)
  return app
}

describe('RQ14–RQ17 — rutas QR', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('POST /batch crea QRs', async () => {
    generarQrsBatch.mockResolvedValueOnce({ created: [{ grupoId: 1, token: 't1' }], skipped: [] })
    const res = await request(appQr()).post('/batch').send({ grupoIds: [1] })
    expect(res.status).toBe(201)
    expect(res.body.created).toHaveLength(1)
  })

  it('POST /batch con error → 400', async () => {
    generarQrsBatch.mockRejectedValueOnce(new AppError(400, 'Se requiere grupoIds'))
    const res = await request(appQr()).post('/batch').send({})
    expect(res.status).toBe(400)
  })

  it('POST /share-email envía correo', async () => {
    compartirQrsPorEmail.mockResolvedValueOnce({ email: 'a@b.com', totalLinks: 2 })
    const res = await request(appQr()).post('/share-email').send({
      to: 'a@b.com',
      subject: 'QR',
      grupoIds: [1],
    })
    expect(res.status).toBe(200)
    expect(res.body.sentTo).toBe('a@b.com')
  })

  it('GET /:token resuelve QR activo', async () => {
    qrRepository.findActivoByToken.mockResolvedValueOnce({
      profesor_id: 'p1',
      curso_id: 10,
      grupo_id: 3,
      periodo_id: 2026,
      profesor: { usuario: { nombre: 'Ana', apellido: 'Pérez' } },
      curso: { nombre: 'Álgebra', codigo: 'MAT-1' },
      grupo: { numero_grupo: 'A', horario: 'Lun 8-10', aula: '101' },
    })
    const res = await request(appQr()).get('/tok-ok')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ profesorId: 'p1', materiaId: 10, grupoId: 3 })
  })

  it('POST /:token/auto-enroll matricula', async () => {
    autoEnrollPorQr.mockResolvedValueOnce({
      status: 201,
      body: { enrolled: true, created: true, grupoId: 3 },
    })
    const res = await request(appQr()).post('/tok-ok/auto-enroll')
    expect(res.status).toBe(201)
    expect(res.body.created).toBe(true)
  })

  it('GET /:token inexistente → 404', async () => {
    qrRepository.findActivoByToken.mockResolvedValueOnce(null)
    const res = await request(appQr()).get('/tok-no')
    expect(res.status).toBe(404)
  })

  it('GET /:token con error de BD → 500', async () => {
    qrRepository.findActivoByToken.mockRejectedValueOnce(new Error('db'))
    const res = await request(appQr()).get('/tok-err')
    expect(res.status).toBe(500)
  })

  it('POST /share-email con error → 503', async () => {
    const boom = new AppError(503, 'SMTP off')
    compartirQrsPorEmail.mockRejectedValueOnce(boom)
    errorEnvioCorreo.mockReturnValueOnce(boom)
    const res = await request(appQr()).post('/share-email').send({
      to: 'a@b.com',
      subject: 'QR',
      grupoIds: [1],
    })
    expect(res.status).toBe(503)
  })
})
