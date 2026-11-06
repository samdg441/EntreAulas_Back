import { describe, it, vi } from 'vitest'
import { expect } from 'chai'
import { EvaluationsService } from '../../../modules/evaluations/evaluations.service'
import type { EvaluationsRepository } from '../../../modules/evaluations/evaluations.repository'
import { filtrosConsultaResultados } from '../../../modules/evaluations/resultados-filtros'

/**
 * RF-REP-25 — Consulta de resultados crudos (caja blanca).
 * FIRST: datos locales, sin Supabase. El repositorio es un mock.
 * AAA en cada caso. El profesor queda filtrado por su id; coordinador y admin no.
 */

function repositorio(partial: Partial<EvaluationsRepository>): EvaluationsRepository {
  return partial as EvaluationsRepository
}

const FILA = {
  id: 1,
  completada: true,
  profesor_id: 'prof-1',
  estudiante: { id: 'est-1' },
  grupo: { id: 4 },
  respuestas_evaluacion: [{ id: 9, respuesta_texto: 'Claro' }],
}

describe('RF-REP-25 — Resultados crudos', () => {
  it('C1: el profesor solo arma el filtro con su propio id', () => {
    // Arrange
    const usuario = { tipo_usuario: 'profesor', id: 'prof-1' }

    // Act
    const filtros = filtrosConsultaResultados(usuario, {})

    // Assert
    expect(filtros).to.deep.equal({ profesor_id: 'prof-1' })
  })

  it('C2: coordinador y admin agregan periodo y grupo, sin forzar un profesor', () => {
    // Arrange
    const query = { periodo_id: '8', grupo_id: '4' }

    // Act
    const coordinador = filtrosConsultaResultados({ tipo_usuario: 'coordinador', id: 'coord-1' }, query)
    const admin = filtrosConsultaResultados({ tipo_usuario: 'admin', id: 'admin-1' }, query)

    // Assert
    expect(coordinador).to.deep.equal({ periodo_id: 8, grupo_id: 4 })
    expect(admin).to.deep.equal({ periodo_id: 8, grupo_id: 4 })
    expect(coordinador).to.not.have.property('profesor_id')
  })

  it('C3: un periodo o grupo que no es número no se agrega al filtro', () => {
    // Arrange
    const usuario = { tipo_usuario: 'coordinador', id: 'coord-1' }

    // Act
    const filtros = filtrosConsultaResultados(usuario, { periodo_id: 'abc', grupo_id: '' })

    // Assert
    expect(filtros).to.deep.equal({})
  })

  it('C4: getCompletedResults devuelve las filas del repositorio sin promediar', async () => {
    // Arrange
    const getCompletedEvaluations = vi.fn().mockResolvedValue([FILA])
    const servicio = new EvaluationsService(repositorio({ getCompletedEvaluations }))
    const filtros = filtrosConsultaResultados({ tipo_usuario: 'profesor', id: 'prof-1' }, { grupo_id: '4' })

    // Act
    const filas = await servicio.getCompletedResults(filtros)

    // Assert
    expect(getCompletedEvaluations.mock.calls).to.deep.equal([[filtros]])
    expect(filtros).to.deep.equal({ profesor_id: 'prof-1', grupo_id: 4 })
    expect(filas).to.deep.equal([FILA])
    expect(filas[0]).to.include.keys('estudiante', 'grupo', 'respuestas_evaluacion')
    expect(filas[0]).to.not.have.property('total_evaluaciones')
  })
})
