import { academicRepository } from './academic.repository'
import { teachersRepository } from './teachers.repository'
import { internal } from '../../shared/errors'

type UsuarioListado = { id: string; tipo_usuario?: string }

type AlcanceEstudiante = {
  vacio: boolean
  grupos: any[]
  profesorIdsFiltro: string[] | null
}

type IndicesAsignacion = {
  asignacionesByProfesor: Map<string, any[]>
  gruposByProfesorCurso: Map<string, any[]>
}

function esEstudiante(user: UsuarioListado) {
  return user?.tipo_usuario === 'estudiante'
}

function idsUnicos(values: any[]) {
  return [...new Set((values || []).filter(Boolean))]
}

function idsDefinidos(values: any[]) {
  return [...new Set((values || []).filter((id: any) => id !== null && id !== undefined))]
}

function hayFiltroProfesores(ids: string[] | null) {
  return Boolean(ids && ids.length > 0)
}

function hayGruposSinProfesor(grupos: any[]) {
  return grupos.some((g: any) => !g.profesor_id)
}

function debeResolverProfesor(grupos: any[], grupoIds: any[]) {
  return hayGruposSinProfesor(grupos) && grupoIds.length > 0
}

function debeCargarCursos(cursoIds: any[], cursos: any[]) {
  return cursoIds.length > 0 && cursos.length === 0
}

function tieneIdGrupo(grupo: any) {
  return grupo != null && grupo.id != null
}

async function dbOError<T>(etiqueta: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    throw internal(etiqueta, err)
  }
}

async function dbOValor<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn()
  } catch {
    return fallback
  }
}

function fusionarGrupoConAsignacion(grupo: any, asignacion: any | undefined) {
  if (!asignacion) return grupo
  return {
    ...grupo,
    profesor_id: asignacion.profesor_id,
    curso_id: grupo.curso_id || asignacion.curso_id,
  }
}

function grupoYaTieneProfesor(grupo: any) {
  return Boolean(grupo.profesor_id) || !grupo.asignacion_profesor_id
}

function fusionarSiFaltaProfesor(grupo: any, asignacionById: Map<string, any>) {
  if (grupoYaTieneProfesor(grupo)) return grupo
  return fusionarGrupoConAsignacion(grupo, asignacionById.get(grupo.asignacion_profesor_id))
}

async function aplicarAsignacionesPorGrupo(grupos: any[], grupoIds: any[]) {
  const asignacionesPorGrupo = await academicRepository.listAsignacionesByGrupoIds(grupoIds)
  if (asignacionesPorGrupo.length === 0) return grupos
  const byGrupo = new Map(asignacionesPorGrupo.map((a: any) => [a.grupo_id, a]))
  return grupos.map((g: any) => fusionarGrupoConAsignacion(g, byGrupo.get(g.id)))
}

async function completarProfesorPorGrupo(grupos: any[], grupoIds: any[]) {
  if (!debeResolverProfesor(grupos, grupoIds)) return grupos
  return dbOValor(() => aplicarAsignacionesPorGrupo(grupos, grupoIds), grupos)
}

async function completarProfesorPorAsignacionId(grupos: any[]) {
  const asignacionIds = idsUnicos(grupos.map((g: any) => g.asignacion_profesor_id))
  if (asignacionIds.length === 0) return grupos

  const asigns = await dbOError('DB asignaciones_profesor', () =>
    academicRepository.listAsignacionesByIds(asignacionIds)
  )
  const byId = new Map((asigns || []).map((a: any) => [a.id, a]))
  return grupos.map((g: any) => fusionarSiFaltaProfesor(g, byId))
}

async function alcancePorEstudiante(user: UsuarioListado): Promise<AlcanceEstudiante> {
  const vacio: AlcanceEstudiante = { vacio: true, grupos: [], profesorIdsFiltro: null }
  if (!esEstudiante(user)) {
    return { vacio: false, grupos: [], profesorIdsFiltro: null }
  }

  const estudiante = await academicRepository.findEstudianteByUsuarioId(user.id)
  if (!estudiante) return vacio

  const inscripciones = await dbOError('DB inscripciones', () =>
    academicRepository.listInscripcionesActivas(estudiante.id)
  )
  const grupoIds = idsUnicos((inscripciones || []).map((i: any) => i.grupo_id))
  if (grupoIds.length === 0) return vacio

  let grupos =
    (await dbOError('DB grupos', () => academicRepository.listGruposByIdsFlexible(grupoIds))) || []
  grupos = await completarProfesorPorGrupo(grupos, grupoIds)
  grupos = await completarProfesorPorAsignacionId(grupos)

  return {
    vacio: false,
    grupos,
    profesorIdsFiltro: idsUnicos(grupos.map((g: any) => g.profesor_id)),
  }
}

