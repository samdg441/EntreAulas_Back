import { beforeEach, describe, expect, it, vi } from 'vitest'

const teachersRepository = vi.hoisted(() => ({
  findByUsuarioId: vi.fn(),
  findActiveProfessor: vi.fn(),
  findProfessorById: vi.fn(),
  listByCareerDetailed: vi.fn(),
}))

const analyticsRepository = vi.hoisted(() => ({
  getCompletedInPeriod: vi.fn(),
  getGruposByIds: vi.fn(),
  listRespuestasByEvaluacionIds: vi.fn(),
  listPreguntasByIds: vi.fn(),
  listCategoriasByIds: vi.fn(),
  getEvaluacionesStats: vi.fn(),
  getEvaluacionesHistoricas: vi.fn(),
  listEvaluaciones: vi.fn(),
  getCompletedForTeacherStats: vi.fn(),
}))

const academicRepository = vi.hoisted(() => ({
  listCursosByIds: vi.fn(),
  listCarreras: vi.fn(),
  getCarreraById: vi.fn(),
  findEstudianteByUsuarioId: vi.fn(),
  listInscripcionesActivas: vi.fn(),
  listAsignacionesByProfesorIds: vi.fn(),
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

  it('getStats: error de evaluaciones → 500 y cursos caen a vacío', async () => {
    teachersRepository.findActiveProfessor.mockResolvedValueOnce({ id: 'p1' })
    analyticsRepository.getEvaluacionesStats.mockRejectedValueOnce(new Error('db'))
    await expect(teachersAnalyticsService.getStats('p1')).rejects.toMatchObject({ status: 500 })

    teachersRepository.findActiveProfessor.mockResolvedValueOnce({ id: 'p1' })
    analyticsRepository.getEvaluacionesStats.mockResolvedValueOnce([
      { id: 1, grupo_id: 10, estudiante_id: 'e1', calificacion_promedio: 4, fecha_creacion: '2026-01-01' },
    ])
    analyticsRepository.getGruposByIds.mockResolvedValueOnce([{ id: 10, curso_id: 3 }])
    academicRepository.listCursosByIds.mockRejectedValueOnce(new Error('cursos'))
    const r = await teachersAnalyticsService.getStats('p1')
    expect(r.evaluacionesRecientes[0].curso).toBe('Curso desconocido')
  })

  it('getHistorical: con profesor arma métricas y sin periodo no hay dateRange', async () => {
    teachersRepository.findProfessorById.mockResolvedValue({ id: 'p1' })
    analyticsRepository.getEvaluacionesHistoricas.mockRejectedValueOnce(new Error('db'))
    await expect(teachersAnalyticsService.getHistorical('p1', '2026-1')).rejects.toMatchObject({
      status: 500,
    })

    analyticsRepository.getEvaluacionesHistoricas.mockResolvedValueOnce([
      { id: 1, grupo_id: 10, estudiante_id: 'e1', calificacion_promedio: 4, fecha_creacion: '2026-03-01' },
    ])
    analyticsRepository.getGruposByIds.mockResolvedValueOnce([{ id: 10, curso_id: 3 }])
    academicRepository.listCursosByIds.mockResolvedValueOnce([{ id: 3, nombre: 'Cálculo', codigo: 'MAT' }])
    const conPeriodo = await teachersAnalyticsService.getHistorical('p1', '2026-1')
    expect(conPeriodo.totalEvaluaciones).toBe(1)
    expect(conPeriodo.dateRange?.start).toBe('2026-01-01')

    analyticsRepository.getEvaluacionesHistoricas.mockResolvedValueOnce([])
    analyticsRepository.getGruposByIds.mockResolvedValueOnce([])
    academicRepository.listCursosByIds.mockResolvedValueOnce([])
    const sinPeriodo = await teachersAnalyticsService.getHistorical('p1', undefined)
    expect(sinPeriodo.dateRange).toBeNull()
    expect(sinPeriodo.period).toBe('all')
  })

  it('getCourseRating: vacío, fallback de columnas y promedio likert', async () => {
    analyticsRepository.listEvaluaciones.mockRejectedValueOnce(new Error('col')).mockResolvedValueOnce([])
    analyticsRepository.getGruposByIds.mockResolvedValueOnce([])
    const vacio = await teachersAnalyticsService.getCourseRating('p1', '3')
    expect(vacio.promedio).toBeNull()
    expect(vacio.total_respuestas).toBe(0)

    analyticsRepository.listEvaluaciones.mockRejectedValue(new Error('db'))
    await expect(teachersAnalyticsService.getCourseRating('p1', '3')).rejects.toMatchObject({
      status: 500,
    })
    analyticsRepository.listEvaluaciones.mockReset()

    analyticsRepository.listEvaluaciones.mockResolvedValueOnce([
      { id: 1, grupo_id: 10, curso_id: 3 },
      { id: 2, grupo_id: 20 },
    ])
    analyticsRepository.getGruposByIds.mockResolvedValueOnce([
      { id: 10, curso_id: 3 },
      { id: 20, curso_id: 9 },
    ])
    analyticsRepository.listRespuestasByEvaluacionIds.mockRejectedValueOnce(new Error('r'))
    const sinRespuestas = await teachersAnalyticsService.getCourseRating('p1', '3')
    expect(sinRespuestas.total_evaluaciones).toBe(1)
    expect(sinRespuestas.promedio).toBeNull()

    analyticsRepository.listEvaluaciones.mockResolvedValueOnce([{ id: 1, grupo_id: 10, curso_id: 3 }])
    analyticsRepository.getGruposByIds.mockResolvedValueOnce([{ id: 10, curso_id: 3 }])
    analyticsRepository.listRespuestasByEvaluacionIds.mockResolvedValueOnce([
      { pregunta_id: 1, respuesta_rating: '5' },
    ])
    analyticsRepository.listPreguntasByIds.mockRejectedValueOnce(new Error('t')).mockResolvedValueOnce([
      { id: 1 },
    ])
    const ok = await teachersAnalyticsService.getCourseRating('p1', '3')
    expect(ok.promedio).toBe(5)
    expect(ok.total_respuestas).toBe(1)
  })

  it('getCareerResultsAll: filtra tronco y promedia', async () => {
    academicRepository.listCarreras.mockRejectedValueOnce(new Error('cols')).mockResolvedValueOnce([
      { id: 1, nombre: 'Sistemas', codigo: 'SIS', activa: true },
      { id: 2, nombre: 'Tronco común', codigo: 'TC', activa: true },
    ])
    analyticsRepository.listEvaluaciones.mockResolvedValueOnce([{ calificacion_promedio: 4 }])
    const r = await teachersAnalyticsService.getCareerResultsAll()
    expect(r.estadisticas_generales.total_carreras).toBe(1)
    expect(r.estadisticas_generales.promedio_general).toBe(4)

    academicRepository.listCarreras.mockRejectedValue(new Error('db'))
    await expect(teachersAnalyticsService.getCareerResultsAll()).rejects.toMatchObject({ status: 500 })
    academicRepository.listCarreras.mockReset()
    academicRepository.listCarreras.mockResolvedValueOnce([{ id: 1, nombre: 'Sistemas', activa: true }])
    analyticsRepository.listEvaluaciones.mockRejectedValueOnce(new Error('ev'))
    await expect(teachersAnalyticsService.getCareerResultsAll()).rejects.toMatchObject({ status: 500 })
  })

  it('getCareerResultsByCareer: 404, profesores y filtro por carrera', async () => {
    academicRepository.getCarreraById.mockRejectedValueOnce(new Error('db'))
    await expect(teachersAnalyticsService.getCareerResultsByCareer('1')).rejects.toMatchObject({
      status: 404,
    })
    academicRepository.getCarreraById.mockResolvedValueOnce(null)
    await expect(teachersAnalyticsService.getCareerResultsByCareer('1')).rejects.toMatchObject({
      status: 404,
    })

    academicRepository.getCarreraById.mockResolvedValueOnce({
      id: 1,
      nombre: 'Sistemas',
      codigo: 'SIS',
      descripcion: null,
      activa: true,
    })
    teachersRepository.listByCareerDetailed.mockRejectedValueOnce(new Error('p'))
    await expect(teachersAnalyticsService.getCareerResultsByCareer('1')).rejects.toMatchObject({
      status: 500,
    })

    academicRepository.getCarreraById.mockResolvedValueOnce({
      id: 1,
      nombre: 'Sistemas',
      codigo: 'SIS',
      activa: true,
    })
    teachersRepository.listByCareerDetailed.mockResolvedValueOnce([{ id: 'p1' }])
    analyticsRepository.listEvaluaciones.mockRejectedValueOnce(new Error('e'))
    await expect(teachersAnalyticsService.getCareerResultsByCareer('1')).rejects.toMatchObject({
      status: 500,
    })

    academicRepository.getCarreraById.mockResolvedValueOnce({
      id: 1,
      nombre: 'Sistemas',
      codigo: 'SIS',
      activa: true,
    })
    teachersRepository.listByCareerDetailed.mockResolvedValueOnce([{ id: 'p1' }])
    analyticsRepository.listEvaluaciones.mockResolvedValueOnce([
      {
        id: 1,
        calificacion_promedio: 4,
        fecha_creacion: '2026-01-01',
        profesor_id: 'p1',
        grupo_id: 10,
      },
    ])
    analyticsRepository.getGruposByIds.mockRejectedValueOnce(new Error('g'))
    academicRepository.listCursosByIds.mockRejectedValueOnce(new Error('c'))
    const vacio = await teachersAnalyticsService.getCareerResultsByCareer('1')
    expect(vacio.estadisticas_carrera.total_profesores).toBe(1)
    expect(vacio.profesores[0].total_evaluaciones).toBe(0)

    academicRepository.getCarreraById.mockResolvedValueOnce({
      id: 1,
      nombre: 'Sistemas',
      codigo: 'SIS',
      activa: true,
    })
    teachersRepository.listByCareerDetailed.mockResolvedValueOnce([{ id: 'p1' }])
    analyticsRepository.listEvaluaciones.mockResolvedValueOnce([
      {
        id: 1,
        calificacion_promedio: 5,
        fecha_creacion: '2026-01-01',
        profesor_id: 'p1',
        grupo_id: 10,
      },
    ])
    analyticsRepository.getGruposByIds.mockResolvedValueOnce([{ id: 10, curso_id: 3 }])
    academicRepository.listCursosByIds.mockResolvedValueOnce([{ id: 3, carrera_id: 1 }])
    const ok = await teachersAnalyticsService.getCareerResultsByCareer('1')
    expect(ok.profesores[0].total_evaluaciones).toBe(1)
    expect(ok.estadisticas_carrera.promedio_general).toBe(5)
  })

  it('getStudentStats: ceros, catch de consultas y progreso', async () => {
    academicRepository.findEstudianteByUsuarioId.mockResolvedValueOnce(null)
    await expect(teachersAnalyticsService.getStudentStats('u1')).resolves.toMatchObject({
      evaluacionesCompletadas: 0,
      materiasMatriculadas: 0,
    })

    academicRepository.findEstudianteByUsuarioId.mockResolvedValueOnce({ id: 'est-1' })
    analyticsRepository.listEvaluaciones.mockRejectedValueOnce(new Error('e'))
    academicRepository.listInscripcionesActivas.mockRejectedValueOnce(new Error('i'))
    const ceros = await teachersAnalyticsService.getStudentStats('u1')
    expect(ceros.progresoGeneral).toBe(0)

    academicRepository.findEstudianteByUsuarioId.mockResolvedValueOnce({ id: 'est-1' })
    analyticsRepository.listEvaluaciones.mockResolvedValueOnce([
      { id: 1, calificacion_promedio: 4 },
      { id: 2, calificacion_promedio: 5 },
    ])
    academicRepository.listInscripcionesActivas.mockResolvedValueOnce([{ id: 'i1' }, { id: 'i2' }, { id: 'i3' }])
    const ok = await teachersAnalyticsService.getStudentStats('u1')
    expect(ok).toMatchObject({
      evaluacionesCompletadas: 2,
      evaluacionesPendientes: 1,
      promedioGeneral: 4.5,
      progresoGeneral: 67,
    })
  })

  it('getTeacherStats: 404, errores y ranking por curso', async () => {
    teachersRepository.findProfessorById.mockResolvedValueOnce(null)
    await expect(teachersAnalyticsService.getTeacherStats('p1')).rejects.toMatchObject({ status: 404 })

    teachersRepository.findProfessorById.mockResolvedValueOnce({ id: 'p1' })
    analyticsRepository.getCompletedForTeacherStats.mockRejectedValueOnce(new Error('e'))
    await expect(teachersAnalyticsService.getTeacherStats('p1')).rejects.toMatchObject({ status: 500 })

    teachersRepository.findProfessorById.mockResolvedValueOnce({ id: 'p1' })
    analyticsRepository.getCompletedForTeacherStats.mockResolvedValueOnce([{ id: 1, grupo_id: 10, calificacion_promedio: 4 }])
    analyticsRepository.getGruposByIds.mockRejectedValueOnce(new Error('g'))
    await expect(teachersAnalyticsService.getTeacherStats('p1')).rejects.toMatchObject({ status: 500 })

    teachersRepository.findProfessorById.mockResolvedValueOnce({ id: 'p1' })
    analyticsRepository.getCompletedForTeacherStats.mockResolvedValueOnce([
      { id: 1, grupo_id: 10, calificacion_promedio: 4 },
    ])
    analyticsRepository.getGruposByIds.mockResolvedValueOnce([{ id: 10, curso_id: 3 }])
    academicRepository.listAsignacionesByProfesorIds.mockRejectedValueOnce(new Error('a'))
    await expect(teachersAnalyticsService.getTeacherStats('p1')).rejects.toMatchObject({ status: 500 })

    teachersRepository.findProfessorById.mockResolvedValueOnce({ id: 'p1' })
    analyticsRepository.getCompletedForTeacherStats.mockResolvedValueOnce([
      { id: 1, grupo_id: 10, calificacion_promedio: 4 },
      { id: 2, grupo_id: 10, calificacion_promedio: 5 },
    ])
    analyticsRepository.getGruposByIds.mockResolvedValueOnce([{ id: 10, curso_id: 3 }])
    academicRepository.listAsignacionesByProfesorIds.mockResolvedValueOnce([
      { curso_id: 3, grupo_id: 10, activa: true },
    ])
    academicRepository.listCursosByIds.mockRejectedValueOnce(new Error('c'))
    await expect(teachersAnalyticsService.getTeacherStats('p1')).rejects.toMatchObject({ status: 500 })

    teachersRepository.findProfessorById.mockResolvedValueOnce({ id: 'p1' })
    analyticsRepository.getCompletedForTeacherStats.mockResolvedValueOnce([
      { id: 1, grupo_id: 10, calificacion_promedio: 4 },
      { id: 2, grupo_id: 99, calificacion_promedio: 5 },
    ])
    analyticsRepository.getGruposByIds.mockResolvedValueOnce([{ id: 10, curso_id: 3 }])
    academicRepository.listAsignacionesByProfesorIds.mockResolvedValueOnce([
      { curso_id: 3, grupo_id: 10, activa: true },
    ])
    academicRepository.listCursosByIds.mockResolvedValueOnce([{ id: 3, nombre: 'Cálculo', codigo: 'MAT' }])
    const ok = await teachersAnalyticsService.getTeacherStats('p1')
    expect(ok.totalEvaluaciones).toBe(2)
    expect(ok.evaluacionesPorCurso[0].nombre).toBe('Cálculo')
    expect(ok.evaluacionesPorCurso[0].promedio).toBe(4)
  })

  it('getPeriodStats: 404, error, vacío y agrupación por curso', async () => {
    teachersRepository.findByUsuarioId.mockResolvedValueOnce(null)
    await expect(teachersAnalyticsService.getPeriodStats('u1', '2026-1')).rejects.toMatchObject({
      status: 404,
    })

    teachersRepository.findByUsuarioId.mockResolvedValueOnce({ id: 'p1' })
    analyticsRepository.getCompletedInPeriod.mockRejectedValueOnce(new Error('e'))
    await expect(teachersAnalyticsService.getPeriodStats('u1', '2026-1')).rejects.toMatchObject({
      status: 500,
    })

    teachersRepository.findByUsuarioId.mockResolvedValueOnce({ id: 'p1' })
    analyticsRepository.getCompletedInPeriod.mockResolvedValueOnce(null)
    analyticsRepository.getGruposByIds.mockResolvedValueOnce([])
    academicRepository.listCursosByIds.mockResolvedValueOnce([])
    academicRepository.listAsignacionesByProfesorIds.mockRejectedValueOnce(new Error('a'))
    const vacio = await teachersAnalyticsService.getPeriodStats('u1', undefined)
    expect(vacio.totalEvaluaciones).toBe(0)
    expect(vacio.period).toBe('all')

    teachersRepository.findByUsuarioId.mockResolvedValueOnce({ id: 'p1' })
    analyticsRepository.getCompletedInPeriod.mockResolvedValueOnce([
      { id: 1, calificacion_promedio: 4, grupo_id: 10 },
      { id: 2, calificacion_promedio: 5, grupo_id: 10 },
    ])
    analyticsRepository.getGruposByIds.mockResolvedValueOnce([{ id: 10, curso_id: 3 }])
    academicRepository.listCursosByIds.mockResolvedValueOnce([{ id: 3, nombre: 'Cálculo', codigo: 'MAT' }])
    academicRepository.listAsignacionesByProfesorIds.mockResolvedValueOnce([{ activa: true }])
    const ok = await teachersAnalyticsService.getPeriodStats('u1', '2026-1')
    expect(ok.calificacionPromedio).toBe(4.5)
    expect(ok.evaluacionesPorCurso[0]).toMatchObject({ nombre: 'Cálculo', total: 2, promedio: 4.5 })
    expect(ok.totalCursos).toBe(1)
  })

  it('getPeriodCategoryStats: error al listar preguntas → 500', async () => {
    teachersRepository.findByUsuarioId.mockResolvedValueOnce({ id: 'p1' })
    analyticsRepository.getCompletedInPeriod.mockResolvedValueOnce([{ id: 1, grupo_id: 10 }])
    analyticsRepository.listRespuestasByEvaluacionIds.mockResolvedValueOnce([{ pregunta_id: 1, respuesta_rating: 4 }])
    analyticsRepository.listPreguntasByIds.mockRejectedValueOnce(new Error('p'))
    await expect(
      teachersAnalyticsService.getPeriodCategoryStats('u1', '2026-1', null)
    ).rejects.toMatchObject({ status: 500 })
  })
})
