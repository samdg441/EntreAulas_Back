import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { queueFrom } from '../helpers/query-builder'
import { fromMock, supabaseModuleMock } from '../helpers/supabase-mock'
import { adminUser, coordinadorUser } from '../fixtures/users'
import { setTestUser } from '../helpers/test-user'

vi.mock('../../config/supabase-only', () => supabaseModuleMock)
vi.mock('../../config/supabaseClient', () => supabaseModuleMock)
vi.mock('../../middleware/auth', () => import('../helpers/auth-mock'))

vi.mock('../../modules/auth/role.service', () => ({
  RoleService: { obtenerCoordinadorPorUsuario: vi.fn() },
}))

const sendMail = vi.fn().mockResolvedValue(undefined)
vi.mock('../../shared/adapters/mailer.adapter', () => ({
  sendMail: (...a: unknown[]) => sendMail(...a),
}))

import { app } from '../../app'
import { RoleService } from '../../modules/auth/role.service'

const qrRow = {
  grupo_id: 1,
  token: 't1',
  curso: { nombre: 'Cálculo', codigo: 'MAT', carrera_id: 1 },
  grupo: { numero_grupo: 1 },
  profesor: { usuario: { nombre: 'Ana', apellido: 'P' } },
}

/**
 * RQ16 Backend — Distribución por correo (POST /share-email)
 * C1 correo inválido | C2 asunto vacío | C3 grupoIds | C4 coord sin carrera
 * C5 sin QRs | C6 otra carrera | C7 SMTP 503 | C8 200
 */
describe('RQ16 unit — Distribución de QR por correo', () => {
  beforeEach(() => {
    fromMock.mockReset()
    setTestUser({ ...adminUser })
    sendMail.mockClear()
    vi.mocked(RoleService.obtenerCoordinadorPorUsuario).mockReset()
    delete process.env.SMTP_HOST
    delete process.env.SMTP_USER
    delete process.env.SMTP_PASS
    delete process.env.SMTP_FROM
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    delete process.env.SMTP_HOST
    delete process.env.SMTP_USER
    delete process.env.SMTP_PASS
    delete process.env.SMTP_FROM
  })

  it('C1: correo inválido → 400', async () => {
    const res = await request(app)
      .post('/api/qr-evaluaciones/share-email')
      .send({ to: 'no-es-correo', subject: 'Hola', grupoIds: [1] })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Correo/)
  })

  it('C2: asunto vacío → 400', async () => {
    const res = await request(app)
      .post('/api/qr-evaluaciones/share-email')
      .send({ to: 'a@b.com', subject: '  ', grupoIds: [1] })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/asunto/)
  })

  it('C3: grupoIds inválido → 400', async () => {
    const res = await request(app)
      .post('/api/qr-evaluaciones/share-email')
      .send({ to: 'a@b.com', subject: 'QR', grupoIds: [] })
    expect(res.status).toBe(400)
  })

  it('C4: coordinador sin carrera → 403', async () => {
    setTestUser({ ...coordinadorUser })
    vi.mocked(RoleService.obtenerCoordinadorPorUsuario).mockResolvedValue({
      id: 1,
      usuario_id: coordinadorUser.id,
      activo: true,
    } as never)
    const res = await request(app)
      .post('/api/qr-evaluaciones/share-email')
      .send({ to: 'a@b.com', subject: 'QR', grupoIds: [1] })
    expect(res.status).toBe(403)
  })

  it('C5: sin QRs activos → 404', async () => {
    fromMock.mockImplementation(queueFrom({ qr_evaluaciones: [{ data: [], error: null }] }))
    const res = await request(app)
      .post('/api/qr-evaluaciones/share-email')
      .send({ to: 'a@b.com', subject: 'QR', grupoIds: [1] })
    expect(res.status).toBe(404)
  })

  it('C6: QRs de otra carrera → 403', async () => {
    setTestUser({ ...coordinadorUser })
    vi.mocked(RoleService.obtenerCoordinadorPorUsuario).mockResolvedValue({
      id: 1,
      usuario_id: coordinadorUser.id,
      carrera_id: 99,
      activo: true,
    } as never)
    fromMock.mockImplementation(
      queueFrom({ qr_evaluaciones: [{ data: [{ ...qrRow, curso: { carrera_id: 1 } }], error: null }] })
    )
    const res = await request(app)
      .post('/api/qr-evaluaciones/share-email')
      .send({ to: 'a@b.com', subject: 'QR', grupoIds: [1] })
    expect(res.status).toBe(403)
  })

  it('C7: SMTP no configurado → 503', async () => {
    fromMock.mockImplementation(queueFrom({ qr_evaluaciones: [{ data: [qrRow], error: null }] }))
    const res = await request(app)
      .post('/api/qr-evaluaciones/share-email')
      .send({ to: 'a@b.com', subject: 'QR', grupoIds: [1], message: 'Hola' })
    expect(res.status).toBe(503)
  })

  it('C8: correo enviado → 200', async () => {
    process.env.SMTP_HOST = 'smtp.test'
    process.env.SMTP_USER = 'u'
    process.env.SMTP_PASS = 'p'
    process.env.SMTP_FROM = 'from@test.com'
    fromMock.mockImplementation(queueFrom({ qr_evaluaciones: [{ data: [qrRow], error: null }] }))
    const res = await request(app)
      .post('/api/qr-evaluaciones/share-email')
      .send({ to: 'a@b.com', subject: 'QR', grupoIds: [1], message: 'Hola' })
    expect(res.status).toBe(200)
    expect(res.body.sentTo).toBe('a@b.com')
    expect(sendMail).toHaveBeenCalledOnce()
  })
})
