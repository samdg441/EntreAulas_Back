import { describe, expect, it } from 'vitest'
import { rangoFechasPeriodo, resumenHistorico } from '../helpers/metricas'

class RQ23EstadisticasHistoricas {
  C3_promedioDelPeriodo() {
    const r = resumenHistorico(
      [
        { calificacion_promedio: 4, fecha_creacion: '2026-03-01' },
        { calificacion_promedio: 5, fecha_creacion: '2026-03-02' },
      ],
      '2026-1'
    )
    expect(r.period).toBe('2026-1')
    expect(r.calificacionPromedio).toBe(4.5)
    expect(r.totalEvaluaciones).toBe(2)
  }

  C4_sinEvaluaciones() {
    const r = resumenHistorico([], '2026-1')
    expect(r.calificacionPromedio).toBe(0)
    expect(r.totalEvaluaciones).toBe(0)
  }

  C5_periodoSinDatos() {
    const r = resumenHistorico([], '2099-1')
    expect(r.period).toBe('2099-1')
    expect(r.totalEvaluaciones).toBe(0)
    expect(r.dateRange).toEqual({ start: '2099-01-01', end: '2099-06-30' })
  }

  C6_rangoPrimerSemestre() {
    expect(rangoFechasPeriodo('2026-1')).toEqual({ start: '2026-01-01', end: '2026-06-30' })
  }

  C6b_rangoSegundoSemestre() {
    expect(rangoFechasPeriodo('2026-2')).toEqual({ start: '2026-07-01', end: '2026-12-31' })
  }

  FALLA_C3_promedioIncorrecto() {
    const r = resumenHistorico(
      [
        { calificacion_promedio: 4, fecha_creacion: '2026-03-01' },
        { calificacion_promedio: 5, fecha_creacion: '2026-03-02' },
      ],
      '2026-1'
    )
    expect(r.calificacionPromedio).toBe(99)
  }

  FALLA_C6_rangoIncorrecto() {
    expect(rangoFechasPeriodo('2026-1')).toEqual({ start: '2026-07-01', end: '2026-12-31' })
  }
}

const pruebas = new RQ23EstadisticasHistoricas()

describe('RQ23 — Consultar estadísticas históricas', () => {
  it('C3: promedio del período', () => pruebas.C3_promedioDelPeriodo())
  it('C4: sin evaluaciones → ceros', () => pruebas.C4_sinEvaluaciones())
  it('C5: período futuro sin datos → ceros', () => pruebas.C5_periodoSinDatos())
  it('C6: 2026-1 cubre enero-junio', () => pruebas.C6_rangoPrimerSemestre())
  it('C6b: 2026-2 cubre julio-diciembre', () => pruebas.C6b_rangoSegundoSemestre())
  it('FALLA C3: promedio — se espera (mal) 99', () => pruebas.FALLA_C3_promedioIncorrecto())
  it('FALLA C6: 2026-1 — se espera (mal) el segundo semestre', () => pruebas.FALLA_C6_rangoIncorrecto())
})
