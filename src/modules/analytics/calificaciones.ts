/** Escala de evaluación: 1 a 5. Cero, negativo, 99 o no numérico no cuentan. */

export function calificacionEnEscala(calificacion: unknown): number | null {
  const cal = Number(calificacion)
  if (!Number.isFinite(cal) || cal < 1 || cal > 5) return null
  return cal
}

export function calcularPromedio(calificaciones: Array<number | string | null | undefined>): number {
  const lista = calificaciones
    .map(calificacionEnEscala)
    .filter((n): n is number => n != null)
  if (lista.length === 0) return 0
  return lista.reduce((suma, n) => suma + n, 0) / lista.length
}

export function resumenMetricas(
  evaluaciones: Array<{ calificacion_promedio?: number | string | null }>
): { calificacionPromedio: number; totalEvaluaciones: number } {
  const validas = evaluaciones.filter((e) => calificacionEnEscala(e.calificacion_promedio) != null)
  const promedio = calcularPromedio(validas.map((e) => e.calificacion_promedio))
  return {
    calificacionPromedio: validas.length === 0 ? 0 : Number(promedio.toFixed(2)),
    totalEvaluaciones: validas.length,
  }
}

export function esPeriodoValido(period: string): boolean {
  return /^\d{4}-[12]$/.test(String(period).trim())
}

export function rangoFechasPeriodo(period: string): { start: string; end: string } | null {
  if (!esPeriodoValido(period)) return null
  const [year, semester] = String(period).split('-')
  return {
    start: `${year}-${semester === '1' ? '01' : '07'}-01`,
    end: `${year}-${semester === '1' ? '06-30' : '12-31'}`,
  }
}

export function resumenHistorico(
  evaluaciones: Array<{ calificacion_promedio?: number | null; fecha_creacion: string }>,
  period: string
) {
  const dateRange = rangoFechasPeriodo(period)
  const delPeriodo = !dateRange
    ? []
    : evaluaciones.filter((e) => e.fecha_creacion >= dateRange.start && e.fecha_creacion <= dateRange.end)
  const metricas = resumenMetricas(delPeriodo)
  return {
    period,
    calificacionPromedio: metricas.calificacionPromedio,
    totalEvaluaciones: metricas.totalEvaluaciones,
    dateRange: dateRange ?? { start: '', end: '' },
  }
}

export function esProfesor(tipoUsuario?: string): boolean {
  return tipoUsuario === 'profesor' || tipoUsuario === 'docente'
}
