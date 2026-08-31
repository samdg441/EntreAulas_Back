import { describe, expect, it } from 'vitest'
import { calcularPromedio, calificacionEnEscala, esProfesor } from '../helpers/metricas'
import { NOTAS_COMUNES, NOTAS_INVALIDAS } from '../fixtures/casos-datos'

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
    expect(calcularPromedio([4, 5])).toBe(4.5)
    expect(calcularPromedio([NOTAS_COMUNES[0]])).toBe(1)
    expect(calcularPromedio([NOTAS_COMUNES[3]])).toBe(5)
  }

  C5_sinEvaluaciones() {
    expect(calcularPromedio([])).toBe(0)
  }

  C6_valoresInvalidosNoEntran() {
    for (const nota of NOTAS_INVALIDAS) {
      expect(calificacionEnEscala(nota)).toBeNull()
    }
    expect(calcularPromedio([-2, 0, 99, null])).toBe(0)
    expect(calcularPromedio([4, 99, -1])).toBe(4)
  }
}

const pruebas = new RQ22MetricasEvaluacion()

describe('RQ22 — Calcular métricas de evaluación', () => {
  it('C1: no es profesor', () => pruebas.C1_noEsProfesor())
  it('C1b: sí es profesor', () => pruebas.C1b_siEsProfesor())
  it('C4: promedio con valores comunes 1–5', () => pruebas.C4_calculaPromedio())
  it('C5: sin evaluaciones → 0', () => pruebas.C5_sinEvaluaciones())
  it('C6: negativos, 0, 99 y no numéricos no entran', () => pruebas.C6_valoresInvalidosNoEntran())
})
