import { describe, expect, it } from 'vitest'
import type { Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { authenticateToken } from '../../middleware/auth'
import { extraerBearer, usuarioPuedeAutenticarse } from '../helpers/rbac'
import {
  armarFilaEvaluacion,
  armarRespuestas,
  BODY_EVALUACION_VALIDO,
  decidirEnvioEvaluacion,
  esEstudiante,
  validarBodyEvaluacion,
} from '../helpers/evaluacion-docente'

/**
 * RQ11 — Enviar la evaluación docente (POST /api/teachers/evaluations)
 *
 * Nodos del grafo backend:
 *  1-2  Recibe POST /evaluations
 *  3-5  JWT / usuario inactivo → 401
 *  6-8  evaluationSchema (Zod) inválido → 400
 *  9-10 tipo_usuario !== estudiante → 403
 * 11-13 Sin fila en estudiantes → 404
 * 14-15 Evaluación previa mismo profesor/grupo/periodo → 409
 * 16-17 Inserta evaluación + respuestas → 200 + evaluationId
 */

function fakeRes() {
  const res = {
    statusCode: 0 as number,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code
      return this
    },
    json(payload: unknown) {
      this.body = payload
      return this
    },
  }
  return res
}

function fakeReq(over: Partial<Request> = {}): Request {
  return { headers: {}, body: {}, ...over } as Request
}

const ROLES_NO_ESTUDIANTE = ['profesor', 'docente', 'coordinador', 'admin', 'decano'] as const

class RQ11EnviarEvaluacionDocente {
  // Nodo 3: Authorization sin Bearer
  N3_sinBearer() {
    expect(extraerBearer(undefined)).toBeNull()
    expect(extraerBearer('Bearer ')).toBeNull()
    expect(extraerBearer('Basic abc')).toBeNull()
  }

  // Nodo 3-5: sin JWT → 401 NO_TOKEN (middleware real)
  async N5_sinToken() {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret'
    const req = fakeReq()
    const res = fakeRes()
    let llamoNext = false
    await authenticateToken(req, res as unknown as Response, () => {
      llamoNext = true
    })
    expect(llamoNext).toBe(false)
    expect(res.statusCode).toBe(401)
    expect(res.body).toMatchObject({ error: 'Token de acceso requerido', code: 'NO_TOKEN' })

    const r = decidirEnvioEvaluacion({
      autenticado: false,
      tipoUsuario: 'estudiante',
      body: BODY_EVALUACION_VALIDO,
      perfilEstudiante: true,
    })
    expect(r.status).toBe(401)
    expect(r.ok).toBe(false)
    expect(r.data).toBeUndefined()
  }

  // Nodo 3-5: JWT inválido → 401 TOKEN_INVALID
  async N5_tokenInvalido() {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret'
    const req = fakeReq({ headers: { authorization: 'Bearer token-roto' } })
    const res = fakeRes()
    await authenticateToken(req, res as unknown as Response, () => {})
    expect(res.statusCode).toBe(401)
    expect(res.body).toMatchObject({ error: 'Token inválido', code: 'TOKEN_INVALID' })
    expect(() => jwt.verify('no-es-jwt', process.env.JWT_SECRET as string)).toThrow()
  }

  // Nodo 3-5: JWT expirado → 401 TOKEN_EXPIRED
  async N5_tokenExpirado() {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret'
    const token = jwt.sign({ userId: 'u1' }, process.env.JWT_SECRET as string, { expiresIn: -10 })
    const req = fakeReq({ headers: { authorization: `Bearer ${token}` } })
    const res = fakeRes()
    await authenticateToken(req, res as unknown as Response, () => {})
    expect(res.statusCode).toBe(401)
    expect(res.body).toMatchObject({ error: 'Token expirado', code: 'TOKEN_EXPIRED' })
  }

  // Nodo 4: usuario inactivo no se autentica
  N4_usuarioInactivo() {
    expect(usuarioPuedeAutenticarse(null)).toBe(false)
    expect(usuarioPuedeAutenticarse({ activo: false })).toBe(false)
    expect(usuarioPuedeAutenticarse({ activo: true })).toBe(true)
  }

  // Nodo 6-7: body válido pasa el schema
  N7_bodyValido() {
    const r = validarBodyEvaluacion(BODY_EVALUACION_VALIDO)
    expect(r.ok).toBe(true)
    expect(r.status).toBe(200)
    expect(r.data?.teacherId).toBe('12')
    expect(r.data?.overallRating).toBe(4)
    expect(r.data?.answers).toHaveLength(1)
  }

