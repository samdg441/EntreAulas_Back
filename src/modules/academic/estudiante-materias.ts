/**
 * RF-ACA-27 / RQ27 — Relación estudiante–materia.
 *
 * Lo llama GET /teachers/student-enrolled-subjects después de autenticar
 * y de consultar `estudiantes` + `inscripciones`.
 */

type Relacion<T> = T | T[] | null | undefined

export type PeriodoMateria = {
  id: unknown
  nombre: string | null
  codigo: string | null
}

export type MateriaMatriculada = {
  id: unknown
  grupo: {
    id: unknown
    numeroGrupo: unknown
    horario: unknown
    aula: unknown
    curso: {
      id: unknown
      nombre: unknown
      codigo: unknown
      creditos: unknown
    }
    profesor: { id: unknown; nombre: string }
    periodo: PeriodoMateria
  }
}

export type ResultadoMaterias = {
  ok: boolean
  status: 200 | 401 | 403
  error?: string
  data?: { materiasMatriculadas: MateriaMatriculada[]; total: number }
}

const LISTA_VACIA = { materiasMatriculadas: [] as MateriaMatriculada[], total: 0 }

export function esEstudiante(tipoUsuario?: string): boolean {
  return String(tipoUsuario || '').toLowerCase() === 'estudiante'
}

export function etiquetaPeriodo(periodo?: {
  id?: unknown
  ano?: unknown
  semestre?: unknown
  nombre?: unknown
  codigo?: unknown
} | null): PeriodoMateria {
  if (!periodo) {
    return { id: null, nombre: null, codigo: null }
  }
  const codigoExistente = texto(periodo.codigo)
  const codigo =
    codigoExistente ||
    (periodo.ano != null && periodo.semestre != null ? `${periodo.ano}-${periodo.semestre}` : '')
  const nombreExistente = texto(periodo.nombre)
  return {
    id: periodo.id ?? null,
    nombre: nombreExistente || (codigo ? `Periodo ${codigo}` : null),
    codigo: codigo || null,
  }
}

export function decidirRelacionEstudianteMateria(params: {
  autenticado: boolean
  tipoUsuario?: string
  perfilEstudiante: boolean
  errorConsulta?: boolean
  errorInterno?: boolean
  inscripciones?: unknown[] | null
}): ResultadoMaterias {
  if (!params.autenticado) {
    return { ok: false, status: 401, error: 'Token de acceso requerido' }
  }
  if (!esEstudiante(params.tipoUsuario)) {
    return {
      ok: false,
      status: 403,
      error: 'Solo los estudiantes pueden acceder a esta información',
    }
  }
  if (!params.perfilEstudiante || params.errorConsulta || params.errorInterno) {
    return { ok: true, status: 200, data: { ...LISTA_VACIA } }
  }
  const materiasMatriculadas = formatearMateriasMatriculadas(params.inscripciones)
  return {
    ok: true,
    status: 200,
    data: { materiasMatriculadas, total: materiasMatriculadas.length },
  }
}

export function formatearMateriasMatriculadas(
  inscripciones: unknown[] | null | undefined
): MateriaMatriculada[] {
  return (inscripciones ?? [])
    .map((fila) => formatearInscripcion(fila))
    .filter((materia): materia is MateriaMatriculada => materia !== null)
}

function formatearInscripcion(fila: unknown): MateriaMatriculada | null {
  const inscripcion = asRecord(fila)
  if (!inscripcion) return null
  const grupo = uno(inscripcion.grupo as Relacion<Record<string, unknown>>)
  const curso = uno(grupo?.curso as Relacion<Record<string, unknown>>)
  if (!curso?.id) return null

  const asignacion = uno(
    grupo?.asignaciones_profesor as Relacion<Record<string, unknown>>
  )
  const profesor = uno(asignacion?.profesor as Relacion<Record<string, unknown>>)
  const usuario = uno(profesor?.usuario as Relacion<Record<string, unknown>>)
  const periodo = uno(grupo?.periodo as Relacion<Record<string, unknown>>)

  return {
    id: inscripcion.id,
    grupo: {
      id: grupo?.id,
      numeroGrupo: grupo?.numero_grupo,
      horario: grupo?.horario,
      aula: grupo?.aula,
      curso: {
        id: curso.id,
        nombre: curso.nombre,
        codigo: curso.codigo,
        creditos: curso.creditos,
      },
      profesor: {
        id: profesor?.id ?? null,
        nombre: nombrePersona(usuario),
      },
      periodo: etiquetaPeriodo(periodo),
    },
  }
}

function uno<T>(valor: Relacion<T>): T | undefined {
  if (Array.isArray(valor)) return valor[0]
  return valor ?? undefined
}

function asRecord(valor: unknown): Record<string, unknown> | null {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return null
  return valor as Record<string, unknown>
}

function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor.trim() : ''
}

function nombrePersona(usuario?: Record<string, unknown>): string {
  return `${texto(usuario?.nombre)} ${texto(usuario?.apellido)}`.trim()
}
