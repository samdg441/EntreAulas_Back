export function esProfesor(tipoUsuario?: string): boolean {
  return tipoUsuario === 'profesor'
}

export function calcularPromedio(calificaciones: Array<number | null | undefined>): number {
  const lista = calificaciones.map((c) => c || 0)
  if (lista.length === 0) return 0
  return lista.reduce((suma, n) => suma + n, 0) / lista.length
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
  return {
    period,
    calificacionPromedio:
      delPeriodo.length === 0
        ? 0
        : calcularPromedio(delPeriodo.map((e) => e.calificacion_promedio)),
    totalEvaluaciones: delPeriodo.length,
    dateRange,
  }
}
