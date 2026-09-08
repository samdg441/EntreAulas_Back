import { supabaseAdmin } from '../../config/supabase-only'
import { SupabaseDB } from '../../config/supabase-only'

export class AcademicRepository {
  async listUsersSummary() {
    return SupabaseDB.listUsersSummary()
  }

  async updateUser(
    id: string,
    updates: Partial<{
      email: string
      nombre: string
      apellido: string
      tipo_usuario: string
      activo: boolean
    }>
  ) {
    return SupabaseDB.updateUser(id, updates)
  }

  async getCoursesByCareer(careerId: string | number) {
    const { data, error } = await supabaseAdmin
      .from('cursos')
      .select(`
        id,
        nombre,
        codigo,
        creditos,
        descripcion,
        activo,
        carrera_id,
        carreras:carreras(
          id,
          nombre,
          codigo
        )
      `)
      .eq('carrera_id', careerId)
      .order('nombre')

    if (error) throw error
    return data || []
  }

  /** Facultades con sus carreras (consulta de estructura universitaria). */
  async getAcademicStructure() {
    const { data: facultades, error: facError } = await supabaseAdmin
      .from('facultades')
      .select('id, nombre, codigo, descripcion')
      .order('nombre')

    if (facError) throw facError

    // Schema real: carreras no tiene `codigo` (sí nombre, descripcion, facultad_id, activa)
    const { data: carreras, error: carError } = await supabaseAdmin
      .from('carreras')
      .select('id, nombre, descripcion, facultad_id, activa')
      .order('nombre')

    if (carError) throw carError

    const byFacultad = new Map<number, NonNullable<typeof carreras>>()
    for (const c of carreras || []) {
      const fid = Number(c.facultad_id)
      if (!byFacultad.has(fid)) byFacultad.set(fid, [])
      byFacultad.get(fid)!.push(c)
    }

    return (facultades || []).map((f) => ({
      id: f.id,
      nombre: f.nombre,
      codigo: f.codigo,
      descripcion: f.descripcion,
      carreras: (byFacultad.get(Number(f.id)) || []).map((c) => ({
        id: c.id,
        nombre: c.nombre,
        descripcion: c.descripcion,
        facultad_id: c.facultad_id,
        activa: c.activa,
      })),
    }))
  }

  async getDashboardStats() {
    const [usersRes, facultadesRes, carrerasRes] = await Promise.all([
      supabaseAdmin.from('usuarios').select('id', { count: 'exact', head: true }),
      supabaseAdmin.from('facultades').select('id', { count: 'exact', head: true }),
      supabaseAdmin.from('carreras').select('id', { count: 'exact', head: true }).eq('activa', true),
    ])

    if (usersRes.error) throw usersRes.error
    if (facultadesRes.error) throw facultadesRes.error
    if (carrerasRes.error) throw carrerasRes.error

    return {
      totalUsers: usersRes.count ?? 0,
      totalFacultades: facultadesRes.count ?? 0,
      totalCarreras: carrerasRes.count ?? 0,
    }
  }

  async getCareers() {
    return SupabaseDB.getCareers()
  }

  async getProfessors() {
    return SupabaseDB.getProfessors()
  }

  async findEstudianteByUsuarioId(usuarioId: string) {
    const { data, error } = await supabaseAdmin
      .from('estudiantes')
      .select('id')
      .eq('usuario_id', usuarioId)
      .single()

    if (error && error.code !== 'PGRST116') throw error
    return data as { id: string } | null
  }

  async findUsuarioById(id: string, columns = 'id, nombre, apellido, email, tipo_usuario, activo') {
    const { data, error } = await supabaseAdmin.from('usuarios').select(columns).eq('id', id).single()
    return { data, error }
  }

  async listInscripcionesActivas(estudianteId: string, columns = 'grupo_id') {
    const { data, error } = await supabaseAdmin
      .from('inscripciones')
      .select(columns)
      .eq('estudiante_id', estudianteId)
      .eq('activa', true)

    if (error) throw error
    return data || []
  }

