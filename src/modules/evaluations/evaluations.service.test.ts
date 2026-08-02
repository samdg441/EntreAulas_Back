import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EvaluationsService } from './evaluations.service'
import type { EvaluationsRepository } from './evaluations.repository'
import type { PreguntaEvaluacion } from './evaluations.types'

function mockRepo(partial: Partial<EvaluationsRepository>): EvaluationsRepository {
  return partial as EvaluationsRepository
}

describe('EvaluationsService', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('getQuestionsByCareer delega en el repositorio', async () => {
    const questions = [{ id: 1, texto_pregunta: '¿Claridad?' }] as PreguntaEvaluacion[]
    const repo = mockRepo({
      getQuestionsByCareer: vi.fn().mockResolvedValue(questions),
    })
    const service = new EvaluationsService(repo)

    const result = await service.getQuestionsByCareer(10)

    expect(repo.getQuestionsByCareer).toHaveBeenCalledWith(10)
    expect(result).toEqual(questions)
  })

  it('computeRatingStatistics calcula promedio y extremos', () => {
    const service = new EvaluationsService(mockRepo({}))
    const stats = service.computeRatingStatistics([
      { calificacion_promedio: 4, fecha_completada: '2026-01-15T00:00:00.000Z' },
      { calificacion_promedio: 2, fecha_completada: '2026-01-20T00:00:00.000Z' },
      { calificacion_promedio: 5, fecha_completada: '2026-02-01T00:00:00.000Z' },
    ])

    expect(stats.total_evaluaciones).toBe(3)
    expect(stats.calificacion_promedio).toBeCloseTo(11 / 3)
    expect(stats.calificacion_minima).toBe(2)
    expect(stats.calificacion_maxima).toBe(5)
    expect(stats.evaluaciones_por_mes['2026-01']).toBe(2)
    expect(stats.evaluaciones_por_mes['2026-02']).toBe(1)
  })

  it('deactivateQuestion retorna false si el repo falla', async () => {
    const repo = mockRepo({
      deactivateQuestion: vi.fn().mockRejectedValue(new Error('db down')),
    })
    const service = new EvaluationsService(repo)
    const ok = await service.deactivateQuestion(99)
    expect(ok).toBe(false)
  })
})
