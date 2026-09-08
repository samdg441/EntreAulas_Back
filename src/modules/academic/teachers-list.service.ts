import { SupabaseDB } from '../../config/supabase-only'

const EMPTY_UUID = '00000000-0000-0000-0000-000000000000'

export class TeachersListHttpError extends Error {
  constructor(
    public status: number,
    public body: Record<string, unknown>
  ) {
    super(String(body.error ?? 'error'))
  }
}

function fail(status: number, error: string, details: unknown, logMessage: string): never {
  console.error(logMessage, details)
  throw new TeachersListHttpError(status, { error, details })
}

function uniques(values: unknown[]): string[] {
  return Array.from(new Set(values.filter(Boolean) as string[]))
}

function isMissingColumn(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null
  if (!e) return false
  return e.code === '42703' || String(e.message || '').includes('column')
}

async function selectIn(
  table: string,
  columns: string,
  column: string,
  ids: string[]
): Promise<{ data: any[]; error: unknown }> {
  try {
    const resp = await SupabaseDB.supabaseAdmin.from(table).select(columns).in(column, ids)
    return { data: resp.data || [], error: resp.error || null }
  } catch (e) {
    return { data: [], error: e }
  }
}

function mergeGrupoConAsignacion(grupo: any, asignacion: any | undefined) {
  if (!asignacion) return grupo
  return {
    ...grupo,
    profesor_id: asignacion.profesor_id,
    curso_id: grupo.curso_id || asignacion.curso_id,
  }
}

async function loadGruposDeEstudiante(grupoIds: string[]) {
  const full = await selectIn(
    'grupos',
    'id, curso_id, profesor_id, asignacion_profesor_id',
    'id',
    grupoIds
  )
  if (!full.error) return full.data

  if (!isMissingColumn(full.error)) {
    fail(500, 'DB grupos', full.error, 'Error consultando grupos:')
  }

  const reduced = await selectIn('grupos', 'id, curso_id', 'id', grupoIds)
  if (reduced.error) {
    fail(500, 'DB grupos', reduced.error, 'Error consultando grupos:')
  }
  return reduced.data
}

async function completarProfesorPorGrupo(grupos: any[], grupoIds: string[]) {
  const necesitaResolver = grupos.some((g: any) => !g.profesor_id)
  if (!necesitaResolver) return grupos

  const primary = await selectIn(
    'asignaciones_profesor',
    'id, grupo_id, profesor_id, curso_id',
    'grupo_id',
    grupoIds
  )
  let asignaciones = primary.data
  let err = primary.error

  if (err) {
    const fallback = await selectIn(
      'cursos_profesor',
      'id, grupo_id, profesor_id, curso_id',
      'grupo_id',
      grupoIds
    )
    asignaciones = fallback.data
    err = fallback.error
  }

  if (err || asignaciones.length === 0) return grupos

  const byGrupo = new Map(asignaciones.map((a: any) => [a.grupo_id, a]))
  return grupos.map((g: any) => mergeGrupoConAsignacion(g, byGrupo.get(g.id)))
}

async function completarProfesorPorAsignacionId(grupos: any[]) {
  const asignacionIds = uniques(grupos.map((g: any) => g.asignacion_profesor_id))
  if (asignacionIds.length === 0) return grupos

  const { data: asigns, error: asgErr } = await SupabaseDB.supabaseAdmin
    .from('asignaciones_profesor')
    .select('id, profesor_id, curso_id')
    .in('id', asignacionIds)

  if (asgErr) {
    fail(500, 'DB asignaciones_profesor', asgErr, 'Error consultando asignaciones para grupos:')
  }

  const byId = new Map((asigns || []).map((a: any) => [a.id, a]))
  return grupos.map((g: any) => {
    if (g.profesor_id || !g.asignacion_profesor_id) return g
    return mergeGrupoConAsignacion(g, byId.get(g.asignacion_profesor_id))
  })
}

async function scopeEstudiante(userId: string) {
  const { data: estudiante, error: estudianteError } = await SupabaseDB.supabaseAdmin
    .from('estudiantes')
    .select('id')
    .eq('usuario_id', userId)
    .single()

  if (estudianteError) {
    fail(500, 'DB estudiantes', estudianteError, 'Error obteniendo estudiante por usuario:')
  }
  if (!estudiante) return { empty: true as const }

  const { data: inscripciones, error: inscError } = await SupabaseDB.supabaseAdmin
    .from('inscripciones')
    .select('grupo_id')
    .eq('estudiante_id', estudiante.id)
    .eq('activa', true)

  if (inscError) {
    fail(500, 'DB inscripciones', inscError, 'Error consultando inscripciones:')
  }

  const grupoIds = uniques((inscripciones || []).map((i: any) => i.grupo_id))
  if (grupoIds.length === 0) return { empty: true as const }

  let grupos = await loadGruposDeEstudiante(grupoIds)
  grupos = await completarProfesorPorGrupo(grupos, grupoIds)
  grupos = await completarProfesorPorAsignacionId(grupos)

  return {
    empty: false as const,
    grupos,
    profesorIds: uniques(grupos.map((g: any) => g.profesor_id)),
  }
}