  async listInscripcionesDetalladas(estudianteId: string) {
    const { data, error } = await supabaseAdmin
      .from('inscripciones')
      .select(`
        id,
        grupo:grupos(
          id,
          numero_grupo,
          horario,
          aula,
          curso:cursos(
            id,
            nombre,
            codigo,
            creditos
          ),
          asignaciones_profesor:asignaciones_profesor(
            profesor:profesores(
              id,
              usuario:usuarios(
                nombre,
                apellido
              )
            )
          ),
          periodo:periodos_academicos(
            id,
            ano,
            semestre
          )
        )
      `)
      .eq('estudiante_id', estudianteId)
      .eq('activa', true)
    if (error) throw error
    return data || []
  }

  async listInscripcionesByGrupoIds(grupoIds: Array<string | number>, columns = 'id, grupo_id') {
    const useIds = grupoIds.length ? grupoIds : [-1]
    const { data, error } = await supabaseAdmin
      .from('inscripciones')
      .select(columns)
      .in('grupo_id', useIds)
    if (error) throw error
    return data || []
  }

  async findEstudianteInfoByUsuarioId(usuarioId: string) {
    const { data, error } = await supabaseAdmin
      .from('estudiantes')
      .select(`
        id,
        carrera_id,
        carrera:carreras(id, nombre)
      `)
      .eq('usuario_id', usuarioId)
      .single()

    if (error && error.code !== 'PGRST116') throw error
    return data
  }

  async findInscripcion(estudianteId: string, grupoId: number) {
    const { data, error } = await supabaseAdmin
      .from('inscripciones')
      .select('id, activa')
      .eq('estudiante_id', estudianteId)
      .eq('grupo_id', grupoId)
      .maybeSingle()

    if (error) throw error
    return data
  }

  async reactivateInscripcion(id: string | number) {
    const { error } = await supabaseAdmin.from('inscripciones').update({ activa: true }).eq('id', id)
    if (error) throw error
  }

  async insertInscripcion(estudianteId: string, grupoId: number) {
    const first = await supabaseAdmin
      .from('inscripciones')
      .insert([{ estudiante_id: estudianteId, grupo_id: grupoId, activa: true }])
      .select('id')
      .maybeSingle()
    if (first.error && (first.error.code === '42703' || String(first.error.message || '').includes('activa'))) {
      const fallback = await supabaseAdmin
        .from('inscripciones')
        .insert([{ estudiante_id: estudianteId, grupo_id: grupoId }])
        .select('id')
        .maybeSingle()
      if (fallback.error) throw fallback.error
      return fallback.data
    }
    if (first.error) throw first.error
    return first.data
  }

  async listGruposByIds(ids: Array<string | number>, columns = 'id, curso_id, numero_grupo, horario, aula') {
    const useIds = ids.length ? ids : [-1]
    const { data, error } = await supabaseAdmin.from('grupos').select(columns).in('id', useIds)
    if (error) throw error
    return data || []
  }

  async listGruposByIdsFlexible(ids: Array<string | number>) {
    const useIds = ids.length ? ids : [-1]
    const full = await supabaseAdmin
      .from('grupos')
      .select('id, curso_id, profesor_id, asignacion_profesor_id')
      .in('id', useIds)
    if (full.error && (full.error.code === '42703' || String(full.error.message || '').includes('column'))) {
      const slim = await supabaseAdmin.from('grupos').select('id, curso_id').in('id', useIds)
      if (slim.error) throw slim.error
      return slim.data || []
    }
    if (full.error) throw full.error
    return full.data || []
  }

  async listGruposActivosByCursoIds(cursoIds: Array<string | number>) {
    const { data, error } = await supabaseAdmin
      .from('grupos')
      .select('id, curso_id, numero_grupo')
      .in('curso_id', cursoIds.length ? cursoIds : [-1])
      .eq('activo', true)
    if (error) throw error
    return data || []
  }

