type SbError = { code?: string } | null

// PostgREST corta cada respuesta en 1000 filas: hay que pedir por rangos.
const TAMANO_PAGINA = 1000

export async function todasLasFilas<T>(
  pagina: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: SbError }>
): Promise<T[]> {
  const filas: T[] = []
  for (let desde = 0; ; desde += TAMANO_PAGINA) {
    const { data, error } = await pagina(desde, desde + TAMANO_PAGINA - 1)
    if (error) throw error
    const lote = data || []
    filas.push(...lote)
    if (lote.length < TAMANO_PAGINA) return filas
  }
}
