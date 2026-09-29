import { beforeAll, describe, it } from 'vitest'
import { expect } from 'chai'
import { calcularStatsEstudiante, decidirStudentStats } from '../helpers/estudiante-stats'
import { BODY_EVALUACION_VALIDO, decidirEnvioEvaluacion } from '../helpers/evaluacion-docente'
import {
  BODY_ALTA_VALIDO,
  decidirActualizacionUsuario,
  decidirCreacionUsuario,
  decidirDesactivacionUsuario,
  usuarioSinPassword,
} from '../helpers/gestionar-usuarios'
import { AVISO_SIN_DATOS, decidirResumenByProfessor } from '../helpers/resumen-ia'
import { AVISO_POR_ALCANCE, decidirResumenPorAlcance } from '../helpers/resumen-alcance'
import {
  construirAcosoProfesores,
  decidirResumenByCareer,
  detectarAcosoEnTextos,
} from '../helpers/alerta-acoso'

/**
 * Igual que rq18-rq25-regresion.test.ts: primero el camino que sí funciona
 * y después cada Regresión comprueba que ese éxito no dejó abierta la puerta de atrás.
 */
const resultado: Record<string, any> = {}

describe('RQ10, RQ11, RQ13, RQ29, RQ30 y RQ31 — Regresión', () => {
  beforeAll(() => {
    resultado.statsOk = decidirStudentStats({
      autenticado: true,
      tipoUsuario: 'estudiante',
      perfilEstudiante: true,
      inscripcionesActivas: 2,
      evaluacionesCompletadas: [{ calificacion_promedio: 4 }, { calificacion_promedio: 5 }],
    })
    resultado.statsProfesor = decidirStudentStats({
      autenticado: true,
      tipoUsuario: 'profesor',
      perfilEstudiante: true,
      inscripcionesActivas: 2,
      evaluacionesCompletadas: [{ calificacion_promedio: 5 }],
    })
    resultado.statsDeMas = calcularStatsEstudiante(1, [
      { calificacion_promedio: 4 },
      { calificacion_promedio: 5 },
      { calificacion_promedio: null },
    ])

    resultado.envioOk = decidirEnvioEvaluacion({
      autenticado: true,
      tipoUsuario: 'estudiante',
      body: BODY_EVALUACION_VALIDO,
      perfilEstudiante: true,
      evaluationId: 'eval-regresion',
    })
    resultado.envioProfesor = decidirEnvioEvaluacion({
      autenticado: true,
      tipoUsuario: 'profesor',
      body: BODY_EVALUACION_VALIDO,
      perfilEstudiante: true,
    })
    resultado.envioRepetido = decidirEnvioEvaluacion({
      autenticado: true,
      tipoUsuario: 'estudiante',
      body: BODY_EVALUACION_VALIDO,
      perfilEstudiante: true,
      yaEvaluo: true,
    })
    resultado.envioVacio = decidirEnvioEvaluacion({
      autenticado: true,
      tipoUsuario: 'estudiante',
      body: { ...BODY_EVALUACION_VALIDO, answers: [] },
      perfilEstudiante: true,
    })

    resultado.altaOk = decidirCreacionUsuario({
      tieneToken: true,
      tokenValido: true,
      esAdmin: true,
      emailYaExiste: false,
      body: BODY_ALTA_VALIDO,
    })
    resultado.usuarioPublico = usuarioSinPassword({ ...BODY_ALTA_VALIDO, id: 'u-1' })
    resultado.altaAjena = decidirCreacionUsuario({
      tieneToken: true,
      tokenValido: true,
      esAdmin: false,
      emailYaExiste: false,
      body: BODY_ALTA_VALIDO,
    })
    resultado.altaDuplicada = decidirCreacionUsuario({
      tieneToken: true,
      tokenValido: true,
      esAdmin: true,
      emailYaExiste: true,
      body: BODY_ALTA_VALIDO,
    })
    resultado.bajaPropia = decidirDesactivacionUsuario({
      autenticado: true,
      esAdmin: true,
      id: 'admin-1',
      existe: true,
      adminId: 'admin-1',
    })
    resultado.cambioVacio = decidirActualizacionUsuario({
      autenticado: true,
      esAdmin: true,
      id: 'u-1',
      existe: true,
    })

    const comentarios = [
      'El profesor explica con claridad y buena metodología',
      'Falta más retroalimentación en las prácticas',
    ]
    resultado.resumenOk = decidirResumenByProfessor({
      autenticado: true,
      tipoUsuario: 'profesor',
      userId: '7',
      profesorId: '7',
      texts: comentarios,
      geminiOk: false,
    })
    resultado.resumenEstudiante = decidirResumenByProfessor({
      autenticado: true,
      tipoUsuario: 'estudiante',
      profesorId: '7',
      texts: comentarios,
    })
    resultado.resumenAjeno = decidirResumenByProfessor({
      autenticado: true,
      tipoUsuario: 'profesor',
      userId: '7',
      profesorId: '8',
      texts: comentarios,
    })
    resultado.resumenSinTextos = decidirResumenByProfessor({
      autenticado: true,
      tipoUsuario: 'coordinador',
      profesorId: '7',
      texts: [],
      ratings: [],
    })
    resultado.resumenSoloNotas = decidirResumenByProfessor({
      autenticado: true,
      tipoUsuario: 'coordinador',
      profesorId: '7',
      texts: [],
      ratings: [4, 5],
    })

    resultado.alcanceOk = decidirResumenPorAlcance({
      autenticado: true,
      tipoUsuario: 'coordinador',
      alcance: 'carrera',
      respuestas: [{ respuesta_texto: 'El grupo valora la claridad de las clases' }],
    })
    resultado.alcanceEstudiante = decidirResumenPorAlcance({
      autenticado: true,
      tipoUsuario: 'estudiante',
      alcance: 'carrera',
      respuestas: [{ respuesta_texto: 'El grupo valora la claridad de las clases' }],
    })
    resultado.alcanceAjeno = decidirResumenPorAlcance({
      autenticado: true,
      tipoUsuario: 'profesor',
      userId: '7',
      profesorId: '8',
      alcance: 'profesor',
      respuestas: [{ respuesta_texto: 'El grupo valora la claridad de las clases' }],
    })
    resultado.facultadCorta = decidirResumenPorAlcance({
      autenticado: true,
      tipoUsuario: 'decano',
      alcance: 'facultad',
      respuestas: [{ respuesta_texto: 'ab' }],
    })

    resultado.acoso = detectarAcosoEnTextos(['Hubo acoso en la clase de ayer'])
    resultado.sinAcoso = detectarAcosoEnTextos(['El profesor explica con claridad'])
    resultado.alertaOk = decidirResumenByCareer({
      autenticado: true,
      tipoUsuario: 'coordinador',
      texts: ['Hubo acoso en la clase de ayer'],
      respuestas: [
        {
          evaluacion_id: 'e1',
          profesor_id: '7',
          profesorNombre: 'Ana Perez',
          respuesta_texto: 'Hubo acoso en la clase de ayer',
        },
      ],
    })
    resultado.alertaEstudiante = decidirResumenByCareer({
      autenticado: true,
      tipoUsuario: 'estudiante',
      texts: ['Hubo acoso en la clase de ayer'],
    })
    resultado.mencionesCortas = construirAcosoProfesores([
      {
        evaluacion_id: 'e2',
        profesor_id: '7',
        profesorNombre: 'Ana Perez',
        respuesta_texto: 'ac',
      },
      {
        evaluacion_id: 'e3',
        profesor_id: '8',
        profesorNombre: 'Luis Gomez',
        respuesta_texto: 'buena clase de metodologia',
      },
    ])
  })

  it('RQ10: el estudiante ve completadas, pendientes y promedio', () => {
    expect(resultado.statsOk, 'estadísticas')
      .to.include({ ok: true, status: 200 })
      .and.have.property('data')
      .that.includes({
        evaluacionesCompletadas: 2,
        evaluacionesPendientes: 0,
        materiasMatriculadas: 2,
        promedioGeneral: 4.5,
        progresoGeneral: 100,
      })
  })

  it('Regresión RQ10: un profesor no hereda las estadísticas del estudiante', () => {
    expect(resultado.statsProfesor, 'profesor')
      .to.include({ ok: false, status: 403 })
      .and.not.have.property('data')
  })

  it('Regresión RQ10: más evaluaciones que materias no dejan pendientes negativas', () => {
    expect(resultado.statsDeMas, 'pendientes')
      .to.have.property('evaluacionesPendientes')
      .that.equals(0)
      .and.is.at.least(0)
  })

  it('RQ11: el estudiante guarda la evaluación y recibe su id', () => {
    expect(resultado.envioOk, 'envío')
      .to.include({ ok: true, status: 200 })
      .and.have.property('data')
      .that.includes({ success: true, evaluationId: 'eval-regresion' })
  })

  it('Regresión RQ11: el mismo cuerpo, enviado por un profesor, sigue negado', () => {
    expect(resultado.envioProfesor, 'profesor')
      .to.include({ ok: false, status: 403 })
      .and.not.have.property('data')
  })

  it('Regresión RQ11: repetir la evaluación no crea otra', () => {
    expect(resultado.envioRepetido, 'repetida')
      .to.include({ ok: false, status: 409 })
      .and.not.have.property('data')
  })

  it('Regresión RQ11: sin respuestas el envío válido no se cuela', () => {
    expect(resultado.envioVacio, 'sin respuestas')
      .to.include({ ok: false, status: 400 })
      .and.have.property('details')
      .that.is.an('array')
      .and.is.not.empty
  })

  it('RQ13: el admin crea el usuario y la respuesta no lleva la contraseña', () => {
    expect(resultado.altaOk, 'alta').to.include({ ok: true, status: 201 }).and.not.have.property('password')
    expect(resultado.usuarioPublico, 'usuario')
      .to.include({ email: BODY_ALTA_VALIDO.email, nombre: 'Ana' })
      .and.not.have.property('password')
  })

  it('Regresión RQ13: quien no es admin no crea, y el correo repetido tampoco', () => {
    expect(resultado.altaAjena, 'no admin')
      .to.include({ ok: false, status: 403, code: 'FORBIDDEN_ROLE' })
      .and.have.property('error')
      .that.is.a('string')
      .and.is.not.empty
    expect(resultado.altaDuplicada, 'duplicado')
      .to.include({ ok: false, status: 400 })
      .and.have.property('error')
      .that.equals('El email ya está registrado')
  })

  it('Regresión RQ13: el admin no se desactiva a sí mismo ni guarda un cambio vacío', () => {
    expect(resultado.bajaPropia, 'auto-desactivar').to.include({ ok: false, status: 400 }).and.not.have.property('data')
    expect(resultado.cambioVacio, 'vacío')
      .to.include({ ok: false, status: 400 })
      .and.have.property('error')
      .that.equals('No hay campos para actualizar')
  })

  it('RQ29: los comentarios abiertos producen un resumen local', () => {
    expect(resultado.resumenOk, 'resumen')
      .to.include({ ok: true, status: 200 })
      .and.have.property('data')
      .that.includes({ analysisSource: 'open_text', textsCount: 2 })
      .and.has.property('topics')
      .that.includes('claridad')
  })

  it('Regresión RQ29: el estudiante y el profesor ajeno no leen ese resumen', () => {
    expect(resultado.resumenEstudiante, 'estudiante')
      .to.include({ ok: false, status: 403, code: 'FORBIDDEN_ROLE' })
      .and.not.have.property('data')
    expect(resultado.resumenAjeno, 'ajeno')
      .to.include({ ok: false, status: 403 })
      .and.have.property('error')
      .that.equals('No autorizado')
  })

  it('Regresión RQ29: sin comentarios no inventa un resumen de textos', () => {
    expect(resultado.resumenSinTextos, 'sin textos')
      .to.have.nested.property('data.summary')
      .that.equals(AVISO_SIN_DATOS)
    expect(resultado.resumenSinTextos, 'temas')
      .to.have.nested.property('data.topics')
      .that.is.an('array')
      .and.is.empty
    expect(resultado.resumenSoloNotas, 'solo notas')
      .to.have.property('data')
      .that.includes({ analysisSource: 'quantitative_fallback', textsCount: 0 })
  })

  it('RQ30: el coordinador resume la carrera con los comentarios de ese alcance', () => {
    expect(resultado.alcanceOk, 'carrera')
      .to.include({ ok: true, status: 200 })
      .and.have.property('data')
      .that.includes({
        alcance: 'carrera',
        endpoint: '/api/ai/summarize/by-career',
        analysisSource: 'open_text',
        textsCount: 1,
      })
  })

  it('Regresión RQ30: el estudiante no pide la carrera y el profesor no lee a otro', () => {
    expect(resultado.alcanceEstudiante, 'estudiante')
      .to.include({ ok: false, status: 403, code: 'FORBIDDEN_ROLE' })
      .and.not.have.property('data')
    expect(resultado.alcanceAjeno, 'otro profesor')
      .to.include({ ok: false, status: 403 })
      .and.have.property('error')
      .that.is.a('string')
      .and.is.not.empty
  })

  it('Regresión RQ30: un texto corto de facultad no cuenta como comentario abierto', () => {
    expect(resultado.facultadCorta, 'facultad')
      .to.have.property('data')
      .that.includes({ textsCount: 0, summary: AVISO_POR_ALCANCE.facultad })
      .and.has.property('summary')
      .that.does.not.equal(AVISO_POR_ALCANCE.carrera)
  })

  it('RQ31: un comentario con acoso enciende la alerta del coordinador', () => {
    expect(resultado.acoso, 'detección')
      .to.include({ acosoDetectado: true })
      .and.have.property('textosConAcoso')
      .that.has.lengthOf(1)
    expect(resultado.alertaOk, 'alerta')
      .to.include({ ok: true, status: 200 })
      .and.have.nested.property('data.acosoDetectado')
      .that.equals(true)
    expect(resultado.alertaOk, 'mensaje')
      .to.have.nested.property('data.mensajeAcoso')
      .that.is.a('string')
      .and.is.not.empty
    expect(resultado.alertaOk, 'profesores')
      .to.have.nested.property('data.acosoProfesores')
      .that.is.an('array')
      .and.has.lengthOf(1)
  })

  it('Regresión RQ31: un comentario normal no alerta y el estudiante no ve la carrera', () => {
    expect(resultado.sinAcoso, 'sin acoso')
      .to.include({ acosoDetectado: false })
      .and.have.property('textosConAcoso')
      .that.is.an('array')
      .and.is.empty
    expect(resultado.sinAcoso, 'mensaje').to.have.property('mensajeAcoso').that.is.undefined
    expect(resultado.alertaEstudiante, 'estudiante')
      .to.include({ ok: false, status: 403, code: 'FORBIDDEN_ROLE' })
      .and.not.have.property('data')
    expect(resultado.mencionesCortas, 'menciones cortas').to.be.an('array').and.to.be.empty
  })
})