  async listGruposByCurso(cursoId: string | number, extraColumns = '') {
    const cols = extraColumns
      ? `id, numero_grupo, horario, aula, curso_id, ${extraColumns}`
      : 'id, numero_grupo, horario, aula, curso_id'
    const { data, error } = await supabaseAdmin.from('grupos').select(cols).eq('curso_id', cursoId)
    if (error) throw error
    return data || []
  }

  async listCursosByIds(ids: Array<string | number>, columns = 'id, nombre, codigo, creditos, descripcion, carrera_id') {
    const useIds = ids.length ? ids : [-1]
    const { data, error } = await supabaseAdmin.from('cursos').select(columns).in('id', useIds)
    if (error) throw error
    return data || []
  }

  async listCursosActivosByCareer(carreraId: string | number, columns = 'id') {
    const { data, error } = await supabaseAdmin
      .from('cursos')
      .select(columns)
      .eq('carrera_id', carreraId)
      .eq('activo', true)
    if (error) throw error
    return data || []
  }

  async listCursosByCareer(carreraId: string | number, columns = 'id, nombre, codigo, carrera_id') {
    const { data, error } = await supabaseAdmin
      .from('cursos')
      .select(columns)
      .eq('carrera_id', carreraId)
    if (error) throw error
    return data || []
  }

  async listCursosActivosInCareer(carreraId: string | number, cursoIds: Array<string | number>) {
    const { data, error } = await supabaseAdmin
      .from('cursos')
      .select('id')
      .eq('carrera_id', carreraId)
      .eq('activo', true)
      .in('id', cursoIds.length ? cursoIds : [-1])
    if (error) throw error
    return data || []
  }

  async getCarreraById(id: string | number, columns = 'id, nombre, codigo, activa, descripcion') {
    const { data, error } = await supabaseAdmin.from('carreras').select(columns).eq('id', id).single()
    if (error && error.code !== 'PGRST116') throw error
    return data
  }

  async listCarrerasByIds(ids: Array<string | number>, columns = 'id, nombre') {
    if (!ids.length) return []
    const { data, error } = await supabaseAdmin.from('carreras').select(columns).in('id', ids)
    if (error) throw error
    return data || []
  }

  async listCarreras(
    columns = 'id, nombre',
    opts?: {
      activo?: boolean
      activa?: boolean
      excludeTroncoComun?: boolean
      orderByNombre?: boolean
    }
  ) {
    let query = supabaseAdmin.from('carreras').select(columns)
    if (opts?.activo) query = query.eq('activo', true)
    if (opts?.activa) query = query.eq('activa', true)
    if (opts?.excludeTroncoComun) {
      query = query.not('nombre', 'ilike', '%tronco común%').not('nombre', 'ilike', '%tronco comun%')
    }
    if (opts?.orderByNombre) query = query.order('nombre')
    const { data, error } = await query
    if (error) throw error
    return data || []
  }

  async listGruposSample(limit = 10, columns = 'id, numero_grupo, curso_id, profesor_id') {
    const { data, error } = await supabaseAdmin.from('grupos').select(columns).limit(limit)
    if (error) throw error
    return data || []
  }

  async listPeriodosByIds(ids: Array<string | number>, columns = 'id, nombre, codigo') {
    if (!ids.length) return []
    const { data, error } = await supabaseAdmin.from('periodos_academicos').select(columns).in('id', ids)
    if (error) throw error
    return data || []
  }

  async listAsignacionesByGrupoIds(grupoIds: Array<string | number>) {
    let resp = await supabaseAdmin
      .from('asignaciones_profesor')
      .select('id, grupo_id, profesor_id, curso_id')
      .in('grupo_id', grupoIds)
    if (resp.error) {
      resp = await supabaseAdmin
        .from('cursos_profesor')
        .select('id, grupo_id, profesor_id, curso_id')
        .in('grupo_id', grupoIds)
    }
    if (resp.error) throw resp.error
    return resp.data || []
  }

