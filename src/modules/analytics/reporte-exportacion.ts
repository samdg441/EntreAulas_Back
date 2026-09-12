/** RF-REP-25 — datos del reporte descargable (Excel lo arma el front). */

export const ROLES_EXPORTAN_REPORTE = ['coordinador', 'decano', 'admin', 'profesor'] as const

export const MIME_EXCEL =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export type UsuarioExportacion = {
  roles?: string[]
  tipo_usuario?: string
}

export type AgregadoReporte = {
  profesorId: string
  cursoNombre: string
  grupo: string
  estudiantes: number
  evaluadoresSet: Set<string>
  sumPromedio: number
  countPromedio: number
}

export function puedeExportarReporte(user: UsuarioExportacion | undefined): boolean {
  if (!user) return false
  const tipo = (user.tipo_usuario || '').toLowerCase()
  if (ROLES_EXPORTAN_REPORTE.includes(tipo as (typeof ROLES_EXPORTAN_REPORTE)[number])) {
    return true
  }
  return (user.roles || []).some((rol) =>
    ROLES_EXPORTAN_REPORTE.includes(String(rol).toLowerCase() as (typeof ROLES_EXPORTAN_REPORTE)[number])
  )
}

export function nombreArchivoReporte(period: unknown, tipo: 'coordinador' | 'general' = 'coordinador'): string {
  const periodo = typeof period === 'string' && period.trim() ? period.trim() : 'todo'
  return tipo === 'coordinador' ? `reporte-coordinador-${periodo}.xlsx` : `reporte-${periodo}.xlsx`
}

export function armarFilasReporte(
  rowAgg: Map<string, AgregadoReporte>,
  catAggByRow: Map<string, Map<string, { sum: number; count: number }>>,
  categoryNameById: Map<string, string>,
  teacherNameById: Map<string, string>
): Record<string, unknown>[] {
  return Array.from(rowAgg.entries())
    .map(([key, base]) => {
      const row: Record<string, unknown> = {
        DOCENTE: teacherNameById.get(base.profesorId) || `Docente ${base.profesorId}`,
        ASIGNATURA: base.cursoNombre,
        GRUPO: base.grupo,
        ESTUDIANTES: base.estudiantes,
        ESTUDIANTES_EVALUADORES: base.evaluadoresSet.size,
      }
      const byCat = catAggByRow.get(key) || new Map<string, { sum: number; count: number }>()
      byCat.forEach((values, catId) => {
        const catName = (categoryNameById.get(catId) || `Categoria_${catId}`).toUpperCase().replace(/\s+/g, '_')
        row[catName] = values.count > 0 ? Number((values.sum / values.count).toFixed(2)) : null
      })
      row.PROMEDIO = base.countPromedio > 0 ? Number((base.sumPromedio / base.countPromedio).toFixed(2)) : null
      return row
    })
    .sort((a, b) => {
      const byTeacher = String(a.DOCENTE).localeCompare(String(b.DOCENTE), 'es')
      if (byTeacher !== 0) return byTeacher
      const byCourse = String(a.ASIGNATURA).localeCompare(String(b.ASIGNATURA), 'es')
      if (byCourse !== 0) return byCourse
      return String(a.GRUPO).localeCompare(String(b.GRUPO), 'es')
    })
}

export function decidirExportacionReporte(params: {
  user?: UsuarioExportacion
  filas: unknown[]
  period?: unknown
}):
  | { ok: false; error: string }
  | { ok: true; filename: string; filas: unknown[]; mimeType: string; descargable: true } {
  if (!puedeExportarReporte(params.user)) {
    return { ok: false, error: 'No autorizado para exportar reportes.' }
  }
  return {
    ok: true,
    filename: nombreArchivoReporte(params.period),
    filas: params.filas,
    mimeType: MIME_EXCEL,
    descargable: true,
  }
}
