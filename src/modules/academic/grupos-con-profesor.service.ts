import { academicRepository } from './academic.repository'
import { teachersRepository } from './teachers.repository'
import { logger } from '../../shared/logger'

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
  const cursos = (await academicRepository.listCursosActivosByCareer(
    carreraId,
    'id, nombre, codigo'
  )) as unknown as Array<{ id: number; nombre?: string; codigo?: string }>
  const cursoIds = (cursos || []).map((c: { id: number }) => c.id).filter(Boolean)
  if (cursoIds.length === 0) return []

  const gruposList = (await academicRepository.listGruposActivosByCursoIds(cursoIds)) as Array<{
    id: number
    curso_id: number
    numero_grupo?: number
  }>
  if (gruposList.length === 0) return []

  const grupoIds = gruposList.map((g: { id: number }) => g.id)
  const cursoById = new Map((cursos || []).map((c: { id: number }) => [c.id, c]))

  const asignaciones = await academicRepository.listAsignacionesActivasByGrupoIds(grupoIds)
  const asignacionByGrupoId = new Map<number, { profesor_id: string }>()
  ;(asignaciones || []).forEach((a: { grupo_id: number; profesor_id: string }) => {
    asignacionByGrupoId.set(Number(a.grupo_id), a)
  })

  const profesorIds = Array.from(
    new Set((asignaciones || []).map((a: { profesor_id: string }) => a.profesor_id).filter(Boolean))
  )

  const profesorById = new Map<string, string>()
  if (profesorIds.length > 0) {
    try {
      const profesores = await teachersRepository.listByIdsWithUsuario(profesorIds)
      ;(profesores || []).forEach((p: any) => {
        const u = Array.isArray(p.usuario) ? p.usuario[0] : p.usuario
        const nombre =
          [u?.nombre, u?.apellido].filter(Boolean).join(' ').trim() || 'Docente'
        profesorById.set(p.id, nombre)
      })
    } catch (profError) {
      logger.error('Error profesores en listGruposConProfesorByCareer:', profError)
    }
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
