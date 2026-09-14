import { describe, expect, it } from 'vitest'
import { armarResumenCoordinador, esCoordinador, parsearPaginacion } from '../../modules/analytics/coordinador-resumen'
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
    expect(esCoordinador({ tipo_usuario: 'coordinador' })).toBe(true)
    expect(esCoordinador(undefined)).toBe(false)
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

  C12_docenteSinUsuarioYEvalSinId() {
    const r = armarResumenCoordinador({
      profesores: [{ id: 7, usuario_id: 'u-falta' }],
      usuarios: [],
      evaluaciones: [
        { profesor_id: '', calificacion_promedio: 4 },
        { calificacion_promedio: 5 },
      ],
      totalCursos: 2,
    })
    expect(r.teachers[0].nombre).toBe('Docente')
    expect(r.teachers[0].email).toBe('')
    expect(r.stats.totalEvaluaciones).toBe(0)
  }

  C13_ordenaRiesgoYEmpate() {
    const r = armarResumenCoordinador({
      profesores: [
        { id: 1, usuario_id: 'ua' },
        { id: 2, usuario_id: 'ub' },
        { id: 3, usuario_id: 'uc' },
        { id: 4, usuario_id: 'ud' },
      ],
      usuarios: [
        { id: 'ua', nombre: 'Zoe', apellido: 'Z', email: 'z@t.com' },
        { id: 'ub', nombre: 'Ana', apellido: 'A', email: 'a@t.com' },
        { id: 'uc', nombre: 'Luis', apellido: 'L', email: 'l@t.com' },
        { id: 'ud', nombre: 'Sin', apellido: 'Datos', email: 's@t.com' },
      ],
      evaluaciones: [
        { profesor_id: 1, calificacion_promedio: 3.5 },
        { profesor_id: 2, calificacion_promedio: 3.5 },
        { profesor_id: 3, calificacion_promedio: 4.8 },
      ],
      totalCursos: 3,
    })
    expect(r.teachers.map((t) => t.nombre)).toEqual(['Ana A', 'Zoe Z', 'Luis L', 'Sin Datos'])
    expect(r.stats.profesoresEnRiesgo).toBe(2)
  }

  C14_paginaFueraDeRango() {
    const r = armarResumenCoordinador({
      profesores: [
        { id: 1, usuario_id: 'ua' },
        { id: 2, usuario_id: 'ub' },
      ],
      usuarios: [
        { id: 'ua', nombre: 'Ana', apellido: 'A', email: 'a@t.com' },
        { id: 'ub', nombre: 'Luis', apellido: 'L', email: 'l@t.com' },
      ],
      evaluaciones: [
        { profesor_id: 1, calificacion_promedio: 3 },
        { profesor_id: 2, calificacion_promedio: 5 },
      ],
      totalCursos: 1,
      page: 99,
      pageSize: 1,
    })
    expect(r.pagination.totalPages).toBe(2)
    expect(r.pagination.page).toBe(2)
    expect(r.teachers).toHaveLength(1)
  }

  C15_parsearPaginacion() {
    expect(parsearPaginacion({})).toEqual({ page: 1, pageSize: 8 })
    expect(parsearPaginacion({ page: 0, pageSize: 100 })).toEqual({ page: 1, pageSize: 50 })
    expect(parsearPaginacion({ page: 3, pageSize: 4 })).toEqual({ page: 3, pageSize: 4 })
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
  it('C12: sin usuario → Docente; eval sin id no cuenta', () => pruebas.C12_docenteSinUsuarioYEvalSinId())
  it('C13: ordena por riesgo y nombre en empate', () => pruebas.C13_ordenaRiesgoYEmpate())
  it('C14: página fuera de rango se recorta', () => pruebas.C14_paginaFueraDeRango())
  it('C15: parsearPaginacion defaults y tope 50', () => pruebas.C15_parsearPaginacion())
})
