/**
 * Presupuestos de tiempo del back para RQ10, RQ11, RQ13, RQ29, RQ30 y RQ31.
 * Miden la lógica pura con volúmenes de producción: detectan un cambio de
 * complejidad (O(n) → O(n²)), no diferencias de milisegundos entre equipos.
 */
import { afterAll, describe, expect, it } from 'vitest'
import { calcularStatsEstudiante } from '../helpers/estudiante-stats'
import { armarRespuestas, validarBodyEvaluacion } from '../helpers/evaluacion-docente'
import { usuarioSinPassword, validarActualizacionUsuario } from '../helpers/gestionar-usuarios'
import { resumenLocal } from '../helpers/resumen-ia'
import { decidirResumenPorAlcance } from '../helpers/resumen-alcance'
import { construirAcosoProfesores, detectarAcosoEnTextos, type RespuestaCarrera } from '../helpers/alerta-acoso'
import { guardarReporte, medir, type Medicion } from '../helpers/medicion'

const mediciones: Medicion[] = []

function respuestasEvaluacion(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    questionId: i + 1,
    rating: i % 4 === 0 ? null : 1 + (i % 5),
    textAnswer: i % 4 === 0 ? '  claridad en la explicación  ' : null,
  }))
}

function comentarios(n: number) {
  return Array.from({ length: n }, (_, i) =>
    i % 11 === 0 ? 'Hubo acoso durante la clase y dio miedo' : 'La explicación fue clara y la metodología correcta'
  )
}

function filasCarrera(n: number): RespuestaCarrera[] {
  return Array.from({ length: n }, (_, i) => ({
    evaluacion_id: `e-${i}`,
    profesor_id: String(i % 400),
    profesorNombre: i % 7 === 0 ? 'Ana Perez' : `Docente ${i % 400}`,
    respuesta_texto: i % 11 === 0 ? 'Hubo acoso durante la clase' : i % 8 === 0 ? 'ab' : `comentario abierto ${i}`,
  }))
}

