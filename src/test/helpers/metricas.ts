export function esProfesor(tipoUsuario?: string): boolean {
  return tipoUsuario === 'profesor'
}

/** Escala de evaluación: 1 a 5 inclusive. Cero, negativo, 99 o no numérico → inválido. */
export function calificacionEnEscala(calificacion: unknown): number | null {
  const cal = Number(calificacion)
  if (!Number.isFinite(cal) || cal < 1 || cal > 5) return null
  return cal
}

export function calcularPromedio(calificaciones: Array<number | null | undefined>): number {
  const lista = calificaciones
    .map(calificacionEnEscala)
    .filter((n): n is number => n != null)
  if (lista.length === 0) return 0
  return lista.reduce((suma, n) => suma + n, 0) / lista.length
}

export function esPeriodoValido(period: string): boolean {
  return /^\d{4}-[12]$/.test(String(period).trim())
}

export function rangoFechasPeriodo(period: string): { start: string; end: string } {
  const [year, semester] = String(period).split('-')
  return {
    start: `${year}-${semester === '1' ? '01' : '07'}-01`,
    end: `${year}-${semester === '1' ? '06-30' : '12-31'}`,
  }
}

export function filtrarEvaluacionesPorPeriodo<T extends { fecha_creacion: string }>(
  evaluaciones: T[],
  period: string
): T[] {
  const { start, end } = rangoFechasPeriodo(period)
  return evaluaciones.filter((e) => e.fecha_creacion >= start && e.fecha_creacion <= end)
}

export function resumenHistorico(
  evaluaciones: Array<{ calificacion_promedio?: number | null; fecha_creacion: string }>,
  period: string
) {
  const dateRange = rangoFechasPeriodo(period)
  const delPeriodo = filtrarEvaluacionesPorPeriodo(evaluaciones, period)
  const validas = delPeriodo.filter((e) => calificacionEnEscala(e.calificacion_promedio) != null)
  return {
    period,
    calificacionPromedio: calcularPromedio(validas.map((e) => e.calificacion_promedio)),
    totalEvaluaciones: validas.length,
    dateRange,
  }
}
