import { describe, expect, it } from 'vitest'
import {
  decidirRelacionEstudianteMateria,
  esEstudiante,
} from '../../modules/academic/estudiante-materias'

/**
 * RQ27 / RF-ACA-27 — Relación estudiante–materia
 * (GET /api/teachers/student-enrolled-subjects)
 *
 * C1  No autenticado → 401
 * C2  No es estudiante → 403
 * C3  Camino feliz: inscripción con curso
 */

const inscripcionProgramacion = {
  id: 11,
  grupo: {
    id: 21,
    numero_grupo: 1,
    horario: 'Lun 8-10',
    aula: 'A-101',
    curso: { id: 31, nombre: 'Programación I', codigo: 'SIS-101', creditos: 3 },
    asignaciones_profesor: {
      profesor: {
        id: 'prof-1',
        usuario: { nombre: 'Ana', apellido: 'Pérez' },
      },
    },
    periodo: { id: 41, ano: 2026, semestre: 1, nombre: '2026-I' },
  },
}

class RQ27RelacionEstudianteMateria {
  C1_noAutenticado() {
    const r = decidirRelacionEstudianteMateria({
      autenticado: false,
      tipoUsuario: 'estudiante',
      perfilEstudiante: true,
    })
    expect(r.status).toBe(401)
    expect(r.error).toMatch(/token/i)
  }

  C2_noEsEstudiante() {
    expect(esEstudiante('admin')).toBe(false)
    const r = decidirRelacionEstudianteMateria({
      autenticado: true,
      tipoUsuario: 'profesor',
      perfilEstudiante: true,
    })
    expect(r.status).toBe(403)
  }

  C3_caminoFeliz() {
    const r = decidirRelacionEstudianteMateria({
      autenticado: true,
      tipoUsuario: 'estudiante',
      perfilEstudiante: true,
      inscripciones: [inscripcionProgramacion, { id: 99, grupo: { numero_grupo: 2 } }],
    })
    expect(r.status).toBe(200)
    expect(r.data?.total).toBe(1)
    expect(r.data?.materiasMatriculadas[0].grupo.curso).toMatchObject({
      codigo: 'SIS-101',
      nombre: 'Programación I',
    })
    expect(r.data?.materiasMatriculadas[0].grupo.profesor.nombre).toBe('Ana Pérez')
  }

  C4_sinPerfilEstudiante() {
    const r = decidirRelacionEstudianteMateria({
      autenticado: true,
      tipoUsuario: 'estudiante',
      perfilEstudiante: false,
    })
    expect(r.status).toBe(200)
    expect(r.data?.total).toBe(0)
  }
}

const pruebas = new RQ27RelacionEstudianteMateria()

describe('RQ27 / RF-ACA-27 — Relación estudiante–materia', () => {
  it('C1: no autenticado → 401', () => pruebas.C1_noAutenticado())
  it('C2: no es estudiante → 403', () => pruebas.C2_noEsEstudiante())
  it('C3: camino feliz con materias', () => pruebas.C3_caminoFeliz())
  it('C4: sin perfil de estudiante → 200 vacío', () => pruebas.C4_sinPerfilEstudiante())
})
