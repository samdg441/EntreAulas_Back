import {
  EvaluationsRepository,
  evaluationsRepository,
} from './evaluations.repository'
import type { CreateQuestionInput, PreguntaEvaluacion } from './evaluations.types'

export class EvaluationsService {
  constructor(private readonly repo: EvaluationsRepository = evaluationsRepository) {}

  async getQuestionsByCareer(carreraId?: number): Promise<PreguntaEvaluacion[]> {
    try {
      return await this.repo.getQuestionsByCareer(carreraId)
    } catch (error) {
      console.error('Error obteniendo preguntas por carrera:', error)
      throw new Error('Error al obtener preguntas de evaluación')
    }
  }

  async getAllActiveQuestions(): Promise<PreguntaEvaluacion[]> {
    try {
      return await this.repo.getQuestionsWithCategories()
    } catch (error) {
      console.error('Error obteniendo todas las preguntas:', error)
      throw new Error('Error al obtener preguntas de evaluación')
    }
  }

  async getBasicQuestions(): Promise<unknown[]> {
    try {
      return await this.repo.getBasicQuestions()
    } catch (error) {
      console.error('Error obteniendo preguntas básicas:', error)
      throw new Error('Error al obtener preguntas de evaluación')
    }
  }

  async createQuestion(preguntaData: CreateQuestionInput) {
    try {
      return await this.repo.createQuestion({
        ...preguntaData,
        obligatoria: preguntaData.obligatoria ?? false,
        activa: true,
      })
    } catch (error) {
      console.error('Error creando pregunta:', error)
      throw new Error('Error al crear pregunta de evaluación')
    }
  }

  async updateQuestion(preguntaId: number, updateData: Partial<PreguntaEvaluacion>) {
    try {
      return await this.repo.updateQuestion(preguntaId, updateData)
    } catch (error) {
      console.error('Error actualizando pregunta:', error)
      throw new Error('Error al actualizar pregunta de evaluación')
    }
  }

  async deactivateQuestion(preguntaId: number): Promise<boolean> {
    try {
      return await this.repo.deactivateQuestion(preguntaId)
    } catch (error) {
      console.error('Error desactivando pregunta:', error)
      return false
    }
  }

  async getQuestionsByCategoryAndCareer(
    categoriaId: number,
    carreraId?: number
  ): Promise<PreguntaEvaluacion[]> {
    try {
      return await this.repo.getQuestionsByCategoryAndCareer(categoriaId, carreraId)
    } catch (error) {
      console.error('Error obteniendo preguntas por categoría y carrera:', error)
      throw new Error('Error al obtener preguntas de evaluación')
    }
  }

  async getEvaluationsByStudent(studentId: string) {
    return this.repo.getEvaluationsByStudent(studentId)
  }

  async getCompletedResults(filters: Record<string, unknown>) {
    return this.repo.getCompletedEvaluations(filters)
  }

  computeRatingStatistics(
    evaluaciones: Array<{ calificacion_promedio: string | number; fecha_completada: string }>
  ) {
    const calificaciones =
      evaluaciones?.map((e) => parseFloat(String(e.calificacion_promedio))) || []

    return {
      total_evaluaciones: evaluaciones?.length || 0,
      calificacion_promedio:
        calificaciones.length > 0
          ? calificaciones.reduce((a, b) => a + b, 0) / calificaciones.length
          : 0,
      calificacion_minima: calificaciones.length > 0 ? Math.min(...calificaciones) : 0,
      calificacion_maxima: calificaciones.length > 0 ? Math.max(...calificaciones) : 0,
      evaluaciones_por_mes:
        evaluaciones?.reduce((acc: Record<string, number>, evaluacion) => {
          const mes = new Date(evaluacion.fecha_completada).toISOString().substring(0, 7)
          acc[mes] = (acc[mes] || 0) + 1
          return acc
        }, {}) || {},
    }
  }

  async getRatingStatistics(filters: Record<string, unknown>) {
    const evaluaciones = (await this.repo.getEvaluationRatings(filters)) || []
    return this.computeRatingStatistics(evaluaciones as Array<{
      calificacion_promedio: string | number
      fecha_completada: string
    }>)
  }
}

export const evaluationsService = new EvaluationsService()

/** Compatibilidad con imports estáticos legacy */
export class EvaluationService {
  static getQuestionsByCareer(carreraId?: number) {
    return evaluationsService.getQuestionsByCareer(carreraId)
  }
  static getAllActiveQuestions() {
    return evaluationsService.getAllActiveQuestions()
  }
  static getBasicQuestions() {
    return evaluationsService.getBasicQuestions()
  }
  static createQuestion(data: CreateQuestionInput) {
    return evaluationsService.createQuestion(data)
  }
  static updateQuestion(id: number, data: Partial<PreguntaEvaluacion>) {
    return evaluationsService.updateQuestion(id, data)
  }
  static deactivateQuestion(id: number) {
    return evaluationsService.deactivateQuestion(id)
  }
  static getQuestionsByCategoryAndCareer(categoriaId: number, carreraId?: number) {
    return evaluationsService.getQuestionsByCategoryAndCareer(categoriaId, carreraId)
  }
}

export default EvaluationService
export type { PreguntaEvaluacion }
