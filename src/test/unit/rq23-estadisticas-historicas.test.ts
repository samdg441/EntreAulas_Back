import { describe, expect, it } from 'vitest'
import {
  esPeriodoValido,
  partesPeriodo,
  rangoFechasPeriodo,
  rangoFechasPeriodoOTodo,
  resumenHistorico,
} from '../../modules/analytics/calificaciones'
import { EVALUACIONES_MEZCLADAS, PERIODOS_INVALIDOS, PERIODOS_VALIDOS } from '../fixtures/casos-datos'

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

  C7_periodoInvalido() {
    for (const p of PERIODOS_VALIDOS) expect(esPeriodoValido(p)).toBe(true)
    for (const p of PERIODOS_INVALIDOS) expect(esPeriodoValido(p)).toBe(false)
    expect(partesPeriodo('2026-1')).toEqual({ year: 2026, semester: 1 })
    expect(partesPeriodo('2026-2')).toEqual({ year: 2026, semester: 2 })
    expect(partesPeriodo('DROP-TABLE')).toBeNull()
    expect(partesPeriodo('2026-9')).toBeNull()
    expect(partesPeriodo({})).toBeNull()
    expect(partesPeriodo(undefined)).toBeNull()
    expect(partesPeriodo(['2026-1'])).toEqual({ year: 2026, semester: 1 })
    expect(partesPeriodo(20261)).toBeNull()
    expect(partesPeriodo([1])).toBeNull()
  }

  C9_rangoOTodo() {
    expect(rangoFechasPeriodoOTodo('2026-2')).toEqual({ start: '2026-07-01', end: '2026-12-31' })
    expect(rangoFechasPeriodoOTodo({})).toEqual({ start: '2020-01-01', end: '2030-12-31' })
    expect(rangoFechasPeriodoOTodo('no-vale')).toEqual({ start: '2020-01-01', end: '2030-12-31' })
  }

  C10_historicoPeriodoInvalido() {
    const r = resumenHistorico(
      [{ calificacion_promedio: 4, fecha_creacion: '2026-03-01' }],
      'abc'
    )
    expect(r.totalEvaluaciones).toBe(0)
    expect(r.dateRange).toEqual({ start: '', end: '' })
  }

  C8_notasFueraDeEscalaNoCuentan() {
    const r = resumenHistorico(
      [...EVALUACIONES_MEZCLADAS, { profesor_id: 7, calificacion_promedio: 8.2, fecha_creacion: '2026-08-01' }],
      '2026-1'
    )
    expect(r.calificacionPromedio).toBe(4)
    expect(r.totalEvaluaciones).toBe(1)
  }
}

const pruebas = new RQ23EstadisticasHistoricas()

describe('RQ23 — Consultar estadísticas históricas', () => {
  it('C3: promedio del período', () => pruebas.C3_promedioDelPeriodo())
  it('C4: sin evaluaciones → ceros', () => pruebas.C4_sinEvaluaciones())
  it('C5: período futuro sin datos → ceros', () => pruebas.C5_periodoSinDatos())
  it('C6: 2026-1 cubre enero-junio', () => pruebas.C6_rangoPrimerSemestre())
  it('C6b: 2026-2 cubre julio-diciembre', () => pruebas.C6b_rangoSegundoSemestre())
  it('C7: período mal formado no es válido', () => pruebas.C7_periodoInvalido())
  it('C8: notas fuera de 1–5 no entran al histórico', () => pruebas.C8_notasFueraDeEscalaNoCuentan())
  it('C9: periodo inválido usa rango “todo”', () => pruebas.C9_rangoOTodo())
  it('C10: histórico con periodo inválido → vacío', () => pruebas.C10_historicoPeriodoInvalido())
})
