import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { queueFrom } from '../helpers/query-builder'
import { fromMock, supabaseModuleMock } from '../helpers/supabase-mock'
import { adminUser } from '../fixtures/users'
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

/** RQ16 integración: smoke 200 enviado. */
describe('RQ16 integration — Correo QR', () => {
  beforeEach(() => {
    fromMock.mockReset()
    setTestUser({ ...adminUser })
    sendMail.mockClear()
    process.env.SMTP_HOST = 'smtp.test'
    process.env.SMTP_USER = 'u'
    process.env.SMTP_PASS = 'p'
    process.env.SMTP_FROM = 'from@test.com'
  })

  afterEach(() => {
    delete process.env.SMTP_HOST
    delete process.env.SMTP_USER
    delete process.env.SMTP_PASS
    delete process.env.SMTP_FROM
  })

  it('C8 HTTP: 200 { sentTo, totalLinks }', async () => {
    fromMock.mockImplementation(
      queueFrom({
        qr_evaluaciones: [
          {
            data: [
              {
                grupo_id: 1,
                token: 't1',
                curso: { nombre: 'C', codigo: 'C1', carrera_id: 1 },
                grupo: { numero_grupo: 1 },
                profesor: { usuario: { nombre: 'A', apellido: 'B' } },
              },
            ],
            error: null,
          },
        ],
      })
    )
    const res = await request(app)
      .post('/api/qr-evaluaciones/share-email')
      .send({ to: 'ok@test.com', subject: 'QR', message: 'hola', grupoIds: [1] })
    expect(res.status).toBe(200)
    expect(res.body.sentTo).toBe('ok@test.com')
    expect(res.body.totalLinks).toBe(1)
    expect(sendMail).toHaveBeenCalledOnce()
  })
})
