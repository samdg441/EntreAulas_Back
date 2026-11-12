import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EvaluationsService } from '../../../modules/evaluations/evaluations.service'
import type { EvaluationsRepository } from '../../../modules/evaluations/evaluations.repository'
import type { PreguntaEvaluacion } from '../../../modules/evaluations/evaluations.types'

function repositorio(parcial: Partial<EvaluationsRepository>): EvaluationsRepository {
  return parcial as EvaluationsRepository
}

const pregunta: PreguntaEvaluacion = {
  id: 8,
  categoria_id: 1,
  texto_pregunta: '¿El docente explica con claridad?',
  tipo_pregunta: 'likert',
  obligatoria: true,
  orden: 2,
  activa: true,
  categoria: { id: 1, nombre: 'Docencia', orden: 1 },
}

/**
 * RF-ENC-32 y RF-ENC-33. Cada caso sigue Dado / Cuando / Entonces
 * y el arreglo AAA: Arrange, Act, Assert.
 */
describe('RF-ENC — Crear y retirar preguntas de la encuesta', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('RF-ENC-32: guarda la pregunta activa y, si no se dice, no obligatoria', async () => {
    // Dado que un administrador arma el instrumento
    // Arrange
    const repo = repositorio({
      createQuestion: vi.fn().mockResolvedValue(pregunta),
    })
    const servicio = new EvaluationsService(repo)
    const entrada = {
      categoria_id: 1,
      texto_pregunta: '¿El docente explica con claridad?',
      tipo_pregunta: 'likert',
      orden: 2,
    }

    // Cuando registra la pregunta
    // Act
    const creada = await servicio.createQuestion(entrada)

    // Entonces el sistema la guarda activa
    // Assert
    expect(repo.createQuestion).toHaveBeenCalledWith({ ...entrada, obligatoria: false, activa: true })
    expect(creada).toEqual(pregunta)
  })

  it('RF-ENC-32: conserva la pregunta como obligatoria cuando así se pide', async () => {
    // Dado que la pregunta debe responderse
    // Arrange
    const repo = repositorio({
      createQuestion: vi.fn().mockResolvedValue({ ...pregunta, obligatoria: true }),
    })
    const servicio = new EvaluationsService(repo)

    // Cuando la registra como obligatoria
    // Act
    await servicio.createQuestion({
      categoria_id: 1,
      texto_pregunta: '¿El docente explica con claridad?',
      tipo_pregunta: 'likert',
      orden: 2,
      obligatoria: true,
    })

    // Entonces el sistema no la deja opcional
    // Assert
    expect(repo.createQuestion).toHaveBeenCalledWith(
      expect.objectContaining({ obligatoria: true, activa: true })
    )
  })

  it('RF-ENC-32: si el almacén falla, no confirma la creación', async () => {
    // Dado que el almacén rechaza el alta
    // Arrange
    const servicio = new EvaluationsService(
      repositorio({ createQuestion: vi.fn().mockRejectedValue(new Error('db')) })
    )

    // Cuando intenta registrar la pregunta
    // Act
    const promesa = servicio.createQuestion({
      categoria_id: 1,
      texto_pregunta: '¿Claridad?',
      tipo_pregunta: 'likert',
      orden: 1,
    })

    // Entonces informa que no pudo crearla
    // Assert
    await expect(promesa).rejects.toThrow('Error al crear pregunta de evaluación')
  })

  it('RF-ENC-33: aplica la corrección sobre la pregunta indicada', async () => {
    // Dado que la pregunta 8 ya forma parte de la encuesta
    // Arrange
    const corregida = { ...pregunta, texto_pregunta: '¿Explica con ejemplos?' }
    const repo = repositorio({
      updateQuestion: vi.fn().mockResolvedValue(corregida),
    })
    const servicio = new EvaluationsService(repo)

    // Cuando el coordinador corrige el texto
    // Act
    const resultado = await servicio.updateQuestion(8, { texto_pregunta: '¿Explica con ejemplos?' })

    // Entonces el sistema guarda ese texto
    // Assert
    expect(repo.updateQuestion).toHaveBeenCalledWith(8, { texto_pregunta: '¿Explica con ejemplos?' })
    expect(resultado.texto_pregunta).toBe('¿Explica con ejemplos?')
  })

  it('RF-ENC-33: si el almacén falla, no confirma la corrección', async () => {
    // Dado que el almacén rechaza el cambio
    // Arrange
    const servicio = new EvaluationsService(
      repositorio({ updateQuestion: vi.fn().mockRejectedValue(new Error('db')) })
    )

    // Cuando intenta corregir la pregunta
    // Act
    const promesa = servicio.updateQuestion(8, { texto_pregunta: 'otro texto' })

    // Entonces informa que no pudo actualizarla
    // Assert
    await expect(promesa).rejects.toThrow('Error al actualizar pregunta de evaluación')
  })

  it('RF-ENC-33: desactiva la pregunta para que deje de ofrecerse', async () => {
    // Dado que la pregunta 8 está activa
    // Arrange
    const repo = repositorio({
      deactivateQuestion: vi.fn().mockResolvedValue(true),
    })
    const servicio = new EvaluationsService(repo)

    // Cuando el administrador la retira
    // Act
    const ok = await servicio.deactivateQuestion(8)

    // Entonces el sistema confirma el retiro
    // Assert
    expect(repo.deactivateQuestion).toHaveBeenCalledWith(8)
    expect(ok).toBe(true)
  })

  it('consulta las preguntas y traduce el fallo del almacén', async () => {
    // Dado que el almacén responde o falla según la consulta
    // Arrange
    const ok = new EvaluationsService(
      repositorio({
        getQuestionsByCareer: vi.fn().mockResolvedValue([pregunta]),
        getQuestionsWithCategories: vi.fn().mockResolvedValue([pregunta]),
        getBasicQuestions: vi.fn().mockResolvedValue([{ id: 1 }]),
        getQuestionsByCategoryAndCareer: vi.fn().mockResolvedValue([pregunta]),
        getEvaluationsByStudent: vi.fn().mockResolvedValue([]),
        getCompletedEvaluations: vi.fn().mockResolvedValue([]),
        getEvaluationRatings: vi.fn().mockResolvedValue([
          { calificacion_promedio: 4, fecha_completada: '2026-01-15T00:00:00.000Z' },
        ]),
      })
    )
    const falla = new EvaluationsService(
      repositorio({
        getQuestionsByCareer: vi.fn().mockRejectedValue(new Error('db')),
        getQuestionsWithCategories: vi.fn().mockRejectedValue(new Error('db')),
        getBasicQuestions: vi.fn().mockRejectedValue(new Error('db')),
        getQuestionsByCategoryAndCareer: vi.fn().mockRejectedValue(new Error('db')),
      })
    )

    // Cuando se consultan las preguntas
    // Act
    const porCarrera = await ok.getQuestionsByCareer(4)
    const activas = await ok.getAllActiveQuestions()
    const basicas = await ok.getBasicQuestions()
    const porCategoria = await ok.getQuestionsByCategoryAndCareer(1, 4)
    const delEstudiante = await ok.getEvaluationsByStudent('est-1')
    const completadas = await ok.getCompletedResults({})
    const estadisticas = await ok.getRatingStatistics({})

    // Entonces devuelve lo guardado y, si el almacén falla, un error de preguntas
    // Assert
    expect(porCarrera).toEqual([pregunta])
    expect(activas).toEqual([pregunta])
    expect(basicas).toEqual([{ id: 1 }])
    expect(porCategoria).toEqual([pregunta])
    expect(delEstudiante).toEqual([])
    expect(completadas).toEqual([])
    expect(estadisticas.total_evaluaciones).toBe(1)
    expect(estadisticas.calificacion_promedio).toBe(4)
    await expect(falla.getQuestionsByCareer(4)).rejects.toThrow('Error al obtener preguntas de evaluación')
    await expect(falla.getAllActiveQuestions()).rejects.toThrow('Error al obtener preguntas de evaluación')
    await expect(falla.getBasicQuestions()).rejects.toThrow('Error al obtener preguntas de evaluación')
    await expect(falla.getQuestionsByCategoryAndCareer(1)).rejects.toThrow('Error al obtener preguntas de evaluación')
  })

  it('RF-ENC-33: si el retiro falla, responde que no se pudo desactivar', async () => {
    // Dado que el almacén no puede desactivar
    // Arrange
    const servicio = new EvaluationsService(
      repositorio({ deactivateQuestion: vi.fn().mockRejectedValue(new Error('db')) })
    )

    // Cuando intenta retirar la pregunta 99
    // Act
    const ok = await servicio.deactivateQuestion(99)

    // Entonces no confirma el retiro
    // Assert
    expect(ok).toBe(false)
  })
})
