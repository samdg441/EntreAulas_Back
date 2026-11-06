export type UsuarioConsulta = { tipo_usuario?: string; id?: string | number }
export type QueryResultados = { periodo_id?: unknown; grupo_id?: unknown }

/** Solo un entero completo. parseInt("8 OR 1=1") devolvería 8 y colaría el resto de la cadena. */
function enteroSiViene(valor: unknown): number | undefined {
  if (typeof valor === 'number') return Number.isInteger(valor) ? valor : undefined
  if (typeof valor !== 'string' || !/^\d+$/.test(valor.trim())) return undefined
  return Number.parseInt(valor.trim(), 10)
}

/** Filtros de GET /api/resultados y /estadisticas. El profesor solo ve su id. */
export function filtrosConsultaResultados(
  usuario: UsuarioConsulta,
  query: QueryResultados
): Record<string, unknown> {
  const filters: Record<string, unknown> = {}
  if (usuario?.tipo_usuario === 'profesor') {
    filters.profesor_id = usuario.id
  }
  const periodo = enteroSiViene(query.periodo_id)
  const grupo = enteroSiViene(query.grupo_id)
  if (periodo !== undefined) filters.periodo_id = periodo
  if (grupo !== undefined) filters.grupo_id = grupo
  return filters
}
