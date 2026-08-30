import { describe, expect, it } from 'vitest'
import { calcularPromedio, esProfesor } from '../helpers/metricas'
import { AnalyticsService } from '../../modules/analytics/analytics.service'

class RQ22MetricasEvaluacion {
  C1_noEsProfesor() {
    expect(esProfesor('estudiante')).toBe(false)
    expect(esProfesor('coordinador')).toBe(false)
    expect(esProfesor('admin')).toBe(false)
  }

  C1b_siEsProfesor() {
    expect(esProfesor('profesor')).toBe(true)
  }

  C4_calculaPromedio() {
    const servicio = new AnalyticsService()
    expect(servicio.computeAverage([4, 5])).toBe(4.5)
    expect(calcularPromedio([4, 5])).toBe(4.5)
  }

  C5_sinEvaluaciones() {
    const servicio = new AnalyticsService()
    expect(servicio.computeAverage([])).toBe(0)
    expect(calcularPromedio([])).toBe(0)
  }

  FALLA_C1_estudianteEsProfesor() {
    expect(esProfesor('estudiante')).toBe(true)
  }

  FALLA_C4_promedioIncorrecto() {
    expect(calcularPromedio([4, 5])).toBe(9)
  }
}

const pruebas = new RQ22MetricasEvaluacion()

describe('RQ22 — Calcular métricas de evaluación', () => {
  it('C1: no es profesor', () => pruebas.C1_noEsProfesor())
  it('C1b: sí es profesor', () => pruebas.C1b_siEsProfesor())
  it('C4: calcula promedio', () => pruebas.C4_calculaPromedio())
  it('C5: sin evaluaciones → 0', () => pruebas.C5_sinEvaluaciones())
  it('FALLA C1: estudiante — se espera (mal) que sea profesor', () =>
    pruebas.FALLA_C1_estudianteEsProfesor())
  it('FALLA C4: promedio 4 y 5 — se espera (mal) 9', () => pruebas.FALLA_C4_promedioIncorrecto())
})
