import { AnalyticsRepository, analyticsRepository } from './analytics.repository'

export class AnalyticsService {
  constructor(private readonly repo: AnalyticsRepository = analyticsRepository) {}

  computeAverage(ratings: Array<number | string | null | undefined>): number {
    const valid = ratings
      .map((r) => Number(r))
      .filter((r) => Number.isFinite(r))
    if (valid.length === 0) return 0
    return valid.reduce((a, b) => a + b, 0) / valid.length
  }

  async getProfessorAverage(profesorId: string): Promise<{
    total: number
    promedio: number
  }> {
    const rows = await this.repo.getCompletedEvaluationsByProfessor(profesorId)
    const promedio = this.computeAverage(rows.map((r) => r.calificacion_promedio))
    return { total: rows.length, promedio }
  }
}

export const analyticsService = new AnalyticsService()
