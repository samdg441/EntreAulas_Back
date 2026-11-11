import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Request, Response } from 'express'

vi.mock('../../../modules/evaluations/evaluations.service', () => ({
  evaluationsService: {
    createQuestion: vi.fn(),
    updateQuestion: vi.fn(),
    deactivateQuestion: vi.fn(),
    getQuestionsByCareer: vi.fn(),
    getAllActiveQuestions: vi.fn(),
    getQuestionsByCategoryAndCareer: vi.fn(),
    getEvaluationsByStudent: vi.fn(),
  },
}))

import { EvaluationsController } from '../../../modules/evaluations/evaluations.controller'
import { evaluationsService } from '../../../modules/evaluations/evaluations.service'

function respuesta() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code
      return this
    },
    json(payload: unknown) {
      this.body = payload
      return this
    },
  }
  return res as Response & { statusCode: number; body: unknown }
}

const cuerpoValido = {
  categoria_id: 1,
  texto_pregunta: '¿El docente explica con claridad?',
  tipo_pregunta: 'likert',
  orden: 2,
  obligatoria: true,
}

/**
 * RF-ENC-32 y RF-ENC-33 en la API. Dado / Cuando / Entonces y AAA.
 * El servicio es un doble: aquí se prueba el contrato HTTP.
 */
