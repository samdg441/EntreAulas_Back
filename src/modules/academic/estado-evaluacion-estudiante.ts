export type VentanaFecha = { fechaInicio: string; fechaFin: string }

export function claveEvaluacion(profesorId: unknown, grupoId: unknown) {
  return `${String(profesorId)}:${String(grupoId)}`
}

export function hoyISO(fecha = new Date()) {
  return fecha.toISOString().slice(0, 10)
}

/** Sin ventanas configuradas no se bloquea: solo se bloquea si hay fechas y hoy está fuera de todas. */
export function ventanaEstaCerrada(ventanas: VentanaFecha[], hoy = hoyISO()) {
  if (!ventanas.length) return false
  return !ventanas.some((ventana) => {
    const inicio = String(ventana.fechaInicio).slice(0, 10)
    const fin = String(ventana.fechaFin).slice(0, 10)
    return hoy >= inicio && hoy <= fin
  })
}

export function marcarGrupos<T extends { id?: unknown }>(
  grupos: T[],
  profesorId: unknown,
  respondidas: Set<string>,
  ventanaCerrada: boolean
) {
  return grupos.map((grupo) => {
    const evaluada = grupo.id != null && respondidas.has(claveEvaluacion(profesorId, grupo.id))
    return { ...grupo, evaluada, bloqueada: ventanaCerrada && !evaluada }
  })
}

export function marcarDocentes<T extends { id?: unknown; courses?: Array<{ groups?: Array<{ id?: unknown }> }> }>(
  docentes: T[],
  respondidas: Set<string>,
  ventanaCerrada: boolean
) {
  return docentes.map((docente) => ({
    ...docente,
    courses: (docente.courses || []).map((curso) => {
      const groups = marcarGrupos(curso.groups || [], docente.id, respondidas, ventanaCerrada)
      const evaluada = groups.length > 0 && groups.every((grupo) => grupo.evaluada)
      return {
        ...curso,
        groups,
        evaluada,
        bloqueada: !evaluada && ventanaCerrada,
      }
    }),
  }))
}
