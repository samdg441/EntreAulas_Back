import { SupabaseDB } from '../../config/supabase-only'

export type GrupoConProfesor = {
  id: number
  cursoNombre: string
  cursoCodigo: string
  grupo: string
  profesorNombre: string
}

/**
 * Lista grupos activos de una carrera con curso y profesor asignado.
 * Compartido entre coordinador (su carrera) y admin (carrera elegida).
 */
export async function listGruposConProfesorByCareer(
  carreraId: number
): Promise<GrupoConProfesor[]> {
  const { data: cursos, error: cursosError } = await SupabaseDB.supabaseAdmin
    .from('cursos')
    .select('id, nombre, codigo')
    .eq('carrera_id', carreraId)
    .eq('activo', true)

  if (cursosError) {
    throw Object.assign(new Error(cursosError.message), { code: 'CURSOS_ERROR' })
  }

  const cursoIds = (cursos || []).map((c: { id: number }) => c.id).filter(Boolean)
  if (cursoIds.length === 0) return []

  const { data: grupos, error: gruposError } = await SupabaseDB.supabaseAdmin
    .from('grupos')
    .select('id, curso_id, numero_grupo')
    .in('curso_id', cursoIds)
    .eq('activo', true)

  if (gruposError) {
    throw Object.assign(new Error(gruposError.message), { code: 'GRUPOS_ERROR' })
  }

  const gruposList = grupos || []
  if (gruposList.length === 0) return []

  const grupoIds = gruposList.map((g: { id: number }) => g.id)
  const cursoById = new Map((cursos || []).map((c: { id: number }) => [c.id, c]))

  const { data: asignaciones, error: asigError } = await SupabaseDB.supabaseAdmin
    .from('asignaciones_profesor')
    .select('id, grupo_id, profesor_id, curso_id')
    .in('grupo_id', grupoIds)
    .eq('activa', true)

  if (asigError) {
    throw Object.assign(new Error(asigError.message), { code: 'ASIG_ERROR' })
  }

  const asignacionByGrupoId = new Map<number, { profesor_id: string }>()
  ;(asignaciones || []).forEach((a: { grupo_id: number; profesor_id: string }) => {
    asignacionByGrupoId.set(Number(a.grupo_id), a)
  })

  const profesorIds = Array.from(
    new Set((asignaciones || []).map((a: { profesor_id: string }) => a.profesor_id).filter(Boolean))
  )

  const profesorById = new Map<string, string>()
  if (profesorIds.length > 0) {
    const { data: profesores, error: profError } = await SupabaseDB.supabaseAdmin
      .from('profesores')
      .select('id, usuario:usuarios(nombre, apellido)')
      .in('id', profesorIds)

    if (profError) {
      console.error('Error profesores en listGruposConProfesorByCareer:', profError)
    }

    ;(profesores || []).forEach((p: any) => {
      const u = Array.isArray(p.usuario) ? p.usuario[0] : p.usuario
      const nombre =
        [u?.nombre, u?.apellido].filter(Boolean).join(' ').trim() || 'Docente'
      profesorById.set(p.id, nombre)
    })
  }

  return gruposList.map((g: { id: number; curso_id: number; numero_grupo?: number }) => {
    const curso = cursoById.get(g.curso_id) as { nombre?: string; codigo?: string } | undefined
    const asig = asignacionByGrupoId.get(g.id)
    const profesorNombre = asig
      ? profesorById.get(asig.profesor_id) || 'Docente'
      : 'Sin asignar'
    return {
      id: g.id,
      cursoNombre: curso?.nombre ?? 'Curso',
      cursoCodigo: curso?.codigo ?? '',
      grupo: String(g.numero_grupo ?? g.id),
      profesorNombre,
    }
  })
}
