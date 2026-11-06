import { describe, it } from 'vitest'
import { expect } from 'chai'
import { AppError } from '../../../shared/errors'
import { AiService } from '../../../modules/ai-summary/ai.service'
import {
  assertProfessorSelfAccess,
  extractValidOpenTexts,
  requireQueryProfesorId,
} from '../../../modules/ai-summary/ai.routes'

/**
 * RF-IA-32 — Resúmenes agregados (caja blanca).
 * FIRST: sin Gemini ni Supabase. Las decisiones se prueban en las funciones de la ruta.
 * AAA en cada caso.
 */

describe('RF-IA-32 — Resúmenes agregados', () => {
  it('C1: un comentario de menos de 3 caracteres no entra; uno válido sí', () => {
    // Arrange
    const respuestas = [
      { respuesta_texto: 'ab' },
      { respuesta_texto: '  Explica con claridad  ' },
      { respuesta_texto: null },
    ]

    // Act
    const textos = extractValidOpenTexts(respuestas)

    // Assert
    expect(textos).to.deep.equal(['Explica con claridad'])
  })

  it('C2: sin textos y con notas de 1 a 5 el resumen sale de las notas', () => {
    // Arrange
    const notas = [5, 4, 3]

    // Act
    const resumen = AiService.summarizeFromRatings(notas, 'profesor')

    // Assert
    expect(resumen.analysisSource).to.equal('quantitative_fallback')
    expect(resumen.summary).to.include('3 respuestas cuantitativas')
    expect(resumen.summary).to.include('4.00/5')
    expect(resumen.topics).to.include('sin respuestas abiertas')
  })

  it('C3: sin textos ni notas válidas no hay resumen cuantitativo', () => {
    // Arrange
    const notas = [99, 0]

    // Act
    const resumen = AiService.summarizeFromRatings(notas, 'coordinador')

    // Assert
    expect(resumen.analysisSource).to.equal('quantitative_fallback')
    expect(resumen.summary).to.equal('No hay respuestas cuantitativas válidas para generar un resumen.')
    expect(resumen.topics).to.deep.equal([])
  })

  it('C4: un profesor no puede pedir el id de otro docente', () => {
    // Arrange
    const profesor = { tipo_usuario: 'profesor', id: 'prof-1' }

    // Act
    const pedirOtro = () => assertProfessorSelfAccess(profesor, 'prof-2')
    const pedirElSuyo = () => assertProfessorSelfAccess(profesor, 'prof-1')

    // Assert
    expect(pedirOtro).to.throw(AppError, 'No autorizado')
    try {
      pedirOtro()
    } catch (error) {
      expect(error).to.be.instanceOf(AppError)
      expect((error as AppError).status).to.equal(403)
    }
    expect(pedirElSuyo).to.not.throw()
  })

  it('C5: coordinador y decano pueden pedir el resumen de un profesor', () => {
    // Arrange
    const coordinador = { tipo_usuario: 'coordinador', id: 'coord-1' }
    const decano = { tipo_usuario: 'decano', id: 'dec-1' }

    // Act
    const comoCoordinador = () => assertProfessorSelfAccess(coordinador, 'prof-2')
    const comoDecano = () => assertProfessorSelfAccess(decano, 'prof-2')

    // Assert
    expect(comoCoordinador).to.not.throw()
    expect(comoDecano).to.not.throw()
  })

  it('C6: sin profesor_id la consulta se rechaza', () => {
    // Arrange
    const pedir = () => requireQueryProfesorId(undefined)

    // Act
    // Assert
    expect(pedir).to.throw(AppError, 'profesor_id es requerido')
    try {
      pedir()
    } catch (error) {
      expect((error as AppError).status).to.equal(400)
    }
  })
})
