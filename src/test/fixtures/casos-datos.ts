/**
 * Datos de prueba preparados (aparte de cada requisito).
 * Particiones: comunes, vacíos/cero e inválidos.
 * No lanzan excepción por sí solos; sirven para ver si el código los rechaza.
 */

export const NOTAS_COMUNES = [1, 3, 4.2, 5] as const
export const NOTAS_INVALIDAS = [-2, 0, 99, null, undefined, 'abc'] as const

export const PERIODOS_VALIDOS = ['2026-1', '2026-2'] as const
export const PERIODOS_INVALIDOS = ['', '2026', '2026-9', 'abc', 'DROP-TABLE'] as const

export const PAGINACION_INVALIDA = {
  page: Number('abc'),
  pageSize: -3,
} as const

export const TOKENS_QR = {
  vacio: '',
  ausente: undefined,
  invalido: 't-invalido',
  valido: 't-ok',
} as const

export const ROLES_NO_COORDINADOR = ['estudiante', 'profesor', 'admin'] as const
export const ROL_MAYUSCULAS = 'Coordinador'

export const EVALUACIONES_MEZCLADAS = [
  { profesor_id: 7, calificacion_promedio: 4, fecha_creacion: '2026-03-01' },
  { profesor_id: 7, calificacion_promedio: -2, fecha_creacion: '2026-03-02' },
  { profesor_id: 7, calificacion_promedio: 99, fecha_creacion: '2026-03-03' },
  { profesor_id: 7, calificacion_promedio: 0, fecha_creacion: '2026-03-04' },
  { profesor_id: 7, calificacion_promedio: null, fecha_creacion: '2026-03-05' },
]
