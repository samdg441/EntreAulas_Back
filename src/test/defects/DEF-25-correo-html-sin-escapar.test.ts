/**
 * DEF-25 — El HTML del correo QR no escapa el mensaje (RQ16)
 *
 * Severidad: Media | Estado: ABIERTO
 *
 * `share-email` interpola `message` en `htmlBody` sin escape. Un texto con
 * `<img onerror>` llega al destinatario como HTML activo.
 */
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

const payloadXss = '<img src=x onerror=alert(1)>'

describe('DEF-25 — El mensaje del correo debe ir escapado en HTML', () => {
  beforeEach(() => {
    fromMock.mockReset()
    sendMail.mockClear()
    setTestUser({ ...adminUser })
    process.env.SMTP_HOST = 'h'
    process.env.SMTP_USER = 'u'
    process.env.SMTP_PASS = 'p'
    process.env.SMTP_FROM = 'from@test.com'
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
  })

  afterEach(() => {
    delete process.env.SMTP_HOST
    delete process.env.SMTP_USER
    delete process.env.SMTP_PASS
    delete process.env.SMTP_FROM
  })

  it('un <img onerror> no debe aparecer crudo en html', async () => {
    const res = await request(app).post('/api/qr-evaluaciones/share-email').send({
      to: 'ok@test.com',
      subject: 'QR',
      message: payloadXss,
      grupoIds: [1],
    })
    expect(res.status).toBe(200)
    const html = String(sendMail.mock.calls[0]?.[0]?.html ?? '')
    expect(html).not.toContain('<img src=x onerror=alert(1)>')
  })
})
