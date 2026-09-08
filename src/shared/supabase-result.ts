type SbError = { code?: string; message?: string } | null

/** 0 filas con .single() */
export function isNoRow(error: SbError) {
  return !error || error.code === 'PGRST116'
}

export function isMissingColumn(error: SbError) {
  if (!error) return false
  return error.code === '42703' || String(error.message || '').includes('column')
}

export function one<T>(data: T | null, error: SbError): T | null {
  if (error && error.code !== 'PGRST116') throw error
  return data ?? null
}

export function many<T>(data: T[] | null, error: SbError): T[] {
  if (error) throw error
  return data || []
}

export const emptyId = '00000000-0000-0000-0000-000000000000'
