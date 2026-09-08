export function esEstudiante(tipoUsuario?: string): boolean {
  return tipoUsuario === 'estudiante'
}

export const STATS_ESTUDIANTE_CERO = {
  evaluacionesCompletadas: 0,
  evaluacionesPendientes: 0,
  materiasMatriculadas: 0,
  promedioGeneral: 0,
  progresoGeneral: 0,
}

export const CAMPOS_STATS_ESTUDIANTE = [
  'evaluacionesCompletadas',
  'evaluacionesPendientes',
  'materiasMatriculadas',
  'promedioGeneral',
  'progresoGeneral',
] as const

export function calcularStatsEstudiante(
  inscripcionesActivas: number | null | undefined,
  evaluacionesCompletadas:
    | Array<{ calificacion_promedio?: number | null }>
    | null
    | undefined
) {
  const materiasMatriculadasCount = inscripcionesActivas || 0
  const lista = evaluacionesCompletadas ?? []
  const evaluacionesCompletadasCount = lista.length
  const evaluacionesPendientesCount = materiasMatriculadasCount - evaluacionesCompletadasCount
  const promedioGeneral =
    evaluacionesCompletadasCount > 0
      ? lista.reduce((sum, e) => sum + (e.calificacion_promedio || 0), 0) / evaluacionesCompletadasCount
      : 0

  return {
    evaluacionesCompletadas: evaluacionesCompletadasCount,
    evaluacionesPendientes: Math.max(0, evaluacionesPendientesCount),
    materiasMatriculadas: materiasMatriculadasCount,
    promedioGeneral: Number(promedioGeneral.toFixed(2)),
    progresoGeneral:
      materiasMatriculadasCount > 0
        ? Math.round((evaluacionesCompletadasCount / materiasMatriculadasCount) * 100)
        : 0,
  }
}

export function decidirStudentStats(params: {
  autenticado: boolean
  tipoUsuario?: string
  perfilEstudiante: boolean
  errorPerfil?: boolean
  errorInterno?: boolean
  errorConsultaEvaluaciones?: boolean
  errorConsultaInscripciones?: boolean
  inscripcionesActivas?: number | null
  evaluacionesCompletadas?: Array<{ calificacion_promedio?: number | null }> | null
}): {
  ok: boolean
  status: number
  error?: string
  details?: string
  data?: typeof STATS_ESTUDIANTE_CERO
} {
  if (!params.autenticado) {
    return { ok: false, status: 401, error: 'Token de acceso requerido' }
  }
  if (!esEstudiante(params.tipoUsuario)) {
    return {
      ok: false,
      status: 403,
      error: 'Solo los estudiantes pueden acceder a estas estadísticas',
    }
  }
  if (params.errorPerfil || !params.perfilEstudiante) {
    return { ok: true, status: 200, data: { ...STATS_ESTUDIANTE_CERO } }
  }
  if (params.errorInterno) {
    return {
      ok: false,
      status: 500,
      error: 'Error interno del servidor',
      details: 'fallo no controlado',
    }
  }

  const evaluaciones = params.errorConsultaEvaluaciones ? null : params.evaluacionesCompletadas
  const inscripciones = params.errorConsultaInscripciones ? null : params.inscripcionesActivas

  return {
    ok: true,
    status: 200,
    data: calcularStatsEstudiante(inscripciones, evaluaciones),
  }
}
