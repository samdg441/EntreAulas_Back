import { afterEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { fromMock, supabaseModuleMock } from '../../helpers/supabase-mock'

vi.mock('../../../config/supabase-only', () => supabaseModuleMock)
vi.mock('../../../config/supabaseClient', () => supabaseModuleMock)

import { app } from '../../../app'
import { qrRepository } from '../../../modules/evaluations/qr.repository'
import { autoEnrollPorQr } from '../../../modules/evaluations/qr-auto-enroll'
import { academicRepository } from '../../../modules/academic/academic.repository'
import {
  esTokenQrValido,
  qrVencido,
  resolverEvaluacionQr,
  sinVencer,
} from '../../../modules/evaluations/qr-resolucion'
import { estudianteUser } from '../../fixtures/users'

const TOKEN = '00000000-0000-4000-8000-000000000018'
const AHORA = new Date('2026-10-12T12:00:00Z')
const AYER = '2026-10-11T12:00:00Z'
const MANANA = '2026-10-13T12:00:00Z'
const HACE_ANOS = '2020-01-01T00:00:00Z'

function filaQr(expires_at: string | null) {
  return { id: 1, token: TOKEN, profesor_id: 10, curso_id: 20, grupo_id: 30, periodo_id: 1, expires_at }
}

/**
 * RQ18 — un QR deja de servir cuando pasa su `expires_at`, y un token que no es UUID
 * se rechaza con 404 antes de consultar la base (DEF-37).
 */
describe('RQ18 — QR vencido y token con formato inválido', () => {
  afterEach(() => vi.restoreAllMocks())

  it('esTokenQrValido solo acepta UUID', () => {
    expect(esTokenQrValido(TOKEN)).toBe(true)
    expect(esTokenQrValido('token-que-no-existe')).toBe(false)
    expect(esTokenQrValido(undefined)).toBe(false)
  })

  it.each([
    [null, false],
    ['', false],
    [MANANA, false],
    [AYER, true],
    ['2026-10-12T12:00:00Z', true],
    ['no-es-fecha', true],
    [new Date(AYER), true],
    [{ fecha: AYER }, true],
  ])('qrVencido(%s) → %s', (expiresAt, esperado) => {
    expect(qrVencido(expiresAt, AHORA)).toBe(esperado)
  })

  it('sinVencer quita solo los QR con fecha pasada', () => {
    const filas = [{ grupo_id: 1, expires_at: AYER }, { grupo_id: 2, expires_at: MANANA }, { grupo_id: 3 }]

    expect(sinVencer(filas, AHORA).map((f) => f.grupo_id)).toEqual([2, 3])
  })

  it('resolverEvaluacionQr responde 404 con un QR activo pero vencido', () => {
    const r = resolverEvaluacionQr({ token: TOKEN, ahora: AHORA, qr: { activo: true, expires_at: AYER, grupo_id: 30 } })

    expect(r).toEqual({ ok: false, status: 404, error: 'QR inválido o expirado.' })
  })

  it('GET /api/qr-evaluaciones/:token con QR vencido → 404', async () => {
    vi.spyOn(qrRepository, 'findActivoByToken').mockResolvedValue(filaQr(HACE_ANOS) as never)

    const res = await request(app).get(`/api/qr-evaluaciones/${TOKEN}`)

    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'QR inválido o expirado.' })
  })

  it('GET /api/qr-evaluaciones/:token con fecha futura → 200', async () => {
    vi.spyOn(qrRepository, 'findActivoByToken').mockResolvedValue(filaQr('2999-01-01T00:00:00Z') as never)

    const res = await request(app).get(`/api/qr-evaluaciones/${TOKEN}`)

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ profesorId: 10, cursoId: 20, grupoId: 30 })
  })

  it('auto-inscripción con QR vencido → 404', async () => {
    vi.spyOn(academicRepository, 'findEstudianteByUsuarioId').mockResolvedValue({ id: 'est-1' } as never)
    vi.spyOn(qrRepository, 'findActivoGrupoByToken').mockResolvedValue(
      { id: 1, token: TOKEN, grupo_id: 30, activo: true, expires_at: HACE_ANOS } as never
    )

    await expect(autoEnrollPorQr(TOKEN, estudianteUser)).rejects.toMatchObject({ status: 404 })
  })

  it('auto-inscripción con token que no es UUID → 404 sin consultar la base', async () => {
    vi.spyOn(academicRepository, 'findEstudianteByUsuarioId').mockResolvedValue({ id: 'est-1' } as never)
    const consulta = vi.spyOn(qrRepository, 'findActivoGrupoByToken')

    await expect(autoEnrollPorQr('qr-roto', estudianteUser)).rejects.toMatchObject({ status: 404 })
    expect(consulta).not.toHaveBeenCalled()
  })

  it.each(['listActivosByGrupoIds', 'listActivosParaShare'] as const)(
    '%s no devuelve QR vencidos',
    async (metodo) => {
      const filas = [
        { grupo_id: 1, token: 'a', expires_at: HACE_ANOS },
        { grupo_id: 2, token: 'b', expires_at: null },
      ]
      const consulta = { select: () => consulta, eq: () => consulta, in: async () => ({ data: filas, error: null }) }
      fromMock.mockReturnValue(consulta)

      const r = await qrRepository[metodo]([1, 2])

      expect(r.map((f: { grupo_id: number }) => f.grupo_id)).toEqual([2])
    }
  )
})
