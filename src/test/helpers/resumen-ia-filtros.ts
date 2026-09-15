import { expect } from 'vitest'
import { AppError } from '../../shared/errors'
import {
  applyGrupoToEvalOpts,
  applyGrupoToFilters,
  applyPeriodoToEvalOpts,
  applyPeriodoToFilters,
  asPrimitiveString,
  assertProfessorSelfAccess,
  buildEvalOpts,
  buildProfessorFilters,
  careerQuantitativePayload,
  chunkArray,
  collectAcosoProfesores,
  docenteNombre,
  emptyCareerSql,
  emptyFacultySql,
  emptyProfessorSql,
  extractFacultyOpenTexts,
  extractValidOpenTexts,
  hasValue,
  lowPerformersFromEvals,
  normalizeText,
  periodoSqlClause,
  requireQueryProfesorId,
  textoAbiertoValido,
} from '../../modules/ai-summary/ai.routes'

export class RQ29AiRoutesHelpers {
  primitivosYVacios() {
    expect(asPrimitiveString('abc')).toBe('abc')
    expect(asPrimitiveString(12)).toBe('12')
    expect(asPrimitiveString(BigInt(3))).toBe('3')
    expect(asPrimitiveString({})).toBeNull()
    expect(asPrimitiveString(undefined)).toBeNull()
    expect(hasValue(0)).toBe(true)
    expect(hasValue('')).toBe(true)
    expect(hasValue(null)).toBe(false)
    expect(hasValue(undefined)).toBe(false)
  }

  textosAbiertos() {
    expect(textoAbiertoValido(null)).toBeNull()
    expect(textoAbiertoValido(12)).toBeNull()
    expect(textoAbiertoValido('ab')).toBeNull()
    expect(textoAbiertoValido('  hola  ')).toBe('hola')
    expect(extractValidOpenTexts(null)).toEqual([])
    expect(
      extractValidOpenTexts([{ respuesta_texto: 'ok' }, { respuesta_texto: 'texto válido' }]),
    ).toEqual(['texto válido'])
  }

  evalOpts() {
    expect(buildEvalOpts('p1', { periodo_gte: '2026-01-01', periodo_lte: '2026-06-30' })).toMatchObject({
      profesorId: 'p1',
      gte: '2026-01-01',
      lte: '2026-06-30',
    })
    expect(buildEvalOpts('p1', { periodo_id: 9 })).toMatchObject({ periodoId: 9 })
    expect(buildEvalOpts('p1', {})).toEqual({ columns: 'id', profesorId: 'p1' })

    const opts = { columns: 'id', profesorId: 'p1' }
    applyPeriodoToEvalOpts(opts, { periodo_id: null })
    applyGrupoToEvalOpts(opts, {})
    applyGrupoToEvalOpts(opts, { grupo_id: 4 })
    expect(opts.grupoId).toBe(4)
  }

  accesoProfesor() {
    expect(requireQueryProfesorId('user-1')).toBe('user-1')
    expect(() => requireQueryProfesorId({})).toThrow(AppError)
    expect(() => assertProfessorSelfAccess({ tipo_usuario: 'admin', id: 'a' }, 'p')).not.toThrow()
    expect(() =>
      assertProfessorSelfAccess({ tipo_usuario: 'profesor', id: 'p-1' }, 'p-1'),
    ).not.toThrow()
    expect(() =>
      assertProfessorSelfAccess({ tipo_usuario: 'profesor', id: 'p-1' }, 'otro'),
    ).toThrow(AppError)
  }

