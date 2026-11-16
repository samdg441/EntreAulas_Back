import { Request, Response } from 'express'
import { evaluationsService } from './evaluations.service'
import { AppError, badRequest, sendError } from '../../shared/errors'
import type { PreguntaEvaluacion } from './evaluations.types'

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

/**
 * DEF-49 y SEC-07: el id de la ruta debe ser un entero positivo escrito solo con dígitos.
 * `Number()` aceptaba «0x8» (8) y «1e1» (10) y corregía otra pregunta; si no cumple, ni se consulta la base.
 */
function idDePregunta(valor: string | undefined): number {
  if (!valor) throw badRequest('ID requerido', 'Se requiere el ID de la pregunta')
  const id = Number(valor)
  if (!/^\d+$/.test(valor) || !Number.isSafeInteger(id) || id < 1) {
    throw badRequest('ID inválido', 'La pregunta no es válida.')
  }
  return id
}

const CAMPOS_EDITABLES = [
  'categoria_id',
  'texto_pregunta',
  'descripcion',
  'tipo_pregunta',
  'opciones',
  'obligatoria',
  'orden',
  'id_carrera',
] as const

/**
 * DEF-48 y SEC-17: el texto debe ser una cadena con contenido.
 * Antes `String(valor)` guardaba «[object Object]», «uno,dos» o «42» si llegaba otro tipo.
 */
function textoDePregunta(valor: unknown): string {
  const texto = typeof valor === 'string' ? valor.trim() : ''
  if (!texto) throw badRequest('Datos inválidos', 'El texto de la pregunta es obligatorio.')
  return texto
}

/**
 * DEF-48 y DEF-50: corrige solo los campos editables y rechaza un texto en blanco o un orden inválido.
 * `id`, `activa` y las fechas no se pueden cambiar por esta ruta.
 */
function cambiosDePregunta(body: Record<string, unknown>): Partial<PreguntaEvaluacion> {
  const cambios: Record<string, unknown> = {}
  for (const campo of CAMPOS_EDITABLES) {
    if (body?.[campo] !== undefined) cambios[campo] = body[campo]
  }
  if ('texto_pregunta' in cambios) cambios.texto_pregunta = textoDePregunta(cambios.texto_pregunta)
  if ('orden' in cambios) {
    const orden = Number(cambios.orden)
    if (!Number.isInteger(orden) || orden < 1) {
      throw badRequest('Datos inválidos', 'El orden debe ser un entero mayor que cero.')
    }
    cambios.orden = orden
  }
  return cambios as Partial<PreguntaEvaluacion>
}

export class EvaluationsController {
  static async getQuestionsByCareer(req: Request, res: Response) {
    try {
      const { carreraId } = req.params
      const carreraIdNumber = carreraId ? Number.parseInt(carreraId) : undefined
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
        texto_pregunta: textoDePregunta(texto_pregunta),
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
      const id = idDePregunta(req.params.id)
      const updatedQuestion = await evaluationsService.updateQuestion(id, cambiosDePregunta(req.body))
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
      const success = await evaluationsService.deactivateQuestion(idDePregunta(req.params.id))
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
      const carreraIdNumber = carreraId ? Number.parseInt(carreraId) : undefined

      if (!categoriaId) {
        throw badRequest('ID de categoría requerido', 'Se requiere el ID de la categoría')
      }

      const questions = await evaluationsService.getQuestionsByCategoryAndCareer(
        Number.parseInt(categoriaId),
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
