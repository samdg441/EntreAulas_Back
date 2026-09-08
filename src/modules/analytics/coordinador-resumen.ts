import { calificacionEnEscala } from './calificaciones'

export function esCoordinador(user: { roles?: string[]; tipo_usuario?: string } | undefined): boolean {
  return Boolean(user?.roles?.includes('coordinador') || user?.tipo_usuario === 'coordinador')
}

export function parsearPaginacion(query: { page?: unknown; pageSize?: unknown }): {
  page: number
  pageSize: number
} {
  const pageRaw = Number(query.page ?? 1)
  const sizeRaw = Number(query.pageSize ?? 8)
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1
  const pageSize = Number.isFinite(sizeRaw) && sizeRaw > 0 ? Math.min(50, Math.floor(sizeRaw)) : 8
  return { page, pageSize }
}

export function armarResumenCoordinador(params: {
  profesores: Array<{ id: number; usuario_id: string }>
  usuarios: Array<{ id: string; nombre?: string; apellido?: string; email?: string }>
  evaluaciones: Array<{ profesor_id?: number | string; calificacion_promedio?: number | null }>
  totalCursos: number
  search?: string
  page?: number
  pageSize?: number
}) {
  const porProfesor = new Map<string, { total: number; suma: number }>()
  let totalEvaluaciones = 0
  let sumaGlobal = 0

  for (const e of params.evaluaciones) {
    const pid = String(e.profesor_id || '')
    const cal = calificacionEnEscala(e.calificacion_promedio)
    if (!pid || cal == null) continue
    const prev = porProfesor.get(pid) || { total: 0, suma: 0 }
    prev.total += 1
    prev.suma += cal
    porProfesor.set(pid, prev)
    totalEvaluaciones += 1
    sumaGlobal += cal
  }

  const usuarioById = new Map(params.usuarios.map((u) => [String(u.id), u]))
  const merged = params.profesores.map((p) => {
    const u = usuarioById.get(String(p.usuario_id))
    const agg = porProfesor.get(String(p.id)) || { total: 0, suma: 0 }
    const promedio = agg.total > 0 ? Number((agg.suma / agg.total).toFixed(2)) : 0
    return {
      profesorId: p.id,
      nombre: `${u?.nombre || ''} ${u?.apellido || ''}`.trim() || 'Docente',
      email: u?.email || '',
      totalEvaluaciones: agg.total,
      promedio,
    }
  })

  const search = String(params.search || '').trim().toLowerCase()
  const filtered = !search
    ? merged
    : merged.filter((t) => `${t.nombre} ${t.email}`.toLowerCase().includes(search))

  filtered.sort((a, b) => {
    if (a.promedio === 0 && b.promedio !== 0) return 1
    if (a.promedio !== 0 && b.promedio === 0) return -1
    if (a.promedio !== b.promedio) return a.promedio - b.promedio
    return String(a.nombre).localeCompare(String(b.nombre), 'es')
  })

  const { page, pageSize } = parsearPaginacion({ page: params.page, pageSize: params.pageSize })
  const total = filtered.length
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize)
  const safePage = totalPages === 0 ? 1 : Math.min(page, totalPages)
  const from = (safePage - 1) * pageSize

  return {
    stats: {
      totalProfesores: params.profesores.length,
      totalCursos: params.totalCursos,
      promedioEvaluaciones: totalEvaluaciones > 0 ? Number((sumaGlobal / totalEvaluaciones).toFixed(2)) : 0,
      profesoresEnRiesgo: merged.filter((t) => t.totalEvaluaciones > 0 && t.promedio < 4).length,
      totalEvaluaciones,
    },
    teachers: filtered.slice(from, from + pageSize),
    pagination: { page: safePage, pageSize, total, totalPages },
  }
}
