import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fromMock, supabaseModuleMock } from '../helpers/supabase-mock'
import { queueFrom } from '../helpers/query-builder'

const academicRepository = vi.hoisted(() => ({
  listCursosActivosInCareer: vi.fn(),
  listAsignacionesActivasByGrupoIds: vi.fn(),
  listAsignacionesByGrupoIds: vi.fn(),
  findAsignacionByGrupo: vi.fn(),
}))

const qrRepository = vi.hoisted(() => ({
  listActivosByGrupoIds: vi.fn(),
  insert: vi.fn(),
}))

vi.mock('../../config/supabase-only', () => supabaseModuleMock)
vi.mock('../../config/supabaseClient', () => supabaseModuleMock)
vi.mock('../../modules/academic/academic.repository', () => ({ academicRepository }))
vi.mock('../../modules/evaluations/qr.repository', () => ({ qrRepository }))
vi.mock('../../modules/auth/role.service', () => ({
  RoleService: { obtenerCoordinadorPorUsuario: vi.fn() },
}))

import { generarQrsBatch, parseGrupoIds } from '../../modules/evaluations/qr-batch'
import { RoleService } from '../../modules/auth/role.service'
import { adminUser, coordinadorUser } from '../fixtures/users'

const obtenerCoordinador = RoleService.obtenerCoordinadorPorUsuario as ReturnType<typeof vi.fn>

function mockGrupos(result: { data: unknown; error: unknown }) {
  fromMock.mockImplementation(queueFrom({ grupos: [result] }))
}

describe('RQ15 — generarQrsBatch', () => {
  beforeEach(() => {
    fromMock.mockReset()
    vi.clearAllMocks()
    academicRepository.listAsignacionesActivasByGrupoIds.mockResolvedValue([])
    academicRepository.listAsignacionesByGrupoIds.mockResolvedValue([])
    qrRepository.listActivosByGrupoIds.mockResolvedValue([])
    qrRepository.insert.mockResolvedValue(undefined)
  })

  it('parseGrupoIds rechaza vacío', () => {
    expect(() => parseGrupoIds([])).toThrow(/grupoIds/)
    expect(() => parseGrupoIds(['x'])).toThrow(/números/)
    expect(parseGrupoIds(['3', 8])).toEqual([3, 8])
  })

  it('crea QR cuando el grupo tiene profesor', async () => {
    mockGrupos({ data: [{ id: 1, curso_id: 10, profesor_id: 'p1' }], error: null })
    const r = await generarQrsBatch(adminUser, [1], 2026)
    expect(r.created).toHaveLength(1)
    expect(r.created[0].grupoId).toBe(1)
    expect(qrRepository.insert).toHaveBeenCalledWith(
      expect.objectContaining({ grupo_id: 1, periodo_id: 2026, activo: true })
    )
  })

  it('reusa token si ya existe QR activo', async () => {
    mockGrupos({ data: [{ id: 7, curso_id: 1, profesor_id: 'p1' }], error: null })
    qrRepository.listActivosByGrupoIds.mockResolvedValueOnce([
      { grupo_id: 7, token: 'ya-existe', profesor_id: 'p1' },
    ])
    const r = await generarQrsBatch(adminUser, [7], null)
    expect(r.created).toEqual([{ grupoId: 7, token: 'ya-existe' }])
    expect(qrRepository.insert).not.toHaveBeenCalled()
  })

  it('sin profesor → skipped', async () => {
    mockGrupos({ data: [{ id: 5, curso_id: 3, profesor_id: null }], error: null })
    const r = await generarQrsBatch(adminUser, [5], null)
    expect(r.skipped[0]).toMatchObject({ grupoId: 5 })
  })

  it('coordinador: grupo de otra carrera → skipped', async () => {
    obtenerCoordinador.mockResolvedValueOnce({ carrera_id: 5 })
    mockGrupos({ data: [{ id: 1, curso_id: 10, profesor_id: 'p1' }], error: null })
    academicRepository.listCursosActivosInCareer.mockResolvedValueOnce([{ id: 99 }])
    const r = await generarQrsBatch(coordinadorUser, [1], 2)
    expect(r.skipped[0].reason).toMatch(/carrera/)
  })

  it('coordinador sin carrera asignada → 403', async () => {
    obtenerCoordinador.mockResolvedValueOnce(null)
    await expect(generarQrsBatch(coordinadorUser, [1], null)).rejects.toMatchObject({
      status: 403,
    })
  })

  it('grupo que no existe no se lista', async () => {
    mockGrupos({ data: [], error: null })
    academicRepository.listAsignacionesActivasByGrupoIds.mockRejectedValueOnce(new Error('timeout'))
    academicRepository.listAsignacionesByGrupoIds.mockResolvedValueOnce([])
    const r = await generarQrsBatch(adminUser, [99], null)
    expect(r.created).toEqual([])
    expect(r.skipped).toEqual([])
  })

  it('resuelve profesor por asignación del grupo', async () => {
    mockGrupos({
      data: [{ id: 4, curso_id: 10, profesor_id: null, asignacion_profesor_id: 88 }],
      error: null,
    })
    academicRepository.findAsignacionByGrupo.mockResolvedValueOnce({ profesor_id: 'p-asig' })
    const r = await generarQrsBatch(adminUser, [4], null)
    expect(r.created[0].grupoId).toBe(4)
    expect(qrRepository.insert).toHaveBeenCalled()
  })

  it('periodoId no numérico se omite', async () => {
    mockGrupos({ data: [{ id: 1, curso_id: 10, profesor_id: 'p1' }], error: null })
    await generarQrsBatch(adminUser, [1], 'abc')
    expect(qrRepository.insert).toHaveBeenCalledWith(
      expect.not.objectContaining({ periodo_id: expect.anything() })
    )
  })

  it('error listando QRs existentes → 500', async () => {
    mockGrupos({ data: [{ id: 1, curso_id: 10, profesor_id: 'p1' }], error: null })
    qrRepository.listActivosByGrupoIds.mockRejectedValueOnce(new Error('db'))
    await expect(generarQrsBatch(adminUser, [1], null)).rejects.toMatchObject({ status: 500 })
  })
})
