import { Request, Response } from 'express';
import { EvaluationService } from '../services/evaluationService';

export class EvaluationController {
  /**
   * Obtener preguntas de evaluación por carrera
   */
  static async getQuestionsByCareer(req: Request, res: Response) {
    try {
      const { carreraId } = req.params;
      const carreraIdNumber = carreraId ? parseInt(carreraId) : undefined;

      const questions = await EvaluationService.getQuestionsByCareer(carreraIdNumber);

      res.json({
        success: true,
        data: questions,
        message: 'Preguntas obtenidas exitosamente'
      });
    } catch (error) {
      console.error('Error en getQuestionsByCareer:', error);
      res.status(500).json({
        success: false,
        error: 'Error interno del servidor',
        message: 'No se pudieron obtener las preguntas de evaluación'
      });
    }
  }

  /**
   * Obtener todas las preguntas de evaluación activas
   */
  static async getAllQuestions(req: Request, res: Response) {
    try {
      const questions = await EvaluationService.getAllActiveQuestions();

      res.json({
        success: true,
        data: questions,
        message: 'Preguntas obtenidas exitosamente'
      });
    } catch (error) {
      console.error('Error en getAllQuestions:', error);
      res.status(500).json({
        success: false,
        error: 'Error interno del servidor',
        message: 'No se pudieron obtener las preguntas de evaluación'
      });
    }
  }

  /**
   * Crear una nueva pregunta de evaluación
   */
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
        id_carrera
      } = req.body;

      // Validaciones básicas
      if (!categoria_id || !texto_pregunta || !tipo_pregunta || orden === undefined) {
        return res.status(400).json({
          success: false,
          error: 'Datos incompletos',
          message: 'Faltan campos requeridos: categoria_id, texto_pregunta, tipo_pregunta, orden'
        });
      }

      const newQuestion = await EvaluationService.createQuestion({
        categoria_id,
        texto_pregunta,
        descripcion,
        tipo_pregunta,
        opciones,
        obligatoria: obligatoria || false,
        orden,
        id_carrera
      });

      res.status(201).json({
        success: true,
        data: newQuestion,
        message: 'Pregunta creada exitosamente'
      });
    } catch (error) {
      console.error('Error en createQuestion:', error);
      res.status(500).json({
        success: false,
        error: 'Error interno del servidor',
        message: 'No se pudo crear la pregunta de evaluación'
      });
    }
  }

  /**
   * Actualizar una pregunta de evaluación
   */
  static async updateQuestion(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const updateData = req.body;

      if (!id) {
        return res.status(400).json({
          success: false,
          error: 'ID requerido',
          message: 'Se requiere el ID de la pregunta'
        });
      }

      const updatedQuestion = await EvaluationService.updateQuestion(parseInt(id), updateData);

      res.json({
        success: true,
        data: updatedQuestion,
        message: 'Pregunta actualizada exitosamente'
      });
    } catch (error) {
      console.error('Error en updateQuestion:', error);
      res.status(500).json({
        success: false,
        error: 'Error interno del servidor',
        message: 'No se pudo actualizar la pregunta de evaluación'
      });
    }
  }

  /**
   * Desactivar una pregunta de evaluación
   */
  static async deactivateQuestion(req: Request, res: Response) {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({
          success: false,
          error: 'ID requerido',
          message: 'Se requiere el ID de la pregunta'
        });
      }

      const success = await EvaluationService.deactivateQuestion(parseInt(id));

      if (success) {
        res.json({
          success: true,
          message: 'Pregunta desactivada exitosamente'
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Error interno del servidor',
          message: 'No se pudo desactivar la pregunta'
        });
      }
    } catch (error) {
      console.error('Error en deactivateQuestion:', error);
      res.status(500).json({
        success: false,
        error: 'Error interno del servidor',
        message: 'No se pudo desactivar la pregunta de evaluación'
      });
    }
  }

  /**
   * Obtener preguntas por categoría y carrera
   */
  static async getQuestionsByCategoryAndCareer(req: Request, res: Response) {
    try {
      const { categoriaId, carreraId } = req.params;
      const carreraIdNumber = carreraId ? parseInt(carreraId) : undefined;

      if (!categoriaId) {
        return res.status(400).json({
          success: false,
          error: 'ID de categoría requerido',
          message: 'Se requiere el ID de la categoría'
        });
      }

      const questions = await EvaluationService.getQuestionsByCategoryAndCareer(
        parseInt(categoriaId),
        carreraIdNumber
      );

      res.json({
        success: true,
        data: questions,
        message: 'Preguntas obtenidas exitosamente'
      });
    } catch (error) {
      console.error('Error en getQuestionsByCategoryAndCareer:', error);
      res.status(500).json({
        success: false,
        error: 'Error interno del servidor',
        message: 'No se pudieron obtener las preguntas de evaluación'
      });
    }
  }
}

export default EvaluationController;
