import { describe, expect, it } from 'vitest'
import {
  claveEvaluacion,
  marcarDocentes,
  marcarGrupos,
  ventanaEstaCerrada,
} from '../../../modules/academic/estado-evaluacion-estudiante'

describe('estado de evaluación del estudiante', () => {
  const docente = {
    id: 'prof-1',
    courses: [{ id: 9, groups: [{ id: 3 }, { id: 4 }] }],
  }

  it('marca Respondida el grupo ya evaluado y Bloqueado el resto si la ventana cerró', () => {
    const respondidas = new Set([claveEvaluacion('prof-1', 3)])
    const [marcado] = marcarDocentes([docente], respondidas, true)
    const grupos = marcado.courses[0].groups

    expect(grupos[0]).toMatchObject({ id: 3, evaluada: true, bloqueada: false })
    expect(grupos[1]).toMatchObject({ id: 4, evaluada: false, bloqueada: true })
    expect(marcado.courses[0].evaluada).toBe(false)
    expect(marcado.courses[0].bloqueada).toBe(true)
  })

  it('el curso queda respondido cuando todos sus grupos ya tienen encuesta', () => {
    const respondidas = new Set([claveEvaluacion('prof-1', 3), claveEvaluacion('prof-1', 4)])
    const [marcado] = marcarDocentes([docente], respondidas, false)

    expect(marcado.courses[0].evaluada).toBe(true)
    expect(marcado.courses[0].bloqueada).toBe(false)
    expect(marcarGrupos([{ id: 3 }], 'prof-1', respondidas, true)[0].bloqueada).toBe(false)
  })

  it('sin fechas configuradas no bloquea; con fechas y hoy fuera, sí', () => {
    expect(ventanaEstaCerrada([])).toBe(false)
    expect(
      ventanaEstaCerrada(
        [{ fechaInicio: '2026-09-01', fechaFin: '2026-09-15' }],
        '2026-10-27'
      )
    ).toBe(true)
    expect(
      ventanaEstaCerrada(
        [{ fechaInicio: '2026-10-01', fechaFin: '2026-10-31' }],
        '2026-10-27'
      )
    ).toBe(false)
  })
})