describe('RF-ENC — Contrato HTTP de las preguntas', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('RF-ENC-32: crea la pregunta y confirma con 201', async () => {
    // Dado que el cuerpo trae categoría, texto, tipo y orden
    // Arrange
    vi.mocked(evaluationsService.createQuestion).mockResolvedValue({ id: 8 })
    const req = { body: cuerpoValido } as Request
    const res = respuesta()

    // Cuando el administrador envía el alta
    // Act
    await EvaluationsController.createQuestion(req, res)

    // Entonces el sistema confirma la creación
    // Assert
    expect(res.statusCode).toBe(201)
    expect(res.body).toMatchObject({
      success: true,
      message: 'Pregunta creada exitosamente',
      data: { id: 8 },
    })
    expect(evaluationsService.createQuestion).toHaveBeenCalledWith(
      expect.objectContaining({ texto_pregunta: cuerpoValido.texto_pregunta, obligatoria: true })
    )
  })

  it('RF-ENC-32: rechaza el alta si faltan los campos de la pregunta', async () => {
    // Dado que el cuerpo no trae el texto
    // Arrange
    const req = { body: { categoria_id: 1, tipo_pregunta: 'likert', orden: 1 } } as Request
    const res = respuesta()

    // Cuando intenta crear la pregunta
    // Act
    await EvaluationsController.createQuestion(req, res)

    // Entonces no la guarda y explica qué falta
    // Assert
    expect(evaluationsService.createQuestion).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(400)
    expect(res.body).toMatchObject({ success: false, error: 'Datos incompletos' })
  })

  it('RF-ENC-32: si el servicio falla, no confirma el alta', async () => {
    // Dado que el servicio no puede guardar
    // Arrange
    vi.mocked(evaluationsService.createQuestion).mockRejectedValue(new Error('db'))
    const req = { body: cuerpoValido } as Request
    const res = respuesta()

    // Cuando envía el alta
    // Act
    await EvaluationsController.createQuestion(req, res)

    // Entonces responde error interno
    // Assert
    expect(res.statusCode).toBe(500)
    expect(res.body).toMatchObject({
      success: false,
      message: 'No se pudo crear la pregunta de evaluación',
    })
  })

  it('RF-ENC-33: actualiza la pregunta indicada', async () => {
    // Dado que existe la pregunta 8
    // Arrange
    vi.mocked(evaluationsService.updateQuestion).mockResolvedValue({ id: 8, texto_pregunta: 'nuevo' })
    const req = { params: { id: '8' }, body: { texto_pregunta: 'nuevo' } } as unknown as Request
    const res = respuesta()

    // Cuando el coordinador corrige el texto
    // Act
    await EvaluationsController.updateQuestion(req, res)

    // Entonces el sistema confirma la corrección
    // Assert
    expect(evaluationsService.updateQuestion).toHaveBeenCalledWith(8, { texto_pregunta: 'nuevo' })
    expect(res.statusCode).toBe(200)
    expect(res.body).toMatchObject({ success: true, message: 'Pregunta actualizada exitosamente' })
  })

  it('RF-ENC-33: no actualiza si no llega el identificador', async () => {
    // Dado que la ruta no trae id
    // Arrange
    const req = { params: {}, body: { texto_pregunta: 'nuevo' } } as unknown as Request
    const res = respuesta()

    // Cuando intenta corregir
    // Act
    await EvaluationsController.updateQuestion(req, res)

    // Entonces pide el identificador y no llama al servicio
    // Assert
    expect(evaluationsService.updateQuestion).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(400)
    expect(res.body).toMatchObject({ success: false, error: 'ID requerido' })
  })

  it('RF-ENC-33: desactiva la pregunta y lo confirma', async () => {
    // Dado que la pregunta 8 está activa
    // Arrange
    vi.mocked(evaluationsService.deactivateQuestion).mockResolvedValue(true)
    const req = { params: { id: '8' } } as unknown as Request
    const res = respuesta()

    // Cuando el administrador la retira
    // Act
    await EvaluationsController.deactivateQuestion(req, res)

    // Entonces confirma que dejó de ofrecerse
    // Assert
    expect(evaluationsService.deactivateQuestion).toHaveBeenCalledWith(8)
    expect(res.body).toMatchObject({ success: true, message: 'Pregunta desactivada exitosamente' })
  })

  it('RF-ENC-33: si el retiro no se aplica, no confirma la desactivación', async () => {
    // Dado que el servicio no logra desactivar
    // Arrange
    vi.mocked(evaluationsService.deactivateQuestion).mockResolvedValue(false)
    const req = { params: { id: '8' } } as unknown as Request
    const res = respuesta()

    // Cuando intenta retirarla
    // Act
    await EvaluationsController.deactivateQuestion(req, res)

    // Entonces informa el fallo
    // Assert
    expect(res.statusCode).toBe(500)
    expect(res.body).toMatchObject({ success: false, error: 'Error interno del servidor' })
  })

  it('lista las preguntas y las evaluaciones del estudiante', async () => {
    // Dado que el servicio tiene preguntas y evaluaciones
    // Arrange
    vi.mocked(evaluationsService.getQuestionsByCareer).mockResolvedValue([])
    vi.mocked(evaluationsService.getAllActiveQuestions).mockResolvedValue([{ id: 1 }])
    vi.mocked(evaluationsService.getQuestionsByCategoryAndCareer).mockResolvedValue([])
    vi.mocked(evaluationsService.getEvaluationsByStudent).mockResolvedValue([{ id: 3 }])

    // Cuando se consultan
    // Act
    const porCarrera = respuesta()
    await EvaluationsController.getQuestionsByCareer({ params: { carreraId: '4' } } as unknown as Request, porCarrera)
    const todas = respuesta()
    await EvaluationsController.getAllQuestions({} as Request, todas)
    const porCategoria = respuesta()
    await EvaluationsController.getQuestionsByCategoryAndCareer(
      { params: { categoriaId: '1', carreraId: '4' } } as unknown as Request,
      porCategoria
    )
    const simples = respuesta()
    await EvaluationsController.listQuestionsSimple({} as Request, simples)
    const delEstudiante = respuesta()
    await EvaluationsController.listStudentEvaluations({ user: { id: 'est-1' } } as Request, delEstudiante)

    // Entonces cada consulta responde lo que devolvió el servicio
    // Assert
    expect(porCarrera.body).toMatchObject({ success: true, data: [] })
    expect(todas.body).toMatchObject({ success: true })
    expect(porCategoria.body).toMatchObject({ success: true, data: [] })
    expect(simples.body).toEqual([{ id: 1 }])
    expect(delEstudiante.body).toEqual([{ id: 3 }])
  })

  it('explica el fallo al consultar preguntas o al faltar la categoría', async () => {
    // Dado que el servicio falla y que falta la categoría
    // Arrange
    vi.mocked(evaluationsService.getQuestionsByCareer).mockRejectedValue(new Error('db'))
    vi.mocked(evaluationsService.getAllActiveQuestions).mockRejectedValue(new Error('db'))
    vi.mocked(evaluationsService.getQuestionsByCategoryAndCareer).mockRejectedValue(new Error('db'))
    vi.mocked(evaluationsService.getEvaluationsByStudent).mockRejectedValue(new Error('db'))
    const porCarrera = respuesta()
    const todas = respuesta()
    const sinCategoria = respuesta()
    const porCategoria = respuesta()
    const simples = respuesta()
    const delEstudiante = respuesta()

    // Cuando se consulta
    // Act
    await EvaluationsController.getQuestionsByCareer({ params: {} } as unknown as Request, porCarrera)
    await EvaluationsController.getAllQuestions({} as Request, todas)
    await EvaluationsController.getQuestionsByCategoryAndCareer(
      { params: {} } as unknown as Request,
      sinCategoria
    )
    await EvaluationsController.getQuestionsByCategoryAndCareer(
      { params: { categoriaId: '1' } } as unknown as Request,
      porCategoria
    )
    await EvaluationsController.listQuestionsSimple({} as Request, simples)
    await EvaluationsController.listStudentEvaluations({ user: { id: 'est-1' } } as Request, delEstudiante)

    // Entonces no confirma la consulta
    // Assert
    expect(porCarrera.statusCode).toBe(500)
    expect(todas.statusCode).toBe(500)
    expect(sinCategoria.statusCode).toBe(400)
    expect(porCategoria.statusCode).toBe(500)
    expect(simples.statusCode).toBe(500)
    expect(delEstudiante.statusCode).toBe(500)
  })

  it('RF-ENC-33: no desactiva si no llega el identificador', async () => {
    // Dado que la ruta no trae id
    // Arrange
    const req = { params: {} } as unknown as Request
    const res = respuesta()

    // Cuando intenta retirar
    // Act
    await EvaluationsController.deactivateQuestion(req, res)

    // Entonces pide el identificador
    // Assert
    expect(evaluationsService.deactivateQuestion).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(400)
    expect(res.body).toMatchObject({ success: false, error: 'ID requerido' })
  })
})
