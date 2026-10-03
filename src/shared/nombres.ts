/** Nombres y apellidos se guardan en mayúscula sostenida, sin espacios sobrantes. */
export function enMayusculas(valor: unknown): string {
  return String(valor ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleUpperCase('es-CO')
}

export function normalizarNombres<T extends { nombre?: unknown; apellido?: unknown }>(datos: T): T {
  const copia = { ...datos }
  if (typeof copia.nombre === 'string') copia.nombre = enMayusculas(copia.nombre) as T['nombre']
  if (typeof copia.apellido === 'string') copia.apellido = enMayusculas(copia.apellido) as T['apellido']
  return copia
}
