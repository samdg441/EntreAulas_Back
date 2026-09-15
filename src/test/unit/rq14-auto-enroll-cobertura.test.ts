import { beforeEach, describe, expect, it, vi } from 'vitest'

const academicRepository = vi.hoisted(() => ({
  findEstudianteByUsuarioId: vi.fn(),
  findInscripcion: vi.fn(),
  reactivateInscripcion: vi.fn(),
  insertInscripcion: vi.fn(),
}))

const qrRepository = vi.hoisted(() => ({
  findActivoGrupoByToken: vi.fn(),
}))

vi.mock('../../modules/academic/academic.repository', () => ({ academicRepository }))
vi.mock('../../modules/evaluations/qr.repository', () => ({ qrRepository }))

import { autoEnrollPorQr } from '../../modules/evaluations/qr-auto-enroll'
import { estudianteUser } from '../fixtures/users'

describe('RQ14 — autoEnrollPorQr', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sin token → 400', async () => {
    await expect(autoEnrollPorQr('', estudianteUser)).rejects.toMatchObject({ status: 400 })
  })

  it('no es estudiante → 403', async () => {
    await expect(
      autoEnrollPorQr('tok', { id: 'u1', tipo_usuario: 'profesor' })
    ).rejects.toMatchObject({ status: 403 })
  })

  it('sin registro de estudiante → 404', async () => {
    academicRepository.findEstudianteByUsuarioId.mockResolvedValueOnce(null)
    await expect(autoEnrollPorQr('tok', estudianteUser)).rejects.toMatchObject({ status: 404 })
  })

  it('QR inválido → 404', async () => {
    academicRepository.findEstudianteByUsuarioId.mockResolvedValueOnce({ id: 'est-1' })
    qrRepository.findActivoGrupoByToken.mockResolvedValueOnce(null)
    await expect(autoEnrollPorQr('tok', estudianteUser)).rejects.toMatchObject({ status: 404 })
  })

  it('ya inscrito → 200 alreadyEnrolled', async () => {
    academicRepository.findEstudianteByUsuarioId.mockResolvedValueOnce({ id: 'est-1' })
    qrRepository.findActivoGrupoByToken.mockResolvedValueOnce({ grupo_id: 11 })
    academicRepository.findInscripcion.mockResolvedValueOnce({ id: 100, activa: true })
    const r = await autoEnrollPorQr('tok', estudianteUser)
    expect(r.body).toMatchObject({ enrolled: false, alreadyEnrolled: true, grupoId: 11 })
  })

  it('inscripción inactiva → reactiva', async () => {
    academicRepository.findEstudianteByUsuarioId.mockResolvedValueOnce({ id: 'est-1' })
    qrRepository.findActivoGrupoByToken.mockResolvedValueOnce({ grupo_id: 11 })
    academicRepository.findInscripcion.mockResolvedValueOnce({ id: 100, activa: false })
    academicRepository.reactivateInscripcion.mockResolvedValueOnce(undefined)
    const r = await autoEnrollPorQr('tok', estudianteUser)
    expect(r.body).toMatchObject({ enrolled: true, reactivated: true, grupoId: 11 })
  })

  it('sin inscripción previa → crea 201', async () => {
    academicRepository.findEstudianteByUsuarioId.mockResolvedValueOnce({ id: 'est-1' })
    qrRepository.findActivoGrupoByToken.mockResolvedValueOnce({ grupo_id: 22 })
    academicRepository.findInscripcion.mockResolvedValueOnce(null)
    academicRepository.insertInscripcion.mockResolvedValueOnce(undefined)
    const r = await autoEnrollPorQr('tok', estudianteUser)
    expect(r.status).toBe(201)
    expect(r.body.created).toBe(true)
  })

  it('error al validar inscripción → 500', async () => {
    academicRepository.findEstudianteByUsuarioId.mockResolvedValueOnce({ id: 'est-1' })
    qrRepository.findActivoGrupoByToken.mockResolvedValueOnce({ grupo_id: 22 })
    academicRepository.findInscripcion.mockRejectedValueOnce(new Error('db'))
    await expect(autoEnrollPorQr('tok', estudianteUser)).rejects.toMatchObject({ status: 500 })
  })

  it('error resolviendo el QR → 500', async () => {
    academicRepository.findEstudianteByUsuarioId.mockResolvedValueOnce({ id: 'est-1' })
    qrRepository.findActivoGrupoByToken.mockRejectedValueOnce(new Error('db'))
    await expect(autoEnrollPorQr('tok', estudianteUser)).rejects.toMatchObject({ status: 500 })
  })
})
