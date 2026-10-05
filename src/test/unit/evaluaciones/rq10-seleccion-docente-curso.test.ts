import { beforeEach, describe, expect, it, vi } from 'vitest'

const teachersRepository = vi.hoisted(() => ({
  listActiveWithUsuario: vi.fn(),
  findActiveProfessor: vi.fn(),
  findUsuarioId: vi.fn(),
}))

const academicRepository = vi.hoisted(() => ({
  findEstudianteByUsuarioId: vi.fn(),
  listInscripcionesActivas: vi.fn(),
  listGruposByIdsFlexible: vi.fn(),
  listAsignacionesByGrupoIds: vi.fn(),
  listAsignacionesByIds: vi.fn(),
  listAsignacionesByProfesorIds: vi.fn(),
  listGruposByIds: vi.fn(),
  listCarrerasByIds: vi.fn(),
  listCursosByIds: vi.fn(),
  listAsignacionesByProfesorAndCurso: vi.fn(),
  listGruposByCurso: vi.fn(),
}))

vi.mock('../../../modules/academic/teachers.repository', () => ({ teachersRepository }))
vi.mock('../../../modules/academic/academic.repository', () => ({ academicRepository }))

import { cursosSinRepetir, listarProfesoresConCursos } from '../../../modules/academic/listado-profesores'
import { teachersService } from '../../../modules/academic/teachers.service'

/** Datos reales del profesor 13: cada grupo es una asignación distinta (2 cursos × 2 grupos). */
const ASIGNACIONES = [
  { id: 22, profesor_id: 13, curso_id: 12, grupo_id: 63 },
  { id: 23, profesor_id: 13, curso_id: 12, grupo_id: 64 },
  { id: 35, profesor_id: 13, curso_id: 51, grupo_id: 76 },
  { id: 36, profesor_id: 13, curso_id: 51, grupo_id: 77 },
  { id: 90, profesor_id: 20, curso_id: 30, grupo_id: 90 },
]
const GRUPOS = [
  { id: 63, curso_id: 12, numero_grupo: 61 },
  { id: 64, curso_id: 12, numero_grupo: 62 },
  { id: 76, curso_id: 51, numero_grupo: 61 },
  { id: 77, curso_id: 51, numero_grupo: 63 },
  { id: 90, curso_id: 30, numero_grupo: 1 },
]
const CURSOS = [
  { id: 12, nombre: 'ESTRUCTURAS DE DATOS DINÁMICAS', codigo: 'CM00307983' },
  { id: 51, nombre: 'ANÁLISIS Y DISEÑO DE ALGORITMOS', codigo: 'CM00407986' },
  { id: 30, nombre: 'MATEMÁTICAS DISCRETAS', codigo: 'MT00203066' },
]
const PROFESORES = [
  { id: 13, usuario: { nombre: 'JOHNATHAN MAURICIO', apellido: 'CALLE GALLEGO', email: 'jcalle@udem.edu.co' } },
  { id: 20, usuario: { nombre: 'GILDARDO', apellido: 'ORREGO', email: 'gorrego@udem.edu.co' } },
]

const estudiante = { id: 'u-est', tipo_usuario: 'estudiante' }
const admin = { id: 'u-admin', tipo_usuario: 'admin' }

function sembrarListado() {
  teachersRepository.listActiveWithUsuario.mockResolvedValue(PROFESORES)
  academicRepository.listAsignacionesByProfesorIds.mockResolvedValue(ASIGNACIONES)
  academicRepository.listGruposByIds.mockResolvedValue(GRUPOS)
  academicRepository.listCursosByIds.mockResolvedValue(CURSOS)
}

function sembrarEstudianteInscritoEn(grupoIds: number[]) {
  academicRepository.findEstudianteByUsuarioId.mockResolvedValue({ id: 'est-1' })
  academicRepository.listInscripcionesActivas.mockResolvedValue(grupoIds.map((grupo_id) => ({ grupo_id })))
  academicRepository.listGruposByIdsFlexible.mockResolvedValue(
    GRUPOS.filter((g) => grupoIds.includes(g.id)).map((g) => ({ ...g, profesor_id: null }))
  )
  academicRepository.listAsignacionesByGrupoIds.mockResolvedValue(
    ASIGNACIONES.filter((a) => grupoIds.includes(a.grupo_id))
  )
}