  // Nodo 6-8: sin answers → 400
  N8_sinRespuestas() {
    const { answers: _answers, ...sinAnswers } = BODY_EVALUACION_VALIDO
    const r = validarBodyEvaluacion(sinAnswers)
    expect(r.ok).toBe(false)
    expect(r.status).toBe(400)
    expect(r.error).toBe('Datos de evaluación inválidos')
    expect(r.details?.some((d) => d.field.includes('answers'))).toBe(true)
  }

  // Nodo 6-8: answers vacío → 400
  N8_respuestasVacias() {
    const r = validarBodyEvaluacion({ ...BODY_EVALUACION_VALIDO, answers: [] })
    expect(r.ok).toBe(false)
    expect(r.status).toBe(400)
    expect(r.details?.some((d) => d.message.includes('al menos una respuesta'))).toBe(true)
  }

  // Nodo 6-8: rating fuera de 1–5 → 400
  N8_ratingFueraDeEscala() {
    for (const rating of [0, 6, -1, 99]) {
      const r = validarBodyEvaluacion({
        ...BODY_EVALUACION_VALIDO,
        answers: [{ questionId: 1, rating, textAnswer: null }],
      })
      expect(r.ok).toBe(false)
      expect(r.status).toBe(400)
    }
  }

  // Nodo 6-8: overallRating fuera de 1–5 → 400
  N8_promedioFueraDeEscala() {
    for (const overallRating of [0, 5.1, 6, -2]) {
      const r = validarBodyEvaluacion({ ...BODY_EVALUACION_VALIDO, overallRating })
      expect(r.ok).toBe(false)
      expect(r.status).toBe(400)
    }
  }

  // Nodo 6-8: teacherId o courseId inválidos → 400
  N8_idsInvalidos() {
    expect(validarBodyEvaluacion({ ...BODY_EVALUACION_VALIDO, teacherId: 'abc' }).ok).toBe(false)
    expect(validarBodyEvaluacion({ ...BODY_EVALUACION_VALIDO, teacherId: '0' }).ok).toBe(false)
    expect(validarBodyEvaluacion({ ...BODY_EVALUACION_VALIDO, courseId: 'abc' }).ok).toBe(false)
    expect(validarBodyEvaluacion({ ...BODY_EVALUACION_VALIDO, courseId: '0' }).ok).toBe(false)
    expect(validarBodyEvaluacion({ ...BODY_EVALUACION_VALIDO, teacherId: '' }).ok).toBe(false)
  }

  // Nodo 6-8: questionId no positivo → 400
  N8_preguntaInvalida() {
    const r = validarBodyEvaluacion({
      ...BODY_EVALUACION_VALIDO,
      answers: [{ questionId: 0, rating: 4 }],
    })
    expect(r.ok).toBe(false)
    expect(r.status).toBe(400)
  }

  // Nodo 6: Zod corre antes del rol — body inválido es 400 aunque no sea estudiante
  N8_zodAntesDelRol() {
    const r = decidirEnvioEvaluacion({
      autenticado: true,
      tipoUsuario: 'profesor',
      body: { ...BODY_EVALUACION_VALIDO, answers: [] },
      perfilEstudiante: true,
    })
    expect(r.status).toBe(400)
    expect(r.error).toBe('Datos de evaluación inválidos')
  }

  // Nodo 9: solo tipo_usuario === 'estudiante'
  N9_esEstudiante() {
    expect(esEstudiante('estudiante')).toBe(true)
    expect(esEstudiante('Estudiante')).toBe(false)
    expect(esEstudiante('student')).toBe(false)
    expect(esEstudiante(undefined)).toBe(false)
  }

  // Nodo 9-10: profesor / admin / coordinador → 403
  N10_noEsEstudiante() {
    for (const rol of ROLES_NO_ESTUDIANTE) {
      const r = decidirEnvioEvaluacion({
        autenticado: true,
        tipoUsuario: rol,
        body: BODY_EVALUACION_VALIDO,
        perfilEstudiante: true,
      })
      expect(r.status).toBe(403)
      expect(r.ok).toBe(false)
      expect(r.error).toBe('Solo los estudiantes pueden realizar evaluaciones')
      expect(r.data).toBeUndefined()
    }
  }

