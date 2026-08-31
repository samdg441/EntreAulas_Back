import { describe, expect, it } from 'vitest'
import { armarResumenCoordinador, esCoordinador } from '../../modules/analytics/coordinador-resumen'
import { estudianteUser, profesorUser, adminUser, coordinadorUser } from '../fixtures/users'
import { PAGINACION_INVALIDA } from '../fixtures/casos-datos'

class RQ24ResumenCoordinador {
  C1_noEsCoordinador() {
    expect(esCoordinador(estudianteUser)).toBe(false)
    expect(esCoordinador(profesorUser)).toBe(false)
    expect(esCoordinador(adminUser)).toBe(false)
  }

  C1b_siEsCoordinador() {
    expect(esCoordinador(coordinadorUser)).toBe(true)
  }

  C5_sinProfesores() {
    const r = armarResumenCoordinador({
      profesores: [],
      usuarios: [],
      evaluaciones: [],
      totalCursos: 1,
    })
    expect(r.stats.totalProfesores).toBe(0)
    expect(r.teachers).toEqual([])
  }

  C7_okStatsYTeachers() {
    const r = armarResumenCoordinador({
      profesores: [{ id: 7, usuario_id: 'u1' }],
      usuarios: [{ id: 'u1', nombre: 'Ana', apellido: 'Pérez', email: 'a@t.com' }],
      evaluaciones: [{ profesor_id: 7, calificacion_promedio: 4.2 }],
      totalCursos: 1,
    })
    expect(r.stats.totalProfesores).toBe(1)
    expect(r.stats.totalCursos).toBe(1)
    expect(r.stats.promedioEvaluaciones).toBe(4.2)
    expect(r.teachers[0].nombre).toBe('Ana Pérez')
  }

  C8_searchFiltra() {
    const r = armarResumenCoordinador({
      profesores: [
        { id: 7, usuario_id: 'u1' },
        { id: 8, usuario_id: 'u2' },
      ],
      usuarios: [
        { id: 'u1', nombre: 'Ana', apellido: 'Pérez', email: 'ana@t.com' },
        { id: 'u2', nombre: 'Luis', apellido: 'Gómez', email: 'luis@t.com' },
      ],
      evaluaciones: [
        { profesor_id: 7, calificacion_promedio: 4.2 },
        { profesor_id: 8, calificacion_promedio: 3.1 },
      ],
      totalCursos: 1,
      search: 'ana',
    })
    expect(r.teachers.map((t) => t.nombre)).toEqual(['Ana Pérez'])
    expect(r.pagination.total).toBe(1)
    expect(r.stats.totalProfesores).toBe(2)
  }

  C8b_searchSinCoincidencias() {
    const r = armarResumenCoordinador({
      profesores: [{ id: 7, usuario_id: 'u1' }],
      usuarios: [{ id: 'u1', nombre: 'Ana', apellido: 'Pérez', email: 'ana@t.com' }],
      evaluaciones: [{ profesor_id: 7, calificacion_promedio: 4.2 }],
      totalCursos: 1,
      search: 'zzz',
    })
    expect(r.teachers).toEqual([])
    expect(r.pagination.total).toBe(0)
  }

  C10_calificacionesInvalidas() {
    const r = armarResumenCoordinador({
      profesores: [{ id: 7, usuario_id: 'u1' }],
      usuarios: [{ id: 'u1', nombre: 'A', apellido: 'B', email: 'a@t.com' }],
      evaluaciones: [
        { profesor_id: 7, calificacion_promedio: 0 },
        { profesor_id: 7, calificacion_promedio: -2 },
        { profesor_id: 7, calificacion_promedio: 99 },
        { profesor_id: 7, calificacion_promedio: null },
      ],
      totalCursos: 1,
    })
    expect(r.stats.promedioEvaluaciones).toBe(0)
    expect(r.stats.totalEvaluaciones).toBe(0)
    expect(r.teachers[0].promedio).toBe(0)
  }

  C11_paginacionInvalidaUsaDefault() {
    const r = armarResumenCoordinador({
      profesores: [{ id: 7, usuario_id: 'u1' }],
      usuarios: [{ id: 'u1', nombre: 'Ana', apellido: 'P', email: 'a@t.com' }],
      evaluaciones: [{ profesor_id: 7, calificacion_promedio: 4 }],
      totalCursos: 1,
      page: PAGINACION_INVALIDA.page,
      pageSize: PAGINACION_INVALIDA.pageSize,
    })
    expect(r.pagination.page).toBe(1)
    expect(r.pagination.pageSize).toBe(8)
    expect(r.teachers).toHaveLength(1)
  }
}

const pruebas = new RQ24ResumenCoordinador()

describe('RQ24 — Ver resumen del coordinador', () => {
  it('C1: no es coordinador', () => pruebas.C1_noEsCoordinador())
  it('C1b: sí es coordinador', () => pruebas.C1b_siEsCoordinador())
  it('C5: sin profesores → vacío', () => pruebas.C5_sinProfesores())
  it('C7: stats y teachers', () => pruebas.C7_okStatsYTeachers())
  it('C8: search filtra la lista', () => pruebas.C8_searchFiltra())
  it('C8b: search sin coincidencias', () => pruebas.C8b_searchSinCoincidencias())
  it('C10: 0, negativos y 99 no entran al promedio', () => pruebas.C10_calificacionesInvalidas())
  it('C11: page/pageSize inválidos usan default', () => pruebas.C11_paginacionInvalidaUsaDefault())
})
