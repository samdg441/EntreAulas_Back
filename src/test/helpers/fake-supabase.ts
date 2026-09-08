/**
 * Doble de Supabase en memoria (Fake, no Mock).
 *
 * Aplica `eq` / `neq` / `in` / `gte` / `lte` / `is` sobre las filas sembradas.
 * Sustituye a `query-builder.ts`, que devolvía el resultado encolado
 * ignorando los filtros.
 *
 * El siguiente paso para quitar también este doble es inyectar el cliente
 * real (Postgres de prueba) detrás de la misma interfaz `from()`.
 */

export type Fila = Record<string, unknown>
export type ErrorConsulta = { message: string; code?: string }
export type ResultadoConsulta = { data: unknown; error: ErrorConsulta | null }

type FalloTabla = { error: ErrorConsulta; omitir: number }

function igual(filaVal: unknown, esperado: unknown): boolean {
  if (esperado === null || esperado === undefined) {
    return filaVal === null || filaVal === undefined
  }
  if (typeof esperado === 'boolean') return filaVal === esperado
  return String(filaVal) === String(esperado)
}

function comparar(filaVal: unknown, esperado: unknown): number {
  if (typeof filaVal === 'number' && typeof esperado === 'number') {
    return filaVal === esperado ? 0 : filaVal > esperado ? 1 : -1
  }
  const a = String(filaVal ?? '')
  const b = String(esperado ?? '')
  return a === b ? 0 : a > b ? 1 : -1
}

type Predicado = (fila: Fila) => boolean

export class QueryBuilder {
  private predicados: Predicado[] = []
  private filasInsert: Fila[] | null = null
  private parche: Fila | null = null
  private orden: { columna: string; asc: boolean } | null = null
  private forzarError: ErrorConsulta | null

  constructor(
    private readonly store: Map<string, Fila[]>,
    private readonly tabla: string,
    errorTabla: ErrorConsulta | null
  ) {
    this.forzarError = errorTabla
  }

  select(_columnas?: unknown, _opts?: unknown) {
    return this
  }

  eq(columna: string, valor: unknown) {
    this.predicados.push((fila) => igual(fila[columna], valor))
    return this
  }

  neq(columna: string, valor: unknown) {
    this.predicados.push((fila) => !igual(fila[columna], valor))
    return this
  }

  in(columna: string, valores: unknown[]) {
    const set = (valores ?? []).map((v) => String(v))
    this.predicados.push((fila) => set.includes(String(fila[columna])))
    return this
  }

  gte(columna: string, valor: unknown) {
    this.predicados.push((fila) => comparar(fila[columna], valor) >= 0)
    return this
  }

  lte(columna: string, valor: unknown) {
    this.predicados.push((fila) => comparar(fila[columna], valor) <= 0)
    return this
  }

  is(columna: string, valor: unknown) {
    this.predicados.push((fila) => igual(fila[columna], valor))
    return this
  }

  order(columna: string, opts?: { ascending?: boolean }) {
    this.orden = { columna, asc: opts?.ascending !== false }
    return this
  }

  not(columna: string, operador: string, valor: unknown) {
    if (operador === 'ilike' && typeof valor === 'string') {
      const needle = valor.replace(/%/g, '').toLowerCase()
      this.predicados.push((fila) => !String(fila[columna] ?? '').toLowerCase().includes(needle))
    }
    return this
  }

  insert(filas: Fila | Fila[]) {
    this.filasInsert = Array.isArray(filas) ? filas.map((f) => ({ ...f })) : [{ ...filas }]
    return this
  }

  update(parche: Fila) {
    this.parche = { ...parche }
    return this
  }

  upsert(filas: Fila | Fila[]) {
    return this.insert(filas)
  }

  maybeSingle() {
    return this.ejecutar({ single: 'maybe' })
  }

  single() {
    return this.ejecutar({ single: 'one' })
  }

  then<TResult1 = ResultadoConsulta, TResult2 = never>(
    onFulfilled?: ((value: ResultadoConsulta) => TResult1 | PromiseLike<TResult1>) | null,
    onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ) {
    return this.ejecutar({ single: 'many' }).then(onFulfilled, onRejected)
  }

  private async ejecutar(modo: { single: 'many' | 'one' | 'maybe' }): Promise<ResultadoConsulta> {
    if (this.forzarError) {
      return { data: null, error: this.forzarError }
    }

    const tabla = this.store.get(this.tabla) ?? []

    if (this.filasInsert) {
      tabla.push(...this.filasInsert)
      this.store.set(this.tabla, tabla)
      const insertadas = this.filasInsert
      return this.empaquetar(insertadas, modo)
    }

    let filas = tabla.filter((fila) => this.predicados.every((p) => p(fila)))

    if (this.parche) {
      filas.forEach((fila) => Object.assign(fila, this.parche))
    }

    if (this.orden) {
      const { columna, asc } = this.orden
      filas = [...filas].sort((a, b) => {
        const cmp = comparar(a[columna], b[columna])
        return asc ? cmp : -cmp
      })
    }

    return this.empaquetar(filas.map((f) => ({ ...f })), modo)
  }

  private empaquetar(filas: Fila[], modo: { single: 'many' | 'one' | 'maybe' }): ResultadoConsulta {
    if (modo.single === 'many') return { data: filas, error: null }
    if (filas.length === 0) {
      if (modo.single === 'one') {
        return { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' } }
      }
      return { data: null, error: null }
    }
    if (filas.length > 1 && modo.single !== 'many') {
      return { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' } }
    }
    return { data: filas[0], error: null }
  }
}

export class FakeSupabase {
  private tablas = new Map<string, Fila[]>()
  private fallos = new Map<string, FalloTabla>()

  reset() {
    this.tablas.clear()
    this.fallos.clear()
  }

  seed(tabla: string, filas: Fila[]) {
    const actuales = this.tablas.get(tabla) ?? []
    actuales.push(...filas.map((f) => ({ ...f })))
    this.tablas.set(tabla, actuales)
  }

  fail(tabla: string, error: ErrorConsulta, omitir = 0) {
    this.fallos.set(tabla, { error, omitir })
  }

  from(tabla: string) {
    const fallo = this.fallos.get(tabla)
    let errorTabla: ErrorConsulta | null = null
    if (fallo) {
      if (fallo.omitir > 0) {
        fallo.omitir -= 1
      } else {
        errorTabla = fallo.error
      }
    }
    return new QueryBuilder(this.tablas, tabla, errorTabla)
  }

  filas(tabla: string): Fila[] {
    return (this.tablas.get(tabla) ?? []).map((f) => ({ ...f }))
  }
}

export const fakeDb = new FakeSupabase()

export const supabaseAdmin = {
  from: (tabla: string) => fakeDb.from(tabla),
}

export const SupabaseDB = {
  supabaseAdmin,
  async findUserById(id: string) {
    const { data, error } = await supabaseAdmin.from('usuarios').select('*').eq('id', id).single()
    if (error && error.code !== 'PGRST116') throw error
    return data
  },
  async findUserByEmail(email: string) {
    const { data, error } = await supabaseAdmin.from('usuarios').select('*').eq('email', email).single()
    if (error && error.code !== 'PGRST116') throw error
    return data
  },
}

export default {}
