import { Request, Response } from 'express'
import { evaluationsService } from './evaluations.service'

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
      console.error('Error en getQuestionsByCareer:', error)
      res.status(500).json({
        success: false,
        error: 'Error interno del servidor',
        message: 'No se pudieron obtener las preguntas de evaluación',
      })
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
      console.error('Error en getAllQuestions:', error)
      res.status(500).json({
        success: false,
        error: 'Error interno del servidor',
        message: 'No se pudieron obtener las preguntas de evaluación',
      })
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
        return res.status(400).json({
          success: false,
          error: 'Datos incompletos',
          message:
            'Faltan campos requeridos: categoria_id, texto_pregunta, tipo_pregunta, orden',
        })
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
      console.error('Error en createQuestion:', error)
      res.status(500).json({
        success: false,
        error: 'Error interno del servidor',
        message: 'No se pudo crear la pregunta de evaluación',
      })
    }
  }

  static async updateQuestion(req: Request, res: Response) {
    try {
      const { id } = req.params
      if (!id) {
        return res.status(400).json({
          success: false,
          error: 'ID requerido',
          message: 'Se requiere el ID de la pregunta',
        })
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
      console.error('Error en updateQuestion:', error)
      res.status(500).json({
        success: false,
        error: 'Error interno del servidor',
        message: 'No se pudo actualizar la pregunta de evaluación',
      })
    }
  }

  static async deactivateQuestion(req: Request, res: Response) {
    try {
      const { id } = req.params
      if (!id) {
        return res.status(400).json({
          success: false,
          error: 'ID requerido',
          message: 'Se requiere el ID de la pregunta',
        })
      }

      const success = await evaluationsService.deactivateQuestion(parseInt(id))
      if (success) {
        res.json({ success: true, message: 'Pregunta desactivada exitosamente' })
      } else {
        res.status(500).json({
          success: false,
          error: 'Error interno del servidor',
          message: 'No se pudo desactivar la pregunta',
        })
      }
    } catch (error) {
      console.error('Error en deactivateQuestion:', error)
      res.status(500).json({
        success: false,
        error: 'Error interno del servidor',
        message: 'No se pudo desactivar la pregunta de evaluación',
      })
    }
  }

  static async getQuestionsByCategoryAndCareer(req: Request, res: Response) {
    try {
      const { categoriaId, carreraId } = req.params
      const carreraIdNumber = carreraId ? parseInt(carreraId) : undefined

      if (!categoriaId) {
        return res.status(400).json({
          success: false,
          error: 'ID de categoría requerido',
          message: 'Se requiere el ID de la categoría',
        })
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
      console.error('Error en getQuestionsByCategoryAndCareer:', error)
      res.status(500).json({
        success: false,
        error: 'Error interno del servidor',
        message: 'No se pudieron obtener las preguntas de evaluación',
      })
    }
  }

  static async listStudentEvaluations(req: any, res: Response) {
    try {
      const evaluaciones = await evaluationsService.getEvaluationsByStudent(req.user.id)
      res.json(evaluaciones)
    } catch (error) {
      console.error('Error al obtener evaluaciones:', error)
      res.status(500).json({ error: 'Error interno del servidor' })
    }
  }

  static async listQuestionsSimple(_req: Request, res: Response) {
    try {
      const preguntas = await evaluationsService.getAllActiveQuestions()
      res.json(preguntas)
    } catch (error) {
      console.error('Error al obtener preguntas:', error)
      res.status(500).json({ error: 'Error interno del servidor' })
    }
  }
}

/** Alias legacy */
export const EvaluationController = EvaluationsController
export default EvaluationsController