async function loadProfesores(profesorIdsFiltro: string[] | null) {
  let query = SupabaseDB.supabaseAdmin
    .from('profesores')
    .select(
      `
        *,
        usuario:usuarios(
          id,
          nombre,
          apellido,
          email,
          activo
        )
      `
    )
    .eq('activo', true)

  if (profesorIdsFiltro && profesorIdsFiltro.length > 0) {
    query = query.in('id', profesorIdsFiltro)
  }

  const { data: profesores, error: profesoresError } = await query
  if (profesoresError) {
    fail(500, 'DB profesores', profesoresError, 'Error consultando profesores:')
  }
  return profesores || []
}

function idsConsultaProfesor(profesorIds: string[]) {
  return profesorIds.length ? profesorIds : [EMPTY_UUID]
}

async function loadAsignaciones(profesorIds: string[]) {
  const ids = idsConsultaProfesor(profesorIds)
  const primary = await selectIn('asignaciones_profesor', '*', 'profesor_id', ids)

  if (!primary.error) {
    return normalizarAsignaciones(primary.data)
  }

  console.warn('Fallo con asignaciones_profesor; intentando cursos_profesor. Detalle:', primary.error)
  const fallback = await selectIn('cursos_profesor', '*', 'profesor_id', ids)
  if (fallback.error) {
    fail(500, 'DB asignaciones', fallback.error, 'Error consultando asignaciones (ambos nombres):')
  }
  return normalizarAsignaciones(fallback.data)
}

function normalizarAsignaciones(asignaciones: any[]) {
  return (asignaciones || []).map((a: any) => ({
    ...a,
    profesor_id: a.profesor_id ?? a.docente_id ?? a.teacher_id ?? a.profesor ?? null,
    curso_id: Number(a.curso_id ?? a.id_curso ?? a.course_id ?? a.curso ?? null),
  }))
}

async function loadGruposPorAsignaciones(asignaciones: any[]) {
  const grupoIds = uniques((asignaciones || []).map((a: any) => a.grupo_id))
  if (grupoIds.length === 0) return []

  const { data: gruposAll, error: gruposAllError } = await SupabaseDB.supabaseAdmin
    .from('grupos')
    .select('id, curso_id, numero_grupo, horario, aula')
    .in('id', grupoIds)

  if (gruposAllError) {
    console.warn('Advertencia: no se pudieron cargar grupos por asignaciones:', gruposAllError)
    return []
  }
  return gruposAll || []
}

async function loadCursos(asignaciones: any[]) {
  const cursoIds = Array.from(
    new Set(
      (asignaciones || [])
        .map((a: any) => a.curso_id)
        .filter((id: any) => id !== null && id !== undefined)
    )
  )
  console.log('🔍 Curso IDs from asignaciones:', cursoIds)
  if (cursoIds.length === 0) return []

  try {
    const respCursos = await SupabaseDB.supabaseAdmin
      .from('cursos')
      .select('id, nombre, codigo, creditos, descripcion')
      .in('id', cursoIds)
    const cursos = respCursos.data || []
    console.log('🔍 Cursos loaded:', cursos)
    return cursos
  } catch (e) {
    console.warn('No fue posible cargar cursos por ids:', e)
    return []
  }
}

function indexAsignaciones(asignaciones: any[], gruposPorAsignaciones: any[]) {
  const asignacionesByProfesor = new Map<string, any[]>()
  const cursoIdByGrupoId = new Map<number, number>()
  const gruposByProfesorCurso = new Map<string, any[]>()

  gruposPorAsignaciones.forEach((g: any) => {
    if (g && g.id != null) cursoIdByGrupoId.set(Number(g.id), Number(g.curso_id))
  })

  asignaciones.forEach((a: any) => {
    const resolvedCursoId = Number(a.curso_id ?? cursoIdByGrupoId.get(Number(a.grupo_id)))
    a.curso_id = Number.isFinite(resolvedCursoId) ? resolvedCursoId : undefined
    const list = asignacionesByProfesor.get(a.profesor_id) || []
    list.push(a)
    asignacionesByProfesor.set(a.profesor_id, list)

    const grupo = gruposPorAsignaciones.find((g: any) => g.id === a.grupo_id)
    if (!grupo) return
    const key = `${a.profesor_id}:${Number(a.curso_id)}`
    const grupos = gruposByProfesorCurso.get(key) || []
    grupos.push(grupo)
    gruposByProfesorCurso.set(key, grupos)
  })

  return { asignacionesByProfesor, gruposByProfesorCurso }
}