  // Nodo 11-13: sin fila en estudiantes → 404
  N13_estudianteNoEncontrado() {
    const r = decidirEnvioEvaluacion({
      autenticado: true,
      tipoUsuario: 'estudiante',
      body: BODY_EVALUACION_VALIDO,
      perfilEstudiante: false,
    })
    expect(r.status).toBe(404)
    expect(r.error).toBe('Estudiante no encontrado')
  }

  // Nodo 11-13: error al buscar el perfil → 404
  N13_errorAlBuscarEstudiante() {
    const r = decidirEnvioEvaluacion({
      autenticado: true,
      tipoUsuario: 'estudiante',
      body: BODY_EVALUACION_VALIDO,
      perfilEstudiante: true,
      errorPerfil: true,
    })
    expect(r.status).toBe(404)
    expect(r.error).toBe('Error al buscar el estudiante')
  }

  // Nodo 14-15: ya evaluó al mismo profesor/grupo/periodo → 409
  N15_evaluacionDuplicada() {
    const r = decidirEnvioEvaluacion({
      autenticado: true,
      tipoUsuario: 'estudiante',
      body: BODY_EVALUACION_VALIDO,
      perfilEstudiante: true,
      yaEvaluo: true,
    })
    expect(r.status).toBe(409)
    expect(r.ok).toBe(false)
    expect(r.error).toBe('Ya has evaluado a este profesor para este curso y grupo')
    expect(r.data).toBeUndefined()
  }

  // Nodo 16: la fila se inserta completada=true, periodo 1 y grupo por defecto 1
  N16_filaEvaluacion() {
    const fila = armarFilaEvaluacion({
      teacherId: '12',
      estudianteId: 'est-9',
      overallRating: 4,
      comments: 'Buen curso',
    })
    expect(fila).toMatchObject({
      profesor_id: '12',
      estudiante_id: 'est-9',
      grupo_id: 1,
      periodo_id: 1,
      completada: true,
      comentarios: 'Buen curso',
      calificacion_promedio: 4,
    })

    const conGrupo = armarFilaEvaluacion({
      teacherId: '12',
      estudianteId: 'est-9',
      groupId: '7',
      overallRating: 5,
    })
    expect(conGrupo.grupo_id).toBe('7')
    expect(conGrupo.comentarios).toBeNull()
  }

  // Nodo 16: respuestas rating / texto / vacías
  N16_respuestasIndividuales() {
    const filas = armarRespuestas('eval-1', [
      { questionId: 1, rating: 5 },
      { questionId: 2, textAnswer: '  excelente  ' },
      { questionId: 3, textAnswer: '   ' },
      { questionId: 4, selectedOption: 'A' },
    ])
    expect(filas).toHaveLength(3)
    expect(filas[0]).toMatchObject({ evaluacion_id: 'eval-1', pregunta_id: 1, respuesta_rating: 5 })
    expect(filas[1]).toMatchObject({ pregunta_id: 2, respuesta_texto: 'excelente' })
    expect(filas[2]).toMatchObject({ pregunta_id: 4, respuesta_opcion: 'A' })
  }

  // Nodo 16: fallo al insertar la evaluación → 500
  N16_errorAlInsertar() {
    const r = decidirEnvioEvaluacion({
      autenticado: true,
      tipoUsuario: 'estudiante',
      body: BODY_EVALUACION_VALIDO,
      perfilEstudiante: true,
      errorInsert: true,
    })
    expect(r.status).toBe(500)
    expect(r.error).toBe('Error al guardar la evaluación')
  }

  // Nodo 16-17: primera evaluación → 200 + evaluationId
  N17_caminoIdeal() {
    const r = decidirEnvioEvaluacion({
      autenticado: true,
      tipoUsuario: 'estudiante',
      body: BODY_EVALUACION_VALIDO,
      perfilEstudiante: true,
      evaluationId: 'eval-88',
    })
    expect(r.ok).toBe(true)
    expect(r.status).toBe(200)
    expect(r.data).toEqual({
      success: true,
      message: 'Evaluación guardada exitosamente',
      evaluationId: 'eval-88',
    })
  }

  FALLA_N5_sinTokenSeEspera200() {
    const r = decidirEnvioEvaluacion({
      autenticado: false,
      tipoUsuario: 'estudiante',
      body: BODY_EVALUACION_VALIDO,
      perfilEstudiante: true,
    })
    expect(r.status).toBe(200)
  }

  FALLA_N8_ratingInvalidoSeEspera200() {
    const r = decidirEnvioEvaluacion({
      autenticado: true,
      tipoUsuario: 'estudiante',
      body: { ...BODY_EVALUACION_VALIDO, overallRating: 9 },
      perfilEstudiante: true,
    })
    expect(r.status).toBe(200)
  }

