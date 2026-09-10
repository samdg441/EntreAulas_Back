import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { PasswordResetService } from './password-reset.service'
import { PasswordResetError } from './password-reset.errors'
import type { PasswordResetRepository } from './password-reset.repository'
import type { MailerPort } from '../../shared/adapters/mailer.adapter'

vi.mock('../../utils/passwordSecurity', () => ({
  hashPassword: vi.fn().mockResolvedValue('hashed-password'),
}))

function mockRepo(partial: Partial<PasswordResetRepository>): PasswordResetRepository {
  return {
    findActiveUserByEmail: vi.fn(),
    invalidateUnusedTokens: vi.fn().mockResolvedValue(undefined),
    insertToken: vi.fn().mockResolvedValue(undefined),
    findUnusedToken: vi.fn(),
    markTokenUsed: vi.fn().mockResolvedValue(undefined),
    updateUserPassword: vi.fn().mockResolvedValue(undefined),
    ...partial,
  } as PasswordResetRepository
}

describe('PasswordResetService', () => {
  const mailer: MailerPort = { sendMail: vi.fn().mockResolvedValue(undefined) }
  const user = {
    id: 'user-1',
    email: 'ana@udem.edu.co',
    nombre: 'Ana',
    apellido: 'Gómez',
    activo: true,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.SMTP_HOST = 'smtp.test'
    process.env.SMTP_USER = 'user'
    process.env.SMTP_PASS = 'pass'
    process.env.SMTP_FROM = 'noreply@entreaulas.test'
    process.env.FRONTEND_URL = 'http://localhost:5173'
    delete process.env.PASSWORD_RESET_DEBUG_RESPONSE
    process.env.NODE_ENV = 'test'
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('rechaza un correo vacío o con formato inválido', async () => {
    const service = new PasswordResetService(mockRepo({}), mailer)

    await expect(service.requestReset('')).rejects.toMatchObject({
      statusCode: 400,
      message: 'El correo electrónico es requerido',
    })
    await expect(service.requestReset('no-es-correo')).rejects.toMatchObject({
      statusCode: 400,
      message: 'Formato de correo electrónico inválido',
    })
  })

  it('no revela si el usuario no existe y no envía correo', async () => {
    const repo = mockRepo({
      findActiveUserByEmail: vi.fn().mockResolvedValue(null),
    })
    const service = new PasswordResetService(repo, mailer)

    const result = await service.requestReset('desconocido@udem.edu.co')

    expect(result.message).toContain('Si el correo electrónico existe')
    expect(repo.insertToken).not.toHaveBeenCalled()
    expect(mailer.sendMail).not.toHaveBeenCalled()
  })

  it('genera token, lo persiste hasheado y envía el correo SMTP', async () => {
    const repo = mockRepo({
      findActiveUserByEmail: vi.fn().mockResolvedValue(user),
    })
    const service = new PasswordResetService(repo, mailer)

    const result = await service.requestReset('  Ana@udem.edu.co ')

    expect(repo.invalidateUnusedTokens).toHaveBeenCalledWith('ana@udem.edu.co')
    expect(repo.insertToken).toHaveBeenCalledTimes(1)
    const inserted = (repo.insertToken as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(inserted.email).toBe('ana@udem.edu.co')
    expect(inserted.token).toHaveLength(64)
    expect(inserted.token).not.toMatch(/[^a-f0-9]/)
    expect(mailer.sendMail).toHaveBeenCalledTimes(1)
    const mail = (mailer.sendMail as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(mail.to).toBe('ana@udem.edu.co')
    expect(mail.html).toContain('/reset-password?token=')
    expect(result.resetToken).toBeUndefined()
  })

  it('rechaza un token expirado con mensaje claro', async () => {
    const repo = mockRepo({
      findUnusedToken: vi.fn().mockResolvedValue({
        id: 'tok-1',
        email: user.email,
        token: 'hash',
        expires_at: new Date(Date.now() - 1000).toISOString(),
        used: false,
        created_at: new Date().toISOString(),
      }),
    })
    const service = new PasswordResetService(repo, mailer)

    await expect(
      service.validateResetToken('plain-token', user.email)
    ).rejects.toBeInstanceOf(PasswordResetError)

    await expect(
      service.validateResetToken('plain-token', user.email)
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'El token ha expirado. Solicita uno nuevo.',
    })
  })

  it('actualiza la contraseña y revoca el token usado', async () => {
    const repo = mockRepo({
      findUnusedToken: vi.fn().mockResolvedValue({
        id: 'tok-1',
        email: user.email,
        token: 'hash',
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        used: false,
        created_at: new Date().toISOString(),
      }),
      findActiveUserByEmail: vi.fn().mockResolvedValue(user),
    })
    const service = new PasswordResetService(repo, mailer)

    const result = await service.resetPassword({
      token: 'plain-token',
      email: user.email,
      newPassword: 'NuevaClave1!',
      confirmPassword: 'NuevaClave1!',
    })

    expect(result.message).toBe('Contraseña actualizada exitosamente')
    expect(repo.updateUserPassword).toHaveBeenCalledWith('user-1', 'hashed-password')
    expect(repo.markTokenUsed).toHaveBeenCalledWith('tok-1')
    expect(repo.invalidateUnusedTokens).toHaveBeenCalledWith(user.email)
  })

  it('responde Usuario no encontrado si el token es válido pero el usuario ya no existe', async () => {
    const repo = mockRepo({
      findUnusedToken: vi.fn().mockResolvedValue({
        id: 'tok-1',
        email: user.email,
        token: 'hash',
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        used: false,
        created_at: new Date().toISOString(),
      }),
      findActiveUserByEmail: vi.fn().mockResolvedValue(null),
    })
    const service = new PasswordResetService(repo, mailer)

    await expect(
      service.resetPassword({
        token: 'plain-token',
        email: user.email,
        newPassword: 'NuevaClave1!',
        confirmPassword: 'NuevaClave1!',
      })
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'Usuario no encontrado',
    })
  })

  it('rechaza contraseñas que no coinciden o son débiles', async () => {
    const service = new PasswordResetService(mockRepo({}), mailer)

    await expect(
      service.resetPassword({
        token: 't',
        email: user.email,
        newPassword: 'NuevaClave1!',
        confirmPassword: 'OtraClave1!',
      })
    ).rejects.toMatchObject({ message: 'Las contraseñas no coinciden' })

    await expect(
      service.resetPassword({
        token: 't',
        email: user.email,
        newPassword: 'corta',
        confirmPassword: 'corta',
      })
    ).rejects.toMatchObject({
      message: 'La contraseña debe tener al menos 8 caracteres',
    })
  })
})
