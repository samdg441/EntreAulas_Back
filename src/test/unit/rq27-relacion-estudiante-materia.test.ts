import { describe, expect, it } from 'vitest'
import {
  decidirRelacionEstudianteMateria,
  esEstudiante,
  etiquetaPeriodo,
  formatearMateriasMatriculadas,
} from '../../modules/academic/estudiante-materias'

/**
 * RQ27 / RF-ACA-27 — Relación estudiante–materia
 * (GET /api/teachers/student-enrolled-subjects)
 *
 * C1  No autenticado → 401
 * C2  No es estudiante → 403
 * C3  Profesor / admin no listan materias → 403
 * C4  Sin fila en estudiantes → 200 lista vacía
 * C5  Error de consulta → 200 lista vacía
 * C6  Excepción no controlada → 200 lista vacía
 * C7  Camino feliz: inscripciones activas con curso, profesor y periodo
 * C8  Inscripción sin curso se descarta
 * C9  Periodo se arma con ano + semestre (schema real)
 * C10 Relación anidada como objeto (no arreglo) también mapea
 */

const ROLES_NO_ESTUDIANTE = ['profesor', 'docente', 'coordinador', 'admin', 'decano'] as const

const inscripcionProgramacion = {
  id: 11,
  grupo: {
    id: 21,
    numero_grupo: 1,
    horario: 'Lun 8-10',
    aula: 'A-101',
    curso: { id: 31, nombre: 'Programación I', codigo: 'SIS-101', creditos: 3 },
    asignaciones_profesor: [
      {
        profesor: {
          id: 'prof-1',
          usuario: { nombre: 'Ana', apellido: 'Pérez' },
        },
      },
    ],
    periodo: { id: 41, ano: 2026, semestre: 1 },
  },
}

const inscripcionFisica = {
  id: 12,
  grupo: {
    id: 22,
    numero_grupo: 2,
    horario: 'Mar 10-12',
    aula: 'B-202',
    curso: { id: 32, nombre: 'Física II', codigo: 'FIS-201', creditos: 4 },
    asignaciones_profesor: {
      profesor: {
        id: 'prof-2',
        usuario: { nombre: 'Luis', apellido: 'Gómez' },
      },
    },
    periodo: { id: 41, ano: 2026, semestre: 1 },
  },
}

const inscripcionSinCurso = {
  id: 13,
  grupo: { id: 23, numero_grupo: 3, curso: null },
}

class RQ27RelacionEstudianteMateria {
  C1_noAutenticado() {
    const r = decidirRelacionEstudianteMateria({
      autenticado: false,
      tipoUsuario: 'estudiante',
      perfilEstudiante: true,
    })
    expect(r.ok).toBe(false)
    expect(r.status).toBe(401)
    expect(r.error).toMatch(/token/i)
    expect(r.data).toBeUndefined()
  }

  C2_noEsEstudiante() {
    expect(esEstudiante('admin')).toBe(false)
    expect(esEstudiante('estudiante')).toBe(true)
    expect(esEstudiante('Estudiante')).toBe(true)
    const r = decidirRelacionEstudianteMateria({
      autenticado: true,
      tipoUsuario: 'admin',
      perfilEstudiante: true,
    })
    expect(r.status).toBe(403)
    expect(r.error).toMatch(/estudiantes/i)
  }

  C3_otrosRolesNoListan() {
    for (const rol of ROLES_NO_ESTUDIANTE) {
      const r = decidirRelacionEstudianteMateria({
        autenticado: true,
        tipoUsuario: rol,
        perfilEstudiante: true,
        inscripciones: [inscripcionProgramacion],
      })
      expect(r.status).toBe(403)
      expect(r.data).toBeUndefined()
    }
  }

  C4_sinPerfilEstudiante() {
    const r = decidirRelacionEstudianteMateria({
      autenticado: true,
      tipoUsuario: 'estudiante',
      perfilEstudiante: false,
    })
    expect(r.ok).toBe(true)
    expect(r.status).toBe(200)
    expect(r.data).toEqual({ materiasMatriculadas: [], total: 0 })
  }

