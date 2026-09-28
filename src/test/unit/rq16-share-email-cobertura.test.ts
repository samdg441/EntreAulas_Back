import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const qrRepository = vi.hoisted(() => ({
  listActivosParaShare: vi.fn(),
}))

const sendMail = vi.hoisted(() => vi.fn())

vi.mock('../../modules/evaluations/qr.repository', () => ({ qrRepository }))
vi.mock('../../shared/adapters/mailer.adapter', () => ({ sendMail }))
vi.mock('../../modules/auth/role.service', () => ({
  RoleService: { obtenerCoordinadorPorUsuario: vi.fn() },
}))

import { compartirQrsPorEmail } from '../../modules/evaluations/qr-share-email'
import { RoleService } from '../../modules/auth/role.service'
import { adminUser, coordinadorUser } from '../fixtures/users'

const obtenerCoordinador = RoleService.obtenerCoordinadorPorUsuario as ReturnType<typeof vi.fn>

function setSmtp(on: boolean) {
  const SMTP = {
    SMTP_HOST: 'smtp.test',
    SMTP_USER: 'u',
    SMTP_PASS: 'p',
    SMTP_FROM: 'from@test.com',
  }
  for (const [k, v] of Object.entries(SMTP)) {
    if (on) process.env[k] = v
    else delete process.env[k]
  }
}

describe('RQ16 — compartirQrsPorEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setSmtp(true)
    sendMail.mockResolvedValue(undefined)
  })

  afterEach(() => {
    setSmtp(false)
  })

  it('correo inválido → 400', async () => {
    await expect(
      compartirQrsPorEmail(adminUser, { to: 'no-correo', subject: 'Hola', grupoIds: [1] })
    ).rejects.toMatchObject({ status: 400 })
  })

  it('asunto vacío → 400', async () => {
    await expect(
      compartirQrsPorEmail(adminUser, { to: 'a@b.com', subject: '  ', grupoIds: [1] })
    ).rejects.toMatchObject({ status: 400 })
  })

  it('sin QRs activos → 404', async () => {
    qrRepository.listActivosParaShare.mockResolvedValueOnce([])
    await expect(
      compartirQrsPorEmail(adminUser, { to: 'a@b.com', subject: 'QR', grupoIds: [1] })
    ).rejects.toMatchObject({ status: 404 })
  })

  it('SMTP no configurado → 503', async () => {
    setSmtp(false)
    qrRepository.listActivosParaShare.mockResolvedValueOnce([
      { grupo_id: 3, token: 'tok-1', curso: { nombre: 'Álgebra', codigo: 'MAT-101' } },
    ])
    await expect(
      compartirQrsPorEmail(adminUser, { to: 'a@b.com', subject: 'QR', grupoIds: [3] })
    ).rejects.toMatchObject({ status: 503 })
  })

  it('envía correo con los links', async () => {
    process.env.FRONTEND_URL = 'http://localhost:5173/'
    qrRepository.listActivosParaShare.mockResolvedValueOnce([
      {
        grupo_id: 3,
        token: 'tok-1',
        curso: { nombre: 'Álgebra', codigo: 'MAT-101' },
        grupo: { numero_grupo: 'A' },
        profesor: { usuario: { nombre: 'Ana', apellido: 'Pérez' } },
      },
    ])
    const r = await compartirQrsPorEmail(adminUser, {
      to: 'a@b.com',
      subject: 'QR grupos',
      message: 'Links de evaluación',
      grupoIds: [3],
    })
    expect(r.email).toBe('a@b.com')
    expect(r.totalLinks).toBe(1)
    expect(sendMail).toHaveBeenCalledTimes(1)
    expect(sendMail.mock.calls[0][0].text).toContain('Álgebra')
    delete process.env.FRONTEND_URL
  })

  it('coordinador: grupos de otra carrera → 403', async () => {
    obtenerCoordinador.mockResolvedValueOnce({ carrera_id: 5 })
    qrRepository.listActivosParaShare.mockResolvedValueOnce([
      { grupo_id: 3, token: 'tok-1', curso: { nombre: 'Álgebra', carrera_id: 9 } },
    ])
    await expect(
      compartirQrsPorEmail(coordinadorUser, { to: 'a@b.com', subject: 'QR', grupoIds: [3] })
    ).rejects.toMatchObject({ status: 403 })
  })

  it('error consultando QRs → 500', async () => {
    qrRepository.listActivosParaShare.mockRejectedValueOnce(new Error('db'))
    await expect(
      compartirQrsPorEmail(adminUser, { to: 'a@b.com', subject: 'QR', grupoIds: [1] })
    ).rejects.toMatchObject({ status: 500 })
  })
})