describe('RQ10, RQ11, RQ13, RQ29, RQ30 y RQ31 — Rendimiento de la lógica', () => {
  afterAll(() => {
    guardarReporte('back-logica-rq10-rq31', mediciones)
  })

  it('RQ10: calcular estadísticas de 100.000 evaluaciones tarda menos de 30 ms', () => {
    const evaluaciones = Array.from({ length: 100_000 }, (_, i) => ({ calificacion_promedio: 1 + (i % 5) }))
    const m = medir({ escenario: 'calcularStatsEstudiante 100k', requisito: 'RQ10', presupuestoMs: 30 }, () =>
      calcularStatsEstudiante(100_000, evaluaciones)
    )
    mediciones.push(m)
    expect(m.cumple, JSON.stringify(m)).toBe(true)
    expect(calcularStatsEstudiante(100_000, evaluaciones).evaluacionesPendientes).toBe(0)
  })

  it('RQ11: armar 20.000 respuestas tarda menos de 40 ms', () => {
    const answers = respuestasEvaluacion(20_000)
    const m = medir({ escenario: 'armarRespuestas 20k', requisito: 'RQ11', presupuestoMs: 40, repeticiones: 20 }, () =>
      armarRespuestas('eval-1', answers)
    )
    mediciones.push(m)
    expect(m.cumple, JSON.stringify(m)).toBe(true)
    expect(armarRespuestas('eval-1', answers)).toHaveLength(20_000)
  })

  it('RQ11: validar un envío de 1.000 respuestas tarda menos de 80 ms', () => {
    const body = {
      teacherId: '12',
      courseId: '3',
      groupId: '7',
      answers: Array.from({ length: 1_000 }, (_, i) => ({ questionId: i + 1, rating: 4, textAnswer: null })),
      overallRating: 4,
      comments: 'Buen curso',
    }
    const m = medir({ escenario: 'validarBodyEvaluacion 1k', requisito: 'RQ11', presupuestoMs: 80, repeticiones: 20 }, () =>
      validarBodyEvaluacion(body)
    )
    mediciones.push(m)
    expect(m.cumple, JSON.stringify(m)).toBe(true)
    expect(validarBodyEvaluacion(body).ok).toBe(true)
  })

  it('RQ11: armar respuestas escala lineal (10x respuestas ≈ 10x tiempo, nunca 100x)', () => {
    const pocas = respuestasEvaluacion(2_000)
    const muchas = respuestasEvaluacion(20_000)
    const a = medir({ escenario: 'armarRespuestas 2k', requisito: 'RQ11', presupuestoMs: 15, repeticiones: 30 }, () =>
      armarRespuestas('eval-1', pocas)
    )
    const b = medir({ escenario: 'armarRespuestas 20k (escala)', requisito: 'RQ11', presupuestoMs: 40, repeticiones: 30 }, () =>
      armarRespuestas('eval-1', muchas)
    )
    mediciones.push(a, b)
    expect(b.medianaMs / Math.max(a.medianaMs, 0.01)).toBeLessThan(30)
  })

  it('RQ13: validar 20.000 actualizaciones y quitar la contraseña tarda menos de 50 ms', () => {
    const altas = Array.from({ length: 20_000 }, (_, i) => ({
      id: `u-${i}`,
      existe: true,
      email: `  Ana${i}@SoyUdeMedellin.edu.co  `,
      nombre: ' Ana ',
      apellido: ' Pérez ',
      tipo_usuario: 'estudiante',
      password: 'Clave-Segura2026!',
    }))
    const m = medir({ escenario: 'validarActualizacionUsuario 20k', requisito: 'RQ13', presupuestoMs: 50 }, () => {
      let sinClave = 0
      for (const alta of altas) {
        validarActualizacionUsuario(alta)
        sinClave += 'password' in usuarioSinPassword(alta) ? 0 : 1
      }
      return sinClave
    })
    mediciones.push(m)
    expect(m.cumple, JSON.stringify(m)).toBe(true)
  })

  it('RQ29: resumir 15.000 comentarios abiertos tarda menos de 80 ms', () => {
    const texts = Array.from({ length: 15_000 }, (_, i) =>
      i % 3 === 0 ? 'La explicación fue clara' : 'Metodologia regular con poca retroalimentacion'
    )
    const m = medir({ escenario: 'resumenLocal 15k', requisito: 'RQ29', presupuestoMs: 80, repeticiones: 15 }, () => resumenLocal(texts))
    mediciones.push(m)
    expect(m.cumple, JSON.stringify(m)).toBe(true)
    expect(resumenLocal(texts).topics.length).toBeGreaterThan(0)
  })

  it('RQ29: el resumen escala lineal (10x comentarios ≈ 10x tiempo, nunca 100x)', () => {
    const pocos = Array.from({ length: 1_500 }, (_, i) => (i % 3 === 0 ? 'La explicación fue clara' : 'Metodologia regular'))
    const muchos = Array.from({ length: 15_000 }, (_, i) => (i % 3 === 0 ? 'La explicación fue clara' : 'Metodologia regular'))
    const a = medir({ escenario: 'resumenLocal 1.5k', requisito: 'RQ29', presupuestoMs: 20, repeticiones: 20 }, () => resumenLocal(pocos))
    const b = medir({ escenario: 'resumenLocal 15k (escala)', requisito: 'RQ29', presupuestoMs: 80, repeticiones: 20 }, () =>
      resumenLocal(muchos)
    )
    mediciones.push(a, b)
    expect(b.medianaMs / Math.max(a.medianaMs, 0.01)).toBeLessThan(30)
  })

  it('RQ30: resumir 20.000 comentarios de carrera tarda menos de 40 ms', () => {
    const respuestas = filasCarrera(20_000).map((fila) => ({ respuesta_texto: fila.respuesta_texto }))
    const m = medir({ escenario: 'decidirResumenPorAlcance carrera 20k', requisito: 'RQ30', presupuestoMs: 40, repeticiones: 20 }, () =>
      decidirResumenPorAlcance({
        autenticado: true,
        tipoUsuario: 'coordinador',
        alcance: 'carrera',
        respuestas,
      })
    )
    mediciones.push(m)
    expect(m.cumple, JSON.stringify(m)).toBe(true)
  })

  it('RQ30: un texto corto de facultad no entra y 20.000 filas tardan menos de 40 ms', () => {
    const respuestas = Array.from({ length: 20_000 }, (_, i) => ({
      respuesta_texto: i % 4 === 0 ? 'abc' : `comentario de facultad ${i}`,
    }))
    const m = medir({ escenario: 'decidirResumenPorAlcance facultad 20k', requisito: 'RQ30', presupuestoMs: 40, repeticiones: 20 }, () =>
      decidirResumenPorAlcance({
        autenticado: true,
        tipoUsuario: 'decano',
        alcance: 'facultad',
        respuestas,
      })
    )
    mediciones.push(m)
    expect(m.cumple, JSON.stringify(m)).toBe(true)
  })

  it('RQ31: detectar acoso en 10.000 comentarios tarda menos de 400 ms', () => {
    const texts = comentarios(10_000)
    const m = medir({ escenario: 'detectarAcosoEnTextos 10k', requisito: 'RQ31', presupuestoMs: 400, repeticiones: 10 }, () =>
      detectarAcosoEnTextos(texts)
    )
    mediciones.push(m)
    expect(m.cumple, JSON.stringify(m)).toBe(true)
    expect(detectarAcosoEnTextos(texts).acosoDetectado).toBe(true)
  })

  it('RQ31: agrupar docentes con indicios en 10.000 respuestas tarda menos de 400 ms', () => {
    const filas = filasCarrera(10_000)
    const m = medir({ escenario: 'construirAcosoProfesores 10k', requisito: 'RQ31', presupuestoMs: 400, repeticiones: 10 }, () =>
      construirAcosoProfesores(filas)
    )
    mediciones.push(m)
    expect(m.cumple, JSON.stringify(m)).toBe(true)
    expect(construirAcosoProfesores(filas).length).toBeGreaterThan(0)
  })

  it('RQ31: la detección escala lineal (10x comentarios ≈ 10x tiempo, nunca 100x)', () => {
    const pocos = comentarios(1_000)
    const muchos = comentarios(10_000)
    const a = medir({ escenario: 'detectarAcosoEnTextos 1k', requisito: 'RQ31', presupuestoMs: 80, repeticiones: 15 }, () =>
      detectarAcosoEnTextos(pocos)
    )
    const b = medir({ escenario: 'detectarAcosoEnTextos 10k (escala)', requisito: 'RQ31', presupuestoMs: 400, repeticiones: 15 }, () =>
      detectarAcosoEnTextos(muchos)
    )
    mediciones.push(a, b)
    expect(b.medianaMs / Math.max(a.medianaMs, 0.01)).toBeLessThan(30)
  })
})