async function cargarProfesoresActivos(profesorIdsFiltro: string[] | null) {
  return (
    (await dbOError('DB profesores', () =>
      teachersRepository.listActiveWithUsuario(
        hayFiltroProfesores(profesorIdsFiltro) ? profesorIdsFiltro! : undefined
      )
    )) || []
  )
}

function normalizarAsignacion(asignacion: any) {
  return {
    ...asignacion,
    profesor_id:
      asignacion.profesor_id ?? asignacion.docente_id ?? asignacion.teacher_id ?? asignacion.profesor ?? null,
    curso_id: Number(
      asignacion.curso_id ?? asignacion.id_curso ?? asignacion.course_id ?? asignacion.curso ?? null
    ),
  }
}

async function cargarAsignacionesNormalizadas(profesorIds: string[]) {
  const asignaciones = await dbOError('DB asignaciones', () =>
    academicRepository.listAsignacionesByProfesorIds(profesorIds)
  )
  return (asignaciones || []).map(normalizarAsignacion)
}

async function cargarGruposDeAsignaciones(asignaciones: any[]) {
  const grupoIds = idsUnicos((asignaciones || []).map((a: any) => a.grupo_id))
  if (grupoIds.length === 0) return []
  return dbOValor(
    () => academicRepository.listGruposByIds(grupoIds, 'id, curso_id, numero_grupo, horario, aula'),
    []
  )
}

async function cargarCarrerasDeCursos(cursos: any[]) {
  const carreraIds = idsDefinidos((cursos || []).map((c: any) => c.carrera_id))
  if (carreraIds.length === 0) return []
  return dbOError('DB carreras', () => academicRepository.listCarrerasByIds(carreraIds))
}

async function cargarCursosSiFaltan(asignaciones: any[], cursos: any[]) {
  const cursoIds = idsDefinidos((asignaciones || []).map((a: any) => a.curso_id))
  if (!debeCargarCursos(cursoIds, cursos)) return cursos
  return dbOValor(
    () => academicRepository.listCursosByIds(cursoIds, 'id, nombre, codigo, creditos, descripcion'),
    cursos
  )
}

function registrarCursoDeGrupo(cursoIdByGrupoId: Map<number, number>, grupo: any) {
  if (!tieneIdGrupo(grupo)) return
  cursoIdByGrupoId.set(Number(grupo.id), Number(grupo.curso_id))
}

function registrarAsignacion(
  asignacionesByProfesor: Map<string, any[]>,
  asignacion: any,
  cursoIdByGrupoId: Map<number, number>
) {
  const resolvedCursoId = Number(asignacion.curso_id ?? cursoIdByGrupoId.get(Number(asignacion.grupo_id)))
  asignacion.curso_id = Number.isFinite(resolvedCursoId) ? resolvedCursoId : undefined
  const list = asignacionesByProfesor.get(asignacion.profesor_id) || []
  list.push(asignacion)
  asignacionesByProfesor.set(asignacion.profesor_id, list)
}

function registrarGrupoDeAsignacion(
  gruposByProfesorCurso: Map<string, any[]>,
  gruposPorAsignaciones: any[],
  asignacion: any
) {
  const grupo = gruposPorAsignaciones.find((g: any) => g.id === asignacion.grupo_id)
  if (!grupo) return
  const key = `${asignacion.profesor_id}:${Number(asignacion.curso_id)}`
  const list = gruposByProfesorCurso.get(key) || []
  list.push(grupo)
  gruposByProfesorCurso.set(key, list)
}

function indexarAsignaciones(asignaciones: any[], gruposPorAsignaciones: any[]): IndicesAsignacion {
  const asignacionesByProfesor = new Map<string, any[]>()
  const cursoIdByGrupoId = new Map<number, number>()
  const gruposByProfesorCurso = new Map<string, any[]>()

  gruposPorAsignaciones.forEach((g: any) => registrarCursoDeGrupo(cursoIdByGrupoId, g))
  ;(asignaciones || []).forEach((a: any) =>
    registrarAsignacion(asignacionesByProfesor, a, cursoIdByGrupoId)
  )
  ;(asignaciones || []).forEach((a: any) =>
    registrarGrupoDeAsignacion(gruposByProfesorCurso, gruposPorAsignaciones, a)
  )

  return { asignacionesByProfesor, gruposByProfesorCurso }
}

