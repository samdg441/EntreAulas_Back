import { describe, it } from 'vitest'
import { expect } from 'chai'
import { AppError } from '../../shared/errors'
import { AiService } from '../../modules/ai-summary/ai.service'
import { assertProfessorSelfAccess, extractValidOpenTexts } from '../../modules/ai-summary/ai.routes'
import { estadisticasIndividuales, resumenMetricas, calcularPromedio } from '../../modules/analytics/calificaciones'
import { filtrosConsultaResultados } from '../../modules/evaluations/resultados-filtros'

/**
 * Regresión de RF-REP-25, RF-REP-26 y RF-IA-32 después de descartar la nota 99
 * y de dejar fuera un periodo o grupo que no es número.
 * Primero se conserva el camino que ya cumplía. Después se compara el resultado
 * nuevo con la línea base del defecto (promedio 36) y con el cálculo de RQ22,
 * que ya ignoraba el 99.
 */

const NOTAS_VALIDAS = [
  { calificacion_promedio: 5, fecha_completada: '2026-03-01T00:00:00.000Z' },
  { calificacion_promedio: 4, fecha_completada: '2026-03-10T00:00:00.000Z' },
  { calificacion_promedio: 3, fecha_completada: '2026-04-02T00:00:00.000Z' },
]
const NOTAS_CON_99 = [
  { calificacion_promedio: 5, fecha_completada: '2026-03-01T00:00:00.000Z' },
  { calificacion_promedio: 4, fecha_completada: '2026-03-10T00:00:00.000Z' },
  { calificacion_promedio: 99, fecha_completada: '2026-03-20T00:00:00.000Z' },
]

/** Lo que devolvía el cálculo antes de la corrección, con 5, 4 y 99. */
const DEFECTO = { total: 3, promedio: 36, minima: 4, maxima: 99 }

describe('RF-REP-25, RF-REP-26 y RF-IA-32 — Regresión después de la corrección', () => {
  it('RF-REP-26: 5, 4 y 3 siguen en total 3, promedio 4, mínima 3 y máxima 5', () => {
    const stats = estadisticasIndividuales(NOTAS_VALIDAS)

    expect(stats.total_evaluaciones).to.equal(3)
    expect(stats.calificacion_promedio).to.equal(4)
    expect(stats.calificacion_minima).to.equal(3)
    expect(stats.calificacion_maxima).to.equal(5)
    expect(stats.evaluaciones_por_mes).to.deep.equal({ '2026-03': 2, '2026-04': 1 })
  })

  it('Regresión RF-REP-26: 5, 4 y 99 ya no dan el promedio 36 y coinciden con RQ22', () => {
    const stats = estadisticasIndividuales(NOTAS_CON_99)
    const tarjeta = resumenMetricas(NOTAS_CON_99)

    expect(stats.calificacion_promedio).to.not.equal(DEFECTO.promedio)
    expect(stats.total_evaluaciones).to.not.equal(DEFECTO.total)
    expect(stats.calificacion_maxima).to.not.equal(DEFECTO.maxima)
    expect(stats.total_evaluaciones).to.equal(2)
    expect(stats.calificacion_promedio).to.equal(4.5)
    expect(stats.calificacion_minima).to.equal(4)
    expect(stats.calificacion_maxima).to.equal(5)
    expect(stats.calificacion_promedio).to.equal(tarjeta.calificacionPromedio)
    expect(stats.total_evaluaciones).to.equal(tarjeta.totalEvaluaciones)
    expect(calcularPromedio([4, 5, 99])).to.equal(calcularPromedio([4, 5]))
  })

  it('Regresión RF-REP-26: la lista vacía sigue en ceros y no copia las notas válidas', () => {
    const vacio = estadisticasIndividuales([])
    const valido = estadisticasIndividuales(NOTAS_VALIDAS)

    expect(vacio.total_evaluaciones).to.equal(0)
    expect(vacio.calificacion_promedio).to.equal(0)
    expect(vacio.calificacion_minima).to.equal(0)
    expect(vacio.calificacion_maxima).to.equal(0)
    expect(vacio.evaluaciones_por_mes).to.deep.equal({})
    expect(vacio.calificacion_promedio).to.not.equal(valido.calificacion_promedio)
  })

  it('RF-REP-25: el profesor sigue viendo solo su id', () => {
    const filtros = filtrosConsultaResultados(
      { tipo_usuario: 'profesor', id: '7' },
      { periodo_id: '8', grupo_id: '4' }
    )

    expect(filtros).to.deep.equal({ profesor_id: '7', periodo_id: 8, grupo_id: 4 })
  })

  it('Regresión RF-REP-25: un periodo que no es número ya no entra como NaN', () => {
    const filtros = filtrosConsultaResultados(
      { tipo_usuario: 'coordinador', id: '3' },
      { periodo_id: 'abc', grupo_id: '' }
    )

    expect(filtros).to.deep.equal({})
    expect(filtros).to.not.have.property('periodo_id')
    expect(filtros).to.not.have.property('profesor_id')
  })

  it('RF-IA-32: sin comentarios, las notas 5, 4 y 3 siguen armando el resumen cuantitativo', () => {
    const textos = extractValidOpenTexts([{ respuesta_texto: 'ab' }])
    const resumen = AiService.summarizeFromRatings([5, 4, 3], 'profesor')

    expect(textos).to.deep.equal([])
    expect(resumen.analysisSource).to.equal('quantitative_fallback')
    expect(resumen.summary).to.include('3 respuestas cuantitativas')
    expect(resumen.summary).to.include('4.00/5')
  })

  it('Regresión RF-IA-32: el profesor sigue sin poder pedir el id de otro', () => {
    const propio = { tipo_usuario: 'profesor', id: '7' }

    expect(() => assertProfessorSelfAccess(propio, '7')).to.not.throw()
    expect(() => assertProfessorSelfAccess(propio, '8'))
      .to.throw(AppError)
      .with.property('status', 403)
  })
})
