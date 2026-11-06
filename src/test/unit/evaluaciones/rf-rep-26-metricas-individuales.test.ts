import { beforeEach, describe, it, vi } from 'vitest'
import { expect } from 'chai'
import { EvaluationsService } from '../../../modules/evaluations/evaluations.service'
import type { EvaluationsRepository } from '../../../modules/evaluations/evaluations.repository'

/**
 * RF-REP-26 — Cálculo de métricas individuales (caja blanca).
 * FIRST: cada caso arma sus datos, no toca red ni base, y se valida solo.
 * AAA en cada caso. El repositorio es un mock: el cálculo no depende de Supabase.
 *
 * La corrección: una nota fuera de 1 a 5 (por ejemplo 99) no entra al total,
 * al promedio, a la mínima, a la máxima ni al conteo por mes.
 */

function repositorio(partial: Partial<EvaluationsRepository>): EvaluationsRepository {
  return partial as EvaluationsRepository
}

describe('RF-REP-26 — Métricas individuales', () => {
  let servicio: EvaluationsService

  beforeEach(() => {
    servicio = new EvaluationsService(repositorio({}))
  })

  it('C1: notas 5, 4 y 3 dan total 3, promedio 4, mínima 3 y máxima 5', () => {
    // Arrange
    const evaluaciones = [
      { calificacion_promedio: 5, fecha_completada: '2026-03-01T00:00:00.000Z' },
      { calificacion_promedio: 4, fecha_completada: '2026-03-10T00:00:00.000Z' },
      { calificacion_promedio: '3', fecha_completada: '2026-03-20T00:00:00.000Z' },
    ]

    // Act
    const stats = servicio.computeRatingStatistics(evaluaciones)

    // Assert
    expect(stats.total_evaluaciones).to.equal(3)
    expect(stats.calificacion_promedio).to.equal(4)
    expect(stats.calificacion_minima).to.equal(3)
    expect(stats.calificacion_maxima).to.equal(5)
    expect(stats.evaluaciones_por_mes).to.deep.equal({ '2026-03': 3 })
  })

  it('C2: sin evaluaciones devuelve ceros y el conteo por mes vacío', () => {
    // Arrange
    const vacio: Array<{ calificacion_promedio: number; fecha_completada: string }> = []

    // Act
    const stats = servicio.computeRatingStatistics(vacio)

    // Assert
    expect(stats).to.deep.equal({
      total_evaluaciones: 0,
      calificacion_promedio: 0,
      calificacion_minima: 0,
      calificacion_maxima: 0,
      evaluaciones_por_mes: {},
    })
  })

  it('C3: la nota 99 no entra; 5 y 4 promedian 4.5', () => {
    // Arrange
    const evaluaciones = [
      { calificacion_promedio: 5, fecha_completada: '2026-03-01T00:00:00.000Z' },
      { calificacion_promedio: 4, fecha_completada: '2026-03-15T00:00:00.000Z' },
      { calificacion_promedio: 99, fecha_completada: '2026-04-01T00:00:00.000Z' },
    ]

    // Act
    const stats = servicio.computeRatingStatistics(evaluaciones)

    // Assert
    expect(stats.total_evaluaciones).to.equal(2)
    expect(stats.calificacion_promedio).to.equal(4.5)
    expect(stats.calificacion_minima).to.equal(4)
    expect(stats.calificacion_maxima).to.equal(5)
    expect(stats.evaluaciones_por_mes).to.deep.equal({ '2026-03': 2 })
    expect(stats.evaluaciones_por_mes).to.not.have.property('2026-04')
  })

  it('C5: una fecha ilegible no rompe el cálculo y no entra a un mes', () => {
    // Arrange
    const evaluaciones = [
      { calificacion_promedio: 5, fecha_completada: 'no-es-fecha' },
    ]

    // Act
    const stats = servicio.computeRatingStatistics(evaluaciones)
    const nulo = servicio.computeRatingStatistics(undefined as never)

    // Assert
    expect(stats.total_evaluaciones).to.equal(1)
    expect(stats.calificacion_promedio).to.equal(5)
    expect(stats.evaluaciones_por_mes).to.deep.equal({})
    expect(nulo.total_evaluaciones).to.equal(0)
  })

  it('C4: getRatingStatistics calcula con lo que devuelve el repositorio', async () => {
    // Arrange
    const getEvaluationRatings = vi.fn().mockResolvedValue([
      { calificacion_promedio: 5, fecha_completada: '2026-03-01T00:00:00.000Z' },
      { calificacion_promedio: 3, fecha_completada: '2026-03-02T00:00:00.000Z' },
    ])
    const conRepo = new EvaluationsService(repositorio({ getEvaluationRatings }))
    const filtros = { profesor_id: 'prof-1', periodo_id: 8 }

    // Act
    const stats = await conRepo.getRatingStatistics(filtros)

    // Assert
    expect(getEvaluationRatings.mock.calls).to.deep.equal([[filtros]])
    expect(stats.total_evaluaciones).to.equal(2)
    expect(stats.calificacion_promedio).to.equal(4)
    expect(stats.calificacion_minima).to.equal(3)
    expect(stats.calificacion_maxima).to.equal(5)
  })
})