function grupoDeProfesorYCurso(grupo: any, profesorId: string, cursoId: number) {
  return grupo.profesor_id === profesorId && Number(grupo.curso_id) === cursoId
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
      .filter((g: any) => grupoDeProfesorYCurso(g, params.profesorId, params.cursoId))
      .map((g: any) => ({ id: g.id, numero: g.numero_grupo }))
  }
  const key = `${params.profesorId}:${params.cursoId}`
  return (params.gruposByProfesorCurso.get(key) || []).map((g: any) => ({
    id: g.id,
    numero: g.numero_grupo,
  }))
}

function departamentoDeCurso(
  departamentoProfesor: string | undefined,
  carreraById: Map<any, any>,
  carreraId: any
) {
  return departamentoProfesor || carreraById.get(carreraId)?.nombre || 'Sin departamento'
}

function mapearCurso(
  asignacion: any,
  cursoById: Map<any, any>,
  carreraById: Map<any, any>,
  departamentoProfesor: string | undefined,
  groupParams: Omit<Parameters<typeof gruposDelCurso>[0], 'cursoId'>
) {
  const curso = cursoById.get(asignacion.curso_id)
  if (!curso) return null
  return {
    id: curso.id,
    name: curso.nombre,
    code: curso.codigo,
    credits: curso.creditos,
    description: curso.descripcion,
    schedule: 'Por definir',
    carreraId: curso.carrera_id,
    department: departamentoDeCurso(departamentoProfesor, carreraById, curso.carrera_id),
    groups: gruposDelCurso({ ...groupParams, cursoId: Number(curso.id) }),
  }
}

function departamentoListado(profesor: any, courses: any[]) {
  if (profesor.departamento) return profesor.departamento
  if (courses.length > 0) return courses[0].department
  return 'Sin departamento'
}

function mapearProfesorListado(
  profesor: any,
  indices: IndicesAsignacion,
  cursoById: Map<any, any>,
  carreraById: Map<any, any>,
  groupParams: Omit<Parameters<typeof gruposDelCurso>[0], 'cursoId' | 'profesorId'>
) {
  const nombre = profesor.usuario?.nombre || ''
  const apellido = profesor.usuario?.apellido || ''
  const email = profesor.usuario?.email || ''
  const asignacionesDeProfesor = indices.asignacionesByProfesor.get(profesor.id) || []
  const courses = asignacionesDeProfesor
    .map((a: any) =>
      mapearCurso(a, cursoById, carreraById, profesor.departamento, {
        ...groupParams,
        profesorId: profesor.id,
      })
    )
    .filter(Boolean)

  return {
    id: profesor.id,
    name: `${nombre} ${apellido}`.trim(),
    email,
    department: departamentoListado(profesor, courses),
    courses,
  }
}

function armarListadoProfesores(params: {
  user: UsuarioListado
  profesores: any[]
  asignaciones: any[]
  cursos: any[]
  carreras: any[]
  gruposPorAsignaciones: any[]
  gruposDeEstudiante: any[]
}) {
  const cursoById = new Map((params.cursos || []).map((c: any) => [c.id, c]))
  const carreraById = new Map((params.carreras || []).map((c: any) => [c.id, c]))
  const indices = indexarAsignaciones(params.asignaciones, params.gruposPorAsignaciones)
  const groupParams = {
    esEstudiante: esEstudiante(params.user),
    gruposDeEstudiante: params.gruposDeEstudiante,
    gruposByProfesorCurso: indices.gruposByProfesorCurso,
  }

  return (params.profesores || []).map((profesor: any) =>
    mapearProfesorListado(profesor, indices, cursoById, carreraById, groupParams)
  )
}

export async function listarProfesoresConCursos(user: UsuarioListado) {
  const alcance = await alcancePorEstudiante(user)
  if (alcance.vacio) return []

  const profesores = await cargarProfesoresActivos(alcance.profesorIdsFiltro)
  const asignaciones = await cargarAsignacionesNormalizadas((profesores || []).map((p: any) => p.id))
  const gruposPorAsignaciones = await cargarGruposDeAsignaciones(asignaciones)
  const carreras = await cargarCarrerasDeCursos([])
  const cursos = await cargarCursosSiFaltan(asignaciones, [])

  return armarListadoProfesores({
    user,
    profesores,
    asignaciones,
    cursos,
    carreras,
    gruposPorAsignaciones,
    gruposDeEstudiante: alcance.grupos,
  })
}