  async filtrosPeriodoYGrupo() {
    const vacio: { periodo_id?: number; grupo_id?: number } = {}
    await applyPeriodoToFilters(vacio, undefined)
    applyGrupoToFilters(vacio, undefined)
    expect(vacio).toEqual({})

    const numerico: { periodo_id?: number; grupo_id?: number } = {}
    await applyPeriodoToFilters(numerico, '8')
    applyGrupoToFilters(numerico, '3')
    expect(numerico).toEqual({ periodo_id: 8, grupo_id: 3 })

    const conGuion: { periodo_id?: number } = {}
    await applyPeriodoToFilters(conGuion, 'sin-formato')
    expect(conGuion.periodo_id).toBeUndefined()

    const named: { periodo_gte?: string; periodo_lte?: string; periodo_id?: number } = {}
    await applyPeriodoToFilters(named, '2026-1')
    expect(named.periodo_gte).toBe('2026-01-01')
    expect(named.periodo_lte).toBe('2026-06-30')

    const filters = await buildProfessorFilters({
      profesor_id: 'user-profesor',
      periodo_id: 4,
      grupo_id: 2,
    })
    expect(filters).toEqual({ profesor_id: 'user-profesor', periodo_id: 4, grupo_id: 2 })
    await expect(buildProfessorFilters({})).rejects.toBeInstanceOf(AppError)
  }

  sqlDebug() {
    expect(periodoSqlClause({ periodo_gte: 'a', periodo_lte: 'b' })).toContain('fecha_creacion BETWEEN')
    expect(periodoSqlClause({ periodo_id: 11 })).toContain('periodo_id = 11')
    expect(periodoSqlClause({})).toBe('')
    expect(emptyProfessorSql(3, { periodo_id: 11 })).toContain('e.carrera_id = 3')
    expect(emptyProfessorSql({}, {})).toContain('e.carrera_id = null')
    expect(emptyCareerSql(1, 9)).toContain('periodo_id = 9')
    expect(emptyCareerSql(1)).not.toContain('periodo_id =')
    expect(emptyFacultySql()).not.toContain('periodo_id =')
    expect(emptyFacultySql(11)).toContain('periodo_id = 11')
  }

  textosFacultad() {
    expect(extractFacultyOpenTexts(null)).toEqual([])
    expect(extractFacultyOpenTexts([{ respuesta_texto: 'abc' }])).toEqual([])
    expect(extractFacultyOpenTexts([{ respuesta_texto: {} }])).toEqual([])
    expect(extractFacultyOpenTexts([{ respuesta_texto: 'texto válido' }])).toEqual(['texto válido'])
    expect(extractFacultyOpenTexts([{ respuesta_texto: '  hola mundo  ' }])).toEqual(['hola mundo'])
  }

  acosoYDesempeno() {
    expect(chunkArray([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    expect(normalizeText('Acosó')).toBe('acoso')
    expect(docenteNombre({ nombre: 'Ana', apellido: 'Perez' }, '7')).toBe('Ana Perez')
    expect(docenteNombre(undefined, '7')).toBe('Docente 7')

    const nombres = new Map([['7', 'Ana Perez']])
    const acoso = collectAcosoProfesores(
      [
        { evaluacion_id: 10, respuesta_texto: 'Hubo acoso en clase' },
        { evaluacion_id: 10, respuesta_texto: 'ab' },
        { evaluacion_id: 99, respuesta_texto: 'texto largo sin indicio' },
      ],
      [{ id: 10, profesor_id: 7 }],
      nombres,
    )
    expect(acoso).toEqual([
      expect.objectContaining({ profesorId: '7', nombre: 'Ana Perez', menciones: 1 }),
    ])

    const bajos = lowPerformersFromEvals(
      [
        { profesor_id: 7, calificacion_promedio: 3.2 },
        { profesor_id: 7, calificacion_promedio: 3.4 },
        { profesor_id: 8, calificacion_promedio: 4.5 },
        { profesor_id: '', calificacion_promedio: 2 },
      ],
      nombres,
    )
    expect(bajos[0]).toMatchObject({ profesorId: '7', promedio: 3.3 })

    const conAlerta = careerQuantitativePayload(
      [3, 4],
      [{ profesor_id: 7, calificacion_promedio: 3.2 }],
      nombres,
      [],
    )
    expect(conAlerta.analysisSource).toBe('quantitative_fallback')
    expect(conAlerta.topics.at(-1)).toBe('docentes bajo 4.0')

    const sinAlerta = careerQuantitativePayload(
      [5, 5],
      [{ profesor_id: 7, calificacion_promedio: 5 }],
      nombres,
      [],
    )
    expect(sinAlerta.topics.at(-1)).toBe('sin alertas bajo 4.0')
  }
}
