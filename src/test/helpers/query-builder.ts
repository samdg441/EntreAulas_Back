import { vi } from 'vitest'

export type QueryResult = { data: unknown; error: unknown }

/** Simula el query builder encadenable de Supabase (thenable + maybeSingle/single). */
export function createQueryBuilder(result: QueryResult = { data: null, error: null }) {
  const builder: Record<string, unknown> = { _result: result }
  const passthrough = () => builder
  builder.select = vi.fn(passthrough)
  builder.eq = vi.fn(passthrough)
  builder.neq = vi.fn(passthrough)
  builder.in = vi.fn(passthrough)
  builder.gte = vi.fn(passthrough)
  builder.lte = vi.fn(passthrough)
  builder.order = vi.fn(passthrough)
  builder.is = vi.fn(passthrough)
  builder.insert = vi.fn(passthrough)
  builder.update = vi.fn(passthrough)
  builder.upsert = vi.fn(passthrough)
  builder.maybeSingle = vi.fn(async () => result)
  builder.single = vi.fn(async () => result)
  builder.then = (onFulfilled: (value: QueryResult) => unknown, onRejected?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(onFulfilled, onRejected)
  return builder
}

/** Cada llamada a from(tabla) consume el siguiente resultado encolado para esa tabla. */
export function queueFrom(queues: Record<string, QueryResult[]>) {
  const remaining: Record<string, QueryResult[]> = Object.fromEntries(
    Object.entries(queues).map(([table, items]) => [table, [...items]])
  )
  return (table: string) => {
    const next = remaining[table]?.shift() ?? { data: null, error: null }
    return createQueryBuilder(next)
  }
}

export const profesorUser = {
  id: 'user-profesor',
  email: 'profesor@test.com',
  tipo_usuario: 'profesor',
  roles: ['profesor'],
  permisos: [] as string[],
}

export const coordinadorUser = {
  id: 'user-coordinador',
  email: 'coordinador@test.com',
  tipo_usuario: 'coordinador',
  roles: ['coordinador'],
  permisos: [] as string[],
}

export const estudianteUser = {
  id: 'user-estudiante',
  email: 'estudiante@test.com',
  tipo_usuario: 'estudiante',
  roles: ['estudiante'],
  permisos: [] as string[],
}