  C5_errorConsulta() {
    const r = decidirRelacionEstudianteMateria({
      autenticado: true,
      tipoUsuario: 'estudiante',
      perfilEstudiante: true,
      errorConsulta: true,
      inscripciones: [inscripcionProgramacion],
    })
    expect(r.status).toBe(200)
    expect(r.data).toEqual({ materiasMatriculadas: [], total: 0 })
  }

  C6_errorInterno() {
    const r = decidirRelacionEstudianteMateria({
      autenticado: true,
      tipoUsuario: 'estudiante',
      perfilEstudiante: true,
      errorInterno: true,
    })
    expect(r.status).toBe(200)
    expect(r.data?.total).toBe(0)
  }

  C7_caminoFeliz() {
    const r = decidirRelacionEstudianteMateria({
      autenticado: true,
      tipoUsuario: 'estudiante',
      perfilEstudiante: true,
      inscripciones: [inscripcionProgramacion, inscripcionFisica],
    })
    expect(r.ok).toBe(true)
    expect(r.status).toBe(200)
    expect(r.data?.total).toBe(2)
    expect(r.data?.materiasMatriculadas[0]).toMatchObject({
      id: 11,
      grupo: {
        numeroGrupo: 1,
        curso: { codigo: 'SIS-101', nombre: 'Programación I' },
        profesor: { nombre: 'Ana Pérez' },
        periodo: { codigo: '2026-1', nombre: 'Periodo 2026-1' },
      },
    })
    expect(r.data?.materiasMatriculadas[1].grupo.profesor.nombre).toBe('Luis Gómez')
  }

  C8_sinCursoSeDescarta() {
    const lista = formatearMateriasMatriculadas([
      inscripcionProgramacion,
      inscripcionSinCurso,
      { id: 99, grupo: null },
    ])
    expect(lista).toHaveLength(1)
    expect(lista[0].id).toBe(11)
  }

  C9_periodoDesdeAnoSemestre() {
    expect(etiquetaPeriodo({ id: 1, ano: 2026, semestre: 2 })).toEqual({
      id: 1,
      codigo: '2026-2',
      nombre: 'Periodo 2026-2',
    })
    expect(etiquetaPeriodo({ id: 2, nombre: '2025-2', codigo: '2025-2' })).toEqual({
      id: 2,
      codigo: '2025-2',
      nombre: '2025-2',
    })
    expect(etiquetaPeriodo(null)).toEqual({ id: null, nombre: null, codigo: null })
    expect(etiquetaPeriodo({ id: 9 })).toEqual({ id: 9, nombre: null, codigo: null })
  }

  C10_relacionComoObjeto() {
    const lista = formatearMateriasMatriculadas([inscripcionFisica])
    expect(lista[0].grupo.curso.codigo).toBe('FIS-201')
    expect(lista[0].grupo.profesor.id).toBe('prof-2')
  }
}

const pruebas = new RQ27RelacionEstudianteMateria()

describe('RQ27 / RF-ACA-27 — Relación estudiante–materia', () => {
  it('C1: no autenticado → 401', () => pruebas.C1_noAutenticado())
  it('C2: no es estudiante → 403', () => pruebas.C2_noEsEstudiante())
  it('C3: otros roles no listan materias → 403', () => pruebas.C3_otrosRolesNoListan())
  it('C4: sin perfil de estudiante → 200 vacío', () => pruebas.C4_sinPerfilEstudiante())
  it('C5: error de consulta → 200 vacío', () => pruebas.C5_errorConsulta())
  it('C6: error interno → 200 vacío', () => pruebas.C6_errorInterno())
  it('C7: camino feliz con materias', () => pruebas.C7_caminoFeliz())
  it('C8: inscripción sin curso se descarta', () => pruebas.C8_sinCursoSeDescarta())
  it('C9: periodo con ano y semestre', () => pruebas.C9_periodoDesdeAnoSemestre())
  it('C10: relación anidada como objeto', () => pruebas.C10_relacionComoObjeto())
})
