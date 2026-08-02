import { describe, it, expect, vi } from 'vitest'
import { AnalyticsService } from './analytics.service'
import type { AnalyticsRepository } from './analytics.repository'

describe('AnalyticsService', () => {
  it('computeAverage ignora valores inválidos', () => {
    const service = new AnalyticsService({} as AnalyticsRepository)
    expect(service.computeAverage([4, 'x' as unknown as number, 2])).toBe(3)
    expect(service.computeAverage([])).toBe(0)
  })

  it('getProfessorAverage usa el repositorio', async () => {
    const repo = {
      getCompletedEvaluationsByProfessor: vi.fn().mockResolvedValue([
        { calificacion_promedio: 4 },
        { calificacion_promedio: 5 },
      ]),
    } as unknown as AnalyticsRepository
    const service = new AnalyticsService(repo)
    const result = await service.getProfessorAverage('p1')
    expect(result.total).toBe(2)
    expect(result.promedio).toBe(4.5)
  })
})
