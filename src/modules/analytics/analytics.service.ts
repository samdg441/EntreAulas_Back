import { AnalyticsRepository, analyticsRepository } from './analytics.repository'
import { calcularPromedio } from './calificaciones'

export class AnalyticsService {
  constructor(private readonly repo: AnalyticsRepository = analyticsRepository) {}

  computeAverage(ratings: Array<number | string | null | undefined>): number {
    return calcularPromedio(ratings)
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
