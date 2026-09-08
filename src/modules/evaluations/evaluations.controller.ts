import { Request, Response } from 'express'
import { evaluationsService } from './evaluations.service'
import { AppError, badRequest, sendError } from '../../shared/errors'

function sendEnvelope(res: Response, error: unknown, fallbackMessage: string) {
  if (error instanceof AppError) {
    return res.status(error.status).json({
      success: false,
      error: error.message,
      message: typeof error.details === 'string' ? error.details : error.message,
    })
  }
  return res.status(500).json({
    success: false,
    error: 'Error interno del servidor',
    message: fallbackMessage,
  })
}

export class EvaluationsController {
  static async getQuestionsByCareer(req: Request, res: Response) {
    try {
      const { carreraId } = req.params
      const carreraIdNumber = carreraId ? parseInt(carreraId) : undefined
      const questions = await evaluationsService.getQuestionsByCareer(carreraIdNumber)

      res.json({
        success: true,
        data: questions,
        message: 'Preguntas obtenidas exitosamente',
      })
    } catch (error) {
      return sendEnvelope(res, error, 'No se pudieron obtener las preguntas de evaluación')
    }
  }

  static async getAllQuestions(_req: Request, res: Response) {
    try {
      const questions = await evaluationsService.getAllActiveQuestions()
      res.json({
        success: true,
        data: questions,
        message: 'Preguntas obtenidas exitosamente',
      })
    } catch (error) {
      return sendEnvelope(res, error, 'No se pudieron obtener las preguntas de evaluación')
    }
  }

  static async createQuestion(req: Request, res: Response) {
    try {
      const {
        categoria_id,
        texto_pregunta,
        descripcion,
        tipo_pregunta,
        opciones,
        obligatoria,
        orden,
        id_carrera,
      } = req.body

      if (!categoria_id || !texto_pregunta || !tipo_pregunta || orden === undefined) {
        throw badRequest(
          'Datos incompletos',
          'Faltan campos requeridos: categoria_id, texto_pregunta, tipo_pregunta, orden'
        )
      }

      const newQuestion = await evaluationsService.createQuestion({
        categoria_id,
        texto_pregunta,
        descripcion,
        tipo_pregunta,
        opciones,
        obligatoria: obligatoria || false,
        orden,
        id_carrera,
      })

      res.status(201).json({
        success: true,
        data: newQuestion,
        message: 'Pregunta creada exitosamente',
      })
    } catch (error) {
      return sendEnvelope(res, error, 'No se pudo crear la pregunta de evaluación')
    }
  }

  static async updateQuestion(req: Request, res: Response) {
    try {
      const { id } = req.params
      if (!id) {
        throw badRequest('ID requerido', 'Se requiere el ID de la pregunta')
      }

      const updatedQuestion = await evaluationsService.updateQuestion(
        parseInt(id),
        req.body
      )
      res.json({
        success: true,
        data: updatedQuestion,
        message: 'Pregunta actualizada exitosamente',
      })
    } catch (error) {
      return sendEnvelope(res, error, 'No se pudo actualizar la pregunta de evaluación')
    }
  }

  static async deactivateQuestion(req: Request, res: Response) {
    try {
      const { id } = req.params
      if (!id) {
        throw badRequest('ID requerido', 'Se requiere el ID de la pregunta')
      }

      const success = await evaluationsService.deactivateQuestion(parseInt(id))
      if (success) {
        res.json({ success: true, message: 'Pregunta desactivada exitosamente' })
      } else {
        throw new AppError(500, 'Error interno del servidor', 'No se pudo desactivar la pregunta')
      }
    } catch (error) {
      return sendEnvelope(res, error, 'No se pudo desactivar la pregunta de evaluación')
    }
  }

  static async getQuestionsByCategoryAndCareer(req: Request, res: Response) {
    try {
      const { categoriaId, carreraId } = req.params
      const carreraIdNumber = carreraId ? parseInt(carreraId) : undefined

      if (!categoriaId) {
        throw badRequest('ID de categoría requerido', 'Se requiere el ID de la categoría')
      }

      const questions = await evaluationsService.getQuestionsByCategoryAndCareer(
        parseInt(categoriaId),
        carreraIdNumber
      )

      res.json({
        success: true,
        data: questions,
        message: 'Preguntas obtenidas exitosamente',
      })
    } catch (error) {
      return sendEnvelope(res, error, 'No se pudieron obtener las preguntas de evaluación')
    }
  }

  static async listStudentEvaluations(req: any, res: Response) {
    try {
      const evaluaciones = await evaluationsService.getEvaluationsByStudent(req.user.id)
      res.json(evaluaciones)
    } catch (error) {
      return sendError(res, error)
    }
  }

  static async listQuestionsSimple(_req: Request, res: Response) {
    try {
      const preguntas = await evaluationsService.getAllActiveQuestions()
      res.json(preguntas)
    } catch (error) {
      return sendError(res, error)
    }
  }
}

/** Alias legacy */
export const EvaluationController = EvaluationsController
export default EvaluationsController