const resumen = (listado: any[]) =>
  listado.map((p) => ({
    id: p.id,
    cursos: p.courses.map((c: any) => ({ id: c.id, grupos: c.groups.map((g: any) => g.numero) })),
  }))

describe('RQ10 — Selección de docente y curso para evaluar', () => {
  beforeEach(() => {
    Object.values(teachersRepository).forEach((fn) => fn.mockReset())
    Object.values(academicRepository).forEach((fn) => fn.mockReset())
  })

  it('el estudiante ve cada curso una sola vez y solo con el grupo en el que está inscrito', async () => {
    sembrarListado()
    sembrarEstudianteInscritoEn([63, 77])

    const listado = await listarProfesoresConCursos(estudiante)

    expect(resumen(listado)).toEqual([
      {
        id: 13,
        cursos: [
          { id: 12, grupos: [61] },
          { id: 51, grupos: [63] },
        ],
      },
    ])
  })

  it('un docente sin cursos del estudiante no aparece en su lista', async () => {
    sembrarListado()
    sembrarEstudianteInscritoEn([63])

    const listado = await listarProfesoresConCursos(estudiante)

    expect(listado.map((p: any) => p.id)).toEqual([13])
    expect(resumen(listado)[0].cursos).toEqual([{ id: 12, grupos: [61] }])
  })

  it('fuera del rol estudiante, el curso sale una vez con todos sus grupos juntos', async () => {
    sembrarListado()

    const listado = await listarProfesoresConCursos(admin)

    expect(academicRepository.findEstudianteByUsuarioId).not.toHaveBeenCalled()
    expect(resumen(listado)).toEqual([
      {
        id: 13,
        cursos: [
          { id: 12, grupos: [61, 62] },
          { id: 51, grupos: [61, 63] },
        ],
      },
      { id: 20, cursos: [{ id: 30, grupos: [1] }] },
    ])
  })

  it('cursosSinRepetir une grupos sin duplicarlos y no modifica la entrada', () => {
    const entrada = [
      { id: 12, name: 'ED', groups: [{ id: 63, numero: 61 }] },
      { id: '12', name: 'ED', groups: [{ id: 63, numero: 61 }, { id: 64, numero: 62 }] },
      { id: 51, name: 'ADA', groups: [] },
    ]

    const salida = cursosSinRepetir(entrada)

    expect(salida.map((c) => [c.id, c.groups.map((g: any) => g.id)])).toEqual([
      [12, [63, 64]],
      [51, []],
    ])
    expect(entrada[0].groups).toHaveLength(1)
  })

  describe('grupos del curso elegido', () => {
    beforeEach(() => {
      teachersRepository.findActiveProfessor.mockResolvedValue({ id: 13 })
      academicRepository.listAsignacionesByProfesorAndCurso.mockResolvedValue(
        ASIGNACIONES.filter((a) => a.curso_id === 51)
      )
      academicRepository.listGruposByIds.mockResolvedValue(GRUPOS.filter((g) => g.curso_id === 51))
    })

    it('al estudiante solo le devuelve los grupos donde está inscrito', async () => {
      academicRepository.findEstudianteByUsuarioId.mockResolvedValue({ id: 'est-1' })
      academicRepository.listInscripcionesActivas.mockResolvedValue([{ grupo_id: 77 }, { grupo_id: 63 }])

      const grupos = await teachersService.listGroups('13', '51', estudiante)

      expect(grupos.map((g: any) => g.numero_grupo)).toEqual([63])
    })

    it('si el usuario no tiene perfil de estudiante no devuelve grupos', async () => {
      academicRepository.findEstudianteByUsuarioId.mockResolvedValue(null)

      expect(await teachersService.listGroups('13', '51', estudiante)).toEqual([])
    })

    it('para otros roles devuelve todos los grupos del docente en el curso', async () => {
      const grupos = await teachersService.listGroups('13', '51', admin)

      expect(grupos.map((g: any) => g.numero_grupo)).toEqual([61, 63])
      expect(academicRepository.listInscripcionesActivas).not.toHaveBeenCalled()
    })
  })
})