function gruposDelCurso(params: {
  esEstudiante: boolean
  gruposDeEstudiante: any[]
  gruposByProfesorCurso: Map<string, any[]>
  profesorId: string
  cursoId: number
}) {
  if (params.esEstudiante) {
    return params.gruposDeEstudiante
      .filter(
        (g: any) => g.profesor_id === params.profesorId && Number(g.curso_id) === params.cursoId
      )
      .map((g: any) => ({ id: g.id, numero: g.numero_grupo }))
  }
  const key = `${params.profesorId}:${params.cursoId}`
  return (params.gruposByProfesorCurso.get(key) || []).map((g: any) => ({
    id: g.id,
    numero: g.numero_grupo,
  }))
}

function mapCourse(
  asignacion: any,
  cursoById: Map<any, any>,
  carreraById: Map<any, any>,
  departamentoProfesor: string | undefined,
  groupParams: Omit<Parameters<typeof gruposDelCurso>[0], 'cursoId'>
) {
  const c = cursoById.get(asignacion.curso_id)
  console.log(`🔍 Course for curso_id ${asignacion.curso_id}:`, c)
  if (!c) return null
  return {
    id: c.id,
    name: c.nombre,
    code: c.codigo,
    credits: c.creditos,
    description: c.descripcion,
    schedule: 'Por definir',
    carreraId: c.carrera_id,
    department: departamentoProfesor || carreraById.get(c.carrera_id)?.nombre || 'Sin departamento',
    groups: gruposDelCurso({ ...groupParams, cursoId: Number(c.id) }),
  }
}

function buildTeachers(params: {
  user: any
  profesores: any[]
  asignaciones: any[]
  cursos: any[]
  gruposPorAsignaciones: any[]
  gruposDeEstudiante: any[]
}) {
  const esEstudiante = params.user?.tipo_usuario === 'estudiante'
  const cursoById = new Map((params.cursos || []).map((c: any) => [c.id, c]))
  const carreraById = new Map<any, any>()
  const { asignacionesByProfesor, gruposByProfesorCurso } = indexAsignaciones(
    params.asignaciones,
    params.gruposPorAsignaciones
  )

  return (params.profesores || []).map((profesor: any) => {
    const nombre = profesor.usuario?.nombre || ''
    const apellido = profesor.usuario?.apellido || ''
    const email = profesor.usuario?.email || ''
    const asignacionesDeProfesor = asignacionesByProfesor.get(profesor.id) || []

    console.log(`🔍 Processing profesor ${nombre} ${apellido} (${profesor.id})`)
    console.log(`🔍 Asignaciones:`, asignacionesDeProfesor)

    const courses = asignacionesDeProfesor
      .map((a: any) =>
        mapCourse(a, cursoById, carreraById, profesor.departamento, {
          esEstudiante,
          gruposDeEstudiante: params.gruposDeEstudiante,
          gruposByProfesorCurso,
          profesorId: profesor.id,
        })
      )
      .filter(Boolean)

    console.log(`✅ Final courses for ${nombre}:`, courses)

    return {
      id: profesor.id,
      name: `${nombre} ${apellido}`.trim(),
      email,
      department:
        profesor.departamento ||
        (courses.length > 0 ? (courses[0] as any).department : 'Sin departamento'),
      courses,
    }
  })
}

export async function listTeachersWithCourses(user: any) {
  let gruposDeEstudiante: any[] = []
  let profesorIdsFiltro: string[] | null = null

  if (user?.tipo_usuario === 'estudiante') {
    const scope = await scopeEstudiante(user.id)
    if (scope.empty) return []
    gruposDeEstudiante = scope.grupos
    profesorIdsFiltro = scope.profesorIds
  }

  const profesores = await loadProfesores(profesorIdsFiltro)
  const asignaciones = await loadAsignaciones(profesores.map((p: any) => p.id))
  const gruposPorAsignaciones = await loadGruposPorAsignaciones(asignaciones)
  const cursos = await loadCursos(asignaciones)

  return buildTeachers({
    user,
    profesores,
    asignaciones,
    cursos,
    gruposPorAsignaciones,
    gruposDeEstudiante,
  })
}
