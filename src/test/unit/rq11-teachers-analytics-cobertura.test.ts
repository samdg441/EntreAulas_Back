import { beforeEach, describe, expect, it, vi } from 'vitest'

const teachersRepository = vi.hoisted(() => ({
  findByUsuarioId: vi.fn(),
  findActiveProfessor: vi.fn(),
  findProfessorById: vi.fn(),
}))

const analyticsRepository = vi.hoisted(() => ({
  getCompletedInPeriod: vi.fn(),
  getGruposByIds: vi.fn(),
  listRespuestasByEvaluacionIds: vi.fn(),
  listPreguntasByIds: vi.fn(),
  listCategoriasByIds: vi.fn(),
  getEvaluacionesStats: vi.fn(),
}))

const academicRepository = vi.hoisted(() => ({
  listCursosByIds: vi.fn(),
}))

vi.mock('../../modules/academic/teachers.repository', () => ({ teachersRepository }))
vi.mock('../../modules/analytics/analytics.repository', () => ({ analyticsRepository }))
vi.mock('../../modules/academic/academic.repository', () => ({ academicRepository }))

import {
  acumularPorCategoria,
  agruparEvaluacionesPorCurso,
  comoLista,
  debeFiltrarPorCurso,
  evaluacionDelCurso,
  filtrarCarrerasSinTronco,
  filtroFechas,
  idComoTexto,
  idsUnicos,
  mapaPorCampo,
  mapearStatsCategoria,
  promedioCategoria,
  ratingRespuesta,
  ratingValido,
  teachersAnalyticsService,
} from '../../modules/analytics/teachers-analytics.service'

class RQ11TeachersAnalyticsCobertura {
  filtroYTexto() {
    expect(filtroFechas(undefined)).toEqual({})
    expect(filtroFechas({})).toEqual({})
    expect(filtroFechas('no-periodo')).toEqual({})
    expect(filtroFechas('2026-1')).toEqual({ gte: '2026-01-01', lte: '2026-06-30' })
    expect(filtroFechas(['2026-2'])).toEqual({ gte: '2026-07-01', lte: '2026-12-31' })
    expect(idComoTexto('3')).toBe('3')
    expect(idComoTexto(3)).toBe('3')
    expect(idComoTexto({ id: 3 })).toBe('')
    expect(idComoTexto(null)).toBe('')
  }

  listasYMapas() {
    expect(comoLista([1, 2])).toEqual([1, 2])
    expect(comoLista(null)).toEqual([])
    expect(idsUnicos([1, 1, 2])).toEqual([1, 2])
    expect(mapaPorCampo(undefined as any, 'curso_id')).toEqual({})
    expect(mapaPorCampo([{ id: 10, curso_id: 3 }], 'curso_id')).toEqual({ 10: 3 })
    expect(debeFiltrarPorCurso(3, [{ id: 1 }])).toBe(true)
    expect(debeFiltrarPorCurso('', [{ id: 1 }])).toBe(false)
    expect(debeFiltrarPorCurso(3, [])).toBe(false)
    expect(evaluacionDelCurso({ grupo_id: 10 }, { 10: 3 }, 3)).toBe(true)
    expect(evaluacionDelCurso({ grupo_id: 10 }, { 10: 9 }, '3')).toBe(false)
  }

  categorias() {
    expect(ratingRespuesta({ respuesta_rating: 4 })).toBe(4)
    expect(ratingRespuesta({ valor: '5' })).toBe(5)
    expect(ratingValido(4)).toBe(true)
    expect(ratingValido(0)).toBe(false)
    expect(ratingValido(Number.NaN)).toBe(false)
    expect(promedioCategoria(9, 2)).toBe(4.5)
    expect(promedioCategoria(0, 0)).toBe(0)
  }