  async listAsignacionesActivasByGrupoIds(grupoIds: Array<string | number>) {
    const resp = await supabaseAdmin
      .from('asignaciones_profesor')
      .select('id, grupo_id, profesor_id, curso_id')
      .in('grupo_id', grupoIds)
      .eq('activa', true)
    if (resp.error) throw resp.error
    return resp.data || []
  }

  async listAsignacionesByIds(ids: Array<string | number>) {
    const { data, error } = await supabaseAdmin
      .from('asignaciones_profesor')
      .select('id, profesor_id, curso_id')
      .in('id', ids)
    if (error) throw error
    return data || []
  }

  async listAsignacionesByProfesorIds(profesorIds: Array<string | number>) {
    const ids = profesorIds.length ? profesorIds : ['00000000-0000-0000-0000-000000000000']
    const primary = await supabaseAdmin.from('asignaciones_profesor').select('*').in('profesor_id', ids)
    if (!primary.error) return primary.data || []
    const fallback = await supabaseAdmin.from('cursos_profesor').select('*').in('profesor_id', ids)
    if (fallback.error) throw fallback.error
    return fallback.data || []
  }

  async listAsignacionesByProfesorAndCurso(profesorId: string, cursoId: string | number) {
    const { data, error } = await supabaseAdmin
      .from('asignaciones_profesor')
      .select('id, profesor_id, curso_id, grupo_id, activa')
      .eq('profesor_id', profesorId)
      .eq('curso_id', cursoId)
      .eq('activa', true)
    if (error) throw error
    return data || []
  }

  async listAsignacionesByProfesorAndCursoAll(profesorId: string, cursoId: string | number) {
    const { data, error } = await supabaseAdmin
      .from('asignaciones_profesor')
      .select('id, profesor_id, curso_id, activa')
      .eq('profesor_id', profesorId)
      .eq('curso_id', cursoId)
    if (error) throw error
    return data || []
  }

  async listAsignacionesConCursos(profesorIds: Array<string | number>) {
    const ids = profesorIds.length ? profesorIds : ['00000000-0000-0000-0000-000000000000']
    const { data, error } = await supabaseAdmin
      .from('asignaciones_profesor')
      .select(`
        id,
        profesor_id,
        curso_id,
        activa,
        cursos:cursos(id, nombre, codigo, carrera_id)
      `)
      .in('profesor_id', ids)
    if (error) throw error
    return data || []
  }

  async listAsignacionesConCursoCarrera(profesorId: string) {
    const { data, error } = await supabaseAdmin
      .from('asignaciones_profesor')
      .select(`
        id,
        profesor_id,
        curso_id,
        activa,
        cursos:cursos(
          id,
          nombre,
          codigo,
          creditos,
          descripcion,
          activo,
          carrera_id,
          carreras:carreras(
            id,
            nombre,
            codigo
          )
        )
      `)
      .eq('profesor_id', profesorId)
      .eq('activa', true)
    if (error) throw error
    return data || []
  }

  async listAsignacionesConCursoGrupo(profesorId: string) {
    const { data, error } = await supabaseAdmin
      .from('asignaciones_profesor')
      .select(`
        id,
        curso:cursos(
          id,
          nombre,
          codigo,
          creditos
        ),
        grupo:grupos(
          id,
          numero_grupo,
          horario,
          aula,
          periodo:periodos_academicos(
            id,
            nombre,
            codigo
          )
        )
      `)
      .eq('profesor_id', profesorId)
      .eq('activa', true)
    if (error) throw error
    return data || []
  }

  async findAsignacionByGrupo(grupoId: number) {
    const { data, error } = await supabaseAdmin
      .from('asignaciones_profesor')
      .select('id, profesor_id, curso_id, grupo_id')
      .eq('grupo_id', grupoId)
      .eq('activa', true)
      .maybeSingle()
    if (error && error.code !== 'PGRST116') throw error
    return data
  }

  get admin() {
    return supabaseAdmin
  }
}

export const academicRepository = new AcademicRepository()
