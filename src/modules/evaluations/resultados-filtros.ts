export type UsuarioConsulta = { tipo_usuario?: string; id?: string | number }
export type QueryResultados = { periodo_id?: unknown; grupo_id?: unknown }

function enteroSiViene(valor: unknown): number | undefined {
  if (valor === undefined || valor === null || valor === '') return undefined
  const n = Number.parseInt(String(valor), 10)
  return Number.isNaN(n) ? undefined : n
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