  cursosYCarreras() {
    const agrupado = agruparEvaluacionesPorCurso(
      [{ grupo_id: 10, calificacion_promedio: 4 }],
      { 10: 3 },
      { 3: { nombre: 'Cálculo', codigo: 'MAT-1' } }
    )
    expect(agrupado['3-Cálculo'].total).toBe(1)
    expect(agrupado['3-Cálculo'].promedio).toBe(4)

    expect(
      filtrarCarrerasSinTronco([
        { nombre: 'Sistemas', activa: true },
        { nombre: 'Tronco común', activa: true },
        { nombre: 'Civil', activa: false },
      ])
    ).toEqual([{ nombre: 'Sistemas', activa: true }])
  }
}

describe('RQ11 — teachers-analytics.service (cobertura)', () => {
  const casos = new RQ11TeachersAnalyticsCobertura()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('filtro de fechas e ids no convierten objetos a [object Object]', () => {
    casos.filtroYTexto()
  })

  it('listas, mapas y filtro por curso', () => {
    casos.listasYMapas()
  })

  it('acumula ratings válidos por categoría', () => {
    const acumulado = acumularPorCategoria(
      [
        { pregunta_id: 1, respuesta_rating: 4 },
        { pregunta_id: 1, valor: 5 },
        { pregunta_id: 2, respuesta_rating: 0 },
        { pregunta_id: 99, respuesta_rating: 3 },
      ],
      { 1: '7', 2: '7' }
    )
    expect(acumulado['7']).toEqual({ sum: 9, count: 2 })
    expect(mapearStatsCategoria(acumulado, { 7: 'Saber' })).toEqual([
      { categoriaId: 7, nombre: 'Saber', promedio: 4.5 },
    ])
    expect(mapearStatsCategoria({ 8: { sum: 4, count: 1 } }, {})).toEqual([
      { categoriaId: 8, nombre: 'Categoría 8', promedio: 4 },
    ])
    casos.categorias()
  })

  it('agrupa evaluaciones y excluye tronco común', () => {
    casos.cursosYCarreras()
  })

  it('getPeriodCategoryStats: sin profesor → 404', async () => {
    teachersRepository.findByUsuarioId.mockResolvedValueOnce(null)
    await expect(
      teachersAnalyticsService.getPeriodCategoryStats('u1', '2026-1', 3)
    ).rejects.toMatchObject({ status: 404, message: 'Profesor no encontrado' })
  })

  it('getPeriodCategoryStats: sin evaluaciones → []', async () => {
    teachersRepository.findByUsuarioId.mockResolvedValueOnce({ id: 'p1' })
    analyticsRepository.getCompletedInPeriod.mockResolvedValueOnce([])
    await expect(teachersAnalyticsService.getPeriodCategoryStats('u1', '2026-1', null)).resolves.toEqual(
      []
    )
  })

  it('getPeriodCategoryStats: error al listar evaluaciones → 500', async () => {
    teachersRepository.findByUsuarioId.mockResolvedValueOnce({ id: 'p1' })
    analyticsRepository.getCompletedInPeriod.mockRejectedValueOnce(new Error('db'))
    await expect(
      teachersAnalyticsService.getPeriodCategoryStats('u1', {}, 3)
    ).rejects.toMatchObject({ status: 500 })
  })

  it('getPeriodCategoryStats: filtra curso, fallback de respuestas y arma promedio', async () => {
    teachersRepository.findByUsuarioId.mockResolvedValueOnce({ id: 'p1' })
    analyticsRepository.getCompletedInPeriod.mockResolvedValueOnce([
      { id: 1, grupo_id: 10 },
      { id: 2, grupo_id: 20 },
    ])
    analyticsRepository.getGruposByIds.mockResolvedValueOnce([
      { id: 10, curso_id: 3 },
      { id: 20, curso_id: 9 },
    ])
    analyticsRepository.listRespuestasByEvaluacionIds
      .mockRejectedValueOnce(new Error('columna'))
      .mockResolvedValueOnce([
        { pregunta_id: 1, valor: 4 },
        { pregunta_id: 1, valor: 5 },
      ])
    analyticsRepository.listPreguntasByIds.mockResolvedValueOnce([{ id: 1, categoria_id: 7 }])
    analyticsRepository.listCategoriasByIds.mockRejectedValueOnce(new Error('cats'))

    const r = await teachersAnalyticsService.getPeriodCategoryStats('u1', '2026-1', 3)
    expect(analyticsRepository.listRespuestasByEvaluacionIds).toHaveBeenCalledTimes(2)
    expect(r).toEqual([{ categoriaId: 7, nombre: 'Categoría 7', promedio: 4.5 }])
  })

  it('getPeriodCategoryStats: sin preguntas en respuestas → []', async () => {
    teachersRepository.findByUsuarioId.mockResolvedValueOnce({ id: 'p1' })
    analyticsRepository.getCompletedInPeriod.mockResolvedValueOnce([{ id: 1, grupo_id: 10 }])
    analyticsRepository.listRespuestasByEvaluacionIds.mockResolvedValueOnce([])
    await expect(teachersAnalyticsService.getPeriodCategoryStats('u1', '2026-1', null)).resolves.toEqual(
      []
    )
  })

  it('getPeriodCategoryStats: fallan ambas lecturas de respuestas → 500', async () => {
    teachersRepository.findByUsuarioId.mockResolvedValueOnce({ id: 'p1' })
    analyticsRepository.getCompletedInPeriod.mockResolvedValueOnce([{ id: 1, grupo_id: 10 }])
    analyticsRepository.listRespuestasByEvaluacionIds.mockRejectedValue(new Error('db'))
    await expect(
      teachersAnalyticsService.getPeriodCategoryStats('u1', '2026-1', null)
    ).rejects.toMatchObject({ status: 500 })
  })

  it('getHistorical: profesor inexistente usa filtroFechas', async () => {
    teachersRepository.findProfessorById.mockResolvedValueOnce(null)
    const r = await teachersAnalyticsService.getHistorical('p1', '2026-1')
    expect(r.isMockData).toBe(true)
    expect(r.dateRange).toEqual({ start: '2026-01-01', end: '2026-06-30' })
  })

  it('getHistorical: periodo objeto inválido → 400', async () => {
    teachersRepository.findProfessorById.mockResolvedValueOnce({ id: 'p1' })
    await expect(teachersAnalyticsService.getHistorical('p1', { q: 1 })).rejects.toMatchObject({
      status: 400,
    })
  })

  it('getStats: ordena recientes sin mutar el origen y 404 si no hay profesor', async () => {
    teachersRepository.findActiveProfessor.mockResolvedValueOnce(null)
    await expect(teachersAnalyticsService.getStats('p1')).rejects.toMatchObject({ status: 404 })

    teachersRepository.findActiveProfessor.mockResolvedValueOnce({ id: 'p1' })
    analyticsRepository.getEvaluacionesStats.mockResolvedValueOnce([
      {
        id: 1,
        grupo_id: 10,
        estudiante_id: 'e1',
        calificacion_promedio: 4,
        fecha_creacion: '2026-01-01',
      },
      {
        id: 2,
        grupo_id: 10,
        estudiante_id: 'e2',
        calificacion_promedio: 5,
        fecha_creacion: '2026-06-01',
      },
    ])
    analyticsRepository.getGruposByIds.mockResolvedValueOnce([{ id: 10, curso_id: 3 }])
    academicRepository.listCursosByIds.mockResolvedValueOnce([
      { id: 3, nombre: 'Cálculo', codigo: 'MAT' },
    ])

    const r = await teachersAnalyticsService.getStats('p1')
    expect(r.evaluacionesRecientes[0].id).toBe(2)
    expect(r.evaluacionesRecientes[0].curso).toBe('Cálculo')
    expect(r.totalEstudiantes).toBe(2)
  })
})