  FALLA_N10_profesorSeEspera200() {
    const r = decidirEnvioEvaluacion({
      autenticado: true,
      tipoUsuario: 'profesor',
      body: BODY_EVALUACION_VALIDO,
      perfilEstudiante: true,
    })
    expect(r.status).toBe(200)
    expect(r.data?.success).toBe(true)
  }

  FALLA_N13_sinPerfilSeEspera200() {
    const r = decidirEnvioEvaluacion({
      autenticado: true,
      tipoUsuario: 'estudiante',
      body: BODY_EVALUACION_VALIDO,
      perfilEstudiante: false,
    })
    expect(r.status).toBe(200)
  }

  FALLA_N15_duplicadoSeEspera200() {
    const r = decidirEnvioEvaluacion({
      autenticado: true,
      tipoUsuario: 'estudiante',
      body: BODY_EVALUACION_VALIDO,
      perfilEstudiante: true,
      yaEvaluo: true,
    })
    expect(r.status).toBe(200)
    expect(r.data?.evaluationId).toBeTruthy()
  }
}

const pruebas = new RQ11EnviarEvaluacionDocente()

describe('RQ11 — Enviar la evaluación docente', () => {
  it('Nodo 3: Authorization sin Bearer → no hay token', () => pruebas.N3_sinBearer())
  it('Nodo 3-5: sin JWT → 401 NO_TOKEN', () => pruebas.N5_sinToken())
  it('Nodo 3-5: JWT inválido → 401 TOKEN_INVALID', () => pruebas.N5_tokenInvalido())
  it('Nodo 3-5: JWT expirado → 401 TOKEN_EXPIRED', () => pruebas.N5_tokenExpirado())
  it('Nodo 4: usuario inactivo no se autentica', () => pruebas.N4_usuarioInactivo())
  it('Nodo 6-7: body válido pasa el schema', () => pruebas.N7_bodyValido())
  it('Nodo 6-8: sin answers → 400', () => pruebas.N8_sinRespuestas())
  it('Nodo 6-8: answers vacío → 400', () => pruebas.N8_respuestasVacias())
  it('Nodo 6-8: rating fuera de 1–5 → 400', () => pruebas.N8_ratingFueraDeEscala())
  it('Nodo 6-8: overallRating fuera de 1–5 → 400', () => pruebas.N8_promedioFueraDeEscala())
  it('Nodo 6-8: teacherId o courseId inválidos → 400', () => pruebas.N8_idsInvalidos())
  it('Nodo 6-8: questionId inválido → 400', () => pruebas.N8_preguntaInvalida())
  it('Nodo 6-8: Zod corre antes del chequeo de rol', () => pruebas.N8_zodAntesDelRol())
  it('Nodo 9: solo tipo_usuario estudiante continúa', () => pruebas.N9_esEstudiante())
  it('Nodo 9-10: otro rol → 403', () => pruebas.N10_noEsEstudiante())
  it('Nodo 11-13: sin perfil → 404 Estudiante no encontrado', () => pruebas.N13_estudianteNoEncontrado())
  it('Nodo 11-13: error al buscar perfil → 404', () => pruebas.N13_errorAlBuscarEstudiante())
  it('Nodo 14-15: evaluación previa → 409', () => pruebas.N15_evaluacionDuplicada())
  it('Nodo 16: fila con completada=true y periodo 1', () => pruebas.N16_filaEvaluacion())
  it('Nodo 16: arma respuestas individuales', () => pruebas.N16_respuestasIndividuales())
  it('Nodo 16: error al insertar → 500', () => pruebas.N16_errorAlInsertar())
  it('Nodo 16-17: primera evaluación → 200 + evaluationId', () => pruebas.N17_caminoIdeal())
  it('FALLA N5: sin token — se espera (mal) 200', () => pruebas.FALLA_N5_sinTokenSeEspera200())
  it('FALLA N8: rating 9 — se espera (mal) 200', () => pruebas.FALLA_N8_ratingInvalidoSeEspera200())
  it('FALLA N10: profesor — se espera (mal) 200', () => pruebas.FALLA_N10_profesorSeEspera200())
  it('FALLA N13: sin perfil — se espera (mal) 200', () => pruebas.FALLA_N13_sinPerfilSeEspera200())
  it('FALLA N15: duplicado — se espera (mal) 200', () => pruebas.FALLA_N15_duplicadoSeEspera200())
})
