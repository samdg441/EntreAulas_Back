import { describe, expect, it } from 'vitest'
import type { Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { authenticateToken } from '../../middleware/auth'
import { extraerBearer, usuarioPuedeAutenticarse } from '../helpers/rbac'
import {
  calcularStatsEstudiante,
  CAMPOS_STATS_ESTUDIANTE,
  decidirStudentStats,
  esEstudiante,
  STATS_ESTUDIANTE_CERO,
} from '../helpers/estudiante-stats'

/**
 * RQ10 — Evaluaciones del estudiante (GET /api/teachers/student-stats)
 *
 * Nodos del grafo backend:
 *  1-2  Recibe GET student-stats
 *  3-5  JWT / usuario inactivo → 401
 *  6-7  tipo_usuario !== estudiante → 403
 *  8-10 Sin fila en estudiantes → 200 con ceros
 *  11   Consulta evaluaciones completadas e inscripciones activas
 *  12   Pendientes = matriculadas − completadas
 *  13-14 Excepción no controlada → 500
 *  15-16 JSON con evaluacionesCompletadas y evaluacionesPendientes
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

const evaluacionIdeal = [
  { calificacion_promedio: 4 },
  { calificacion_promedio: 5 },
]

class RQ10EvaluacionesEstudiante {
  // Nodo 3: Authorization sin Bearer → no hay token
  N3_sinBearer() {
    expect(extraerBearer(undefined)).toBeNull()
    expect(extraerBearer('')).toBeNull()
    expect(extraerBearer('Basic abc')).toBeNull()
    expect(extraerBearer('Bearer ')).toBeNull()
  }

  // Nodo 3-5: request sin header Authorization → 401 NO_TOKEN (middleware real)
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

    const r = decidirStudentStats({
      autenticado: false,
      tipoUsuario: 'estudiante',
      perfilEstudiante: true,
    })
    expect(r.status).toBe(401)
    expect(r.ok).toBe(false)
    expect(r.data).toBeUndefined()
  }

  // Nodo 3-5: Bearer presente pero el JWT no verifica → 401 TOKEN_INVALID
  async N5_tokenInvalido() {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret'
    const req = fakeReq({ headers: { authorization: 'Bearer esto-no-es-un-jwt' } })
    const res = fakeRes()
    let llamoNext = false
    await authenticateToken(req, res as unknown as Response, () => {
      llamoNext = true
    })
    expect(llamoNext).toBe(false)
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

  // Nodo 3-5: usuario inactivo no pasa autenticación
  N5_usuarioInactivo() {
    expect(usuarioPuedeAutenticarse(null)).toBe(false)
    expect(usuarioPuedeAutenticarse({ activo: false })).toBe(false)
    expect(usuarioPuedeAutenticarse({ activo: true })).toBe(true)
  }

  // Nodo 6: solo tipo_usuario === 'estudiante' continúa
  N6_esEstudiante() {
    expect(esEstudiante('estudiante')).toBe(true)
    expect(esEstudiante('Estudiante')).toBe(false)
    expect(esEstudiante('student')).toBe(false)
    expect(esEstudiante(undefined)).toBe(false)
    expect(esEstudiante('')).toBe(false)
  }

  // Nodo 6-7: profesor, admin, coordinador, decano, docente → 403
  N7_noEsEstudiante() {
    for (const rol of ROLES_NO_ESTUDIANTE) {
      expect(esEstudiante(rol)).toBe(false)
      const r = decidirStudentStats({
        autenticado: true,
        tipoUsuario: rol,
        perfilEstudiante: true,
        inscripcionesActivas: 4,
        evaluacionesCompletadas: evaluacionIdeal,
      })
      expect(r.status).toBe(403)
      expect(r.ok).toBe(false)
      expect(r.error).toBe('Solo los estudiantes pueden acceder a estas estadísticas')
      expect(r.data).toBeUndefined()
    }
  }

  // Nodo 8-10: autenticado estudiante, sin fila en estudiantes → 200 con ceros
  N10_sinPerfilDevuelveCeros() {
    const r = decidirStudentStats({
      autenticado: true,
      tipoUsuario: 'estudiante',
      perfilEstudiante: false,
    })
    expect(r.ok).toBe(true)
    expect(r.status).toBe(200)
    expect(r.data).toEqual(STATS_ESTUDIANTE_CERO)
    expect(r.data?.evaluacionesPendientes).toBe(0)
    expect(r.data?.evaluacionesCompletadas).toBe(0)
    expect(r.data?.materiasMatriculadas).toBe(0)
    expect(r.data?.promedioGeneral).toBe(0)
    expect(r.data?.progresoGeneral).toBe(0)
  }

  // Nodo 8-10: error al buscar el perfil se trata igual que "no encontrado"
  N10_errorPerfilDevuelveCeros() {
    const r = decidirStudentStats({
      autenticado: true,
      tipoUsuario: 'estudiante',
      perfilEstudiante: true,
      errorPerfil: true,
    })
    expect(r.status).toBe(200)
    expect(r.data).toEqual(STATS_ESTUDIANTE_CERO)
  }

  // Nodo 11: consulta de evaluaciones/inscripciones nula o con error no corta el flujo
  N11_consultaVaciaOConError() {
    const sinDatos = decidirStudentStats({
      autenticado: true,
      tipoUsuario: 'estudiante',
      perfilEstudiante: true,
      inscripcionesActivas: null,
      evaluacionesCompletadas: null,
    })
    expect(sinDatos.status).toBe(200)
    expect(sinDatos.data).toEqual(STATS_ESTUDIANTE_CERO)

    const errorConsulta = decidirStudentStats({
      autenticado: true,
      tipoUsuario: 'estudiante',
      perfilEstudiante: true,
      errorConsultaEvaluaciones: true,
      errorConsultaInscripciones: true,
      inscripcionesActivas: 8,
      evaluacionesCompletadas: evaluacionIdeal,
    })
    expect(errorConsulta.status).toBe(200)
    expect(errorConsulta.data).toEqual(STATS_ESTUDIANTE_CERO)
  }

  // Nodo 12: pendientes = inscripciones activas − evaluaciones completadas
  N12_formulaPendientes() {
    const stats = calcularStatsEstudiante(4, evaluacionIdeal)
    expect(stats.materiasMatriculadas).toBe(4)
    expect(stats.evaluacionesCompletadas).toBe(2)
    expect(stats.evaluacionesPendientes).toBe(2)
  }

  // Nodo 12: si hay más completadas que matriculadas, pendientes no bajan de 0
  N12_pendientesNoNegativos() {
    const stats = calcularStatsEstudiante(1, evaluacionIdeal)
    expect(stats.evaluacionesPendientes).toBe(0)
    expect(stats.evaluacionesCompletadas).toBe(2)
    expect(stats.materiasMatriculadas).toBe(1)
  }

  // Nodo 12: sin inscripciones y sin evaluaciones → ceros, progreso 0
  N12_sinInscripciones() {
    const stats = calcularStatsEstudiante(0, [])
    expect(stats).toEqual(STATS_ESTUDIANTE_CERO)
  }

  // Nodo 12: todas las materias evaluadas → pendientes 0 y progreso 100
  N12_progresoCompleto() {
    const stats = calcularStatsEstudiante(2, evaluacionIdeal)
    expect(stats.evaluacionesPendientes).toBe(0)
    expect(stats.progresoGeneral).toBe(100)
    expect(stats.promedioGeneral).toBe(4.5)
  }

  // Nodo 12: calificacion_promedio null o ausente cuenta como 0 en el promedio
  N12_promedioConNulos() {
    const stats = calcularStatsEstudiante(3, [
      { calificacion_promedio: 4 },
      { calificacion_promedio: null },
      {},
    ])
    expect(stats.evaluacionesCompletadas).toBe(3)
    expect(stats.evaluacionesPendientes).toBe(0)
    expect(stats.promedioGeneral).toBe(1.33)
  }

  // Nodo 13-14: excepción no controlada → 500
  N14_errorInterno() {
    const r = decidirStudentStats({
      autenticado: true,
      tipoUsuario: 'estudiante',
      perfilEstudiante: true,
      errorInterno: true,
    })
    expect(r.ok).toBe(false)
    expect(r.status).toBe(500)
    expect(r.error).toBe('Error interno del servidor')
    expect(r.details).toBeTruthy()
    expect(r.data).toBeUndefined()
  }

  // Nodo 15-16: camino feliz — JSON con los 5 campos del dashboard
  N16_caminoIdeal() {
    const r = decidirStudentStats({
      autenticado: true,
      tipoUsuario: 'estudiante',
      perfilEstudiante: true,
      inscripcionesActivas: 4,
      evaluacionesCompletadas: evaluacionIdeal,
    })
    expect(r.ok).toBe(true)
    expect(r.status).toBe(200)
    expect(r.data).toEqual({
      evaluacionesCompletadas: 2,
      evaluacionesPendientes: 2,
      materiasMatriculadas: 4,
      promedioGeneral: 4.5,
      progresoGeneral: 50,
    })
    for (const campo of CAMPOS_STATS_ESTUDIANTE) {
      expect(r.data).toHaveProperty(campo)
      expect(typeof r.data?.[campo]).toBe('number')
    }
  }

  // FALLA a propósito: sin token el código responde 401, no 200
  FALLA_N5_sinTokenSeEspera200() {
    const r = decidirStudentStats({
      autenticado: false,
      tipoUsuario: 'estudiante',
      perfilEstudiante: true,
    })
    expect(r.status).toBe(200)
  }

  // FALLA a propósito: un profesor no debería recibir stats
  FALLA_N7_profesorSeEspera200() {
    const r = decidirStudentStats({
      autenticado: true,
      tipoUsuario: 'profesor',
      perfilEstudiante: true,
      inscripcionesActivas: 4,
      evaluacionesCompletadas: evaluacionIdeal,
    })
    expect(r.status).toBe(200)
    expect(r.data?.evaluacionesPendientes).toBe(2)
  }

  // FALLA a propósito: sin perfil el dashboard no debe inventar cifras
  FALLA_N10_sinPerfilSeEsperaCifras() {
    const r = decidirStudentStats({
      autenticado: true,
      tipoUsuario: 'estudiante',
      perfilEstudiante: false,
    })
    expect(r.data?.evaluacionesPendientes).toBe(3)
    expect(r.data?.evaluacionesCompletadas).toBe(2)
  }

  // FALLA a propósito: 4 matriculadas − 2 completadas no es 4 pendientes
  FALLA_N12_pendientesMalCalculadas() {
    const stats = calcularStatsEstudiante(4, evaluacionIdeal)
    expect(stats.evaluacionesPendientes).toBe(4)
  }

  // FALLA a propósito: una excepción no debe responder 200
  FALLA_N14_errorInternoSeEspera200() {
    const r = decidirStudentStats({
      autenticado: true,
      tipoUsuario: 'estudiante',
      perfilEstudiante: true,
      errorInterno: true,
    })
    expect(r.status).toBe(200)
  }
}

const pruebas = new RQ10EvaluacionesEstudiante()

describe('RQ10 — Evaluaciones del estudiante', () => {
  it('Nodo 3: Authorization sin Bearer → no hay token', () => pruebas.N3_sinBearer())
  it('Nodo 3-5: sin JWT → 401 NO_TOKEN', () => pruebas.N5_sinToken())
  it('Nodo 3-5: JWT inválido → 401 TOKEN_INVALID', () => pruebas.N5_tokenInvalido())
  it('Nodo 3-5: JWT expirado → 401 TOKEN_EXPIRED', () => pruebas.N5_tokenExpirado())
  it('Nodo 3-5: usuario inactivo no se autentica', () => pruebas.N5_usuarioInactivo())
  it('Nodo 6: solo tipo_usuario estudiante continúa', () => pruebas.N6_esEstudiante())
  it('Nodo 6-7: otro rol → 403', () => pruebas.N7_noEsEstudiante())
  it('Nodo 8-10: sin perfil de estudiante → 200 con ceros', () => pruebas.N10_sinPerfilDevuelveCeros())
  it('Nodo 8-10: error al buscar perfil → 200 con ceros', () => pruebas.N10_errorPerfilDevuelveCeros())
  it('Nodo 11: consulta vacía o con error → 200 con ceros', () => pruebas.N11_consultaVaciaOConError())
  it('Nodo 12: pendientes = matriculadas − completadas', () => pruebas.N12_formulaPendientes())
  it('Nodo 12: pendientes no pueden ser negativos', () => pruebas.N12_pendientesNoNegativos())
  it('Nodo 12: sin inscripciones → ceros', () => pruebas.N12_sinInscripciones())
  it('Nodo 12: progreso 100 cuando no hay pendientes', () => pruebas.N12_progresoCompleto())
  it('Nodo 12: promedio trata null como 0', () => pruebas.N12_promedioConNulos())
  it('Nodo 13-14: error interno → 500', () => pruebas.N14_errorInterno())
  it('Nodo 15-16: JSON con pendientes y completadas', () => pruebas.N16_caminoIdeal())
  it('FALLA N5: sin token — se espera (mal) 200', () => pruebas.FALLA_N5_sinTokenSeEspera200())
  it('FALLA N7: profesor — se espera (mal) 200 con stats', () => pruebas.FALLA_N7_profesorSeEspera200())
  it('FALLA N10: sin perfil — se espera (mal) cifras reales', () =>
    pruebas.FALLA_N10_sinPerfilSeEsperaCifras())
  it('FALLA N12: pendientes — se espera (mal) 4 en vez de 2', () =>
    pruebas.FALLA_N12_pendientesMalCalculadas())
  it('FALLA N14: 500 — se espera (mal) 200', () => pruebas.FALLA_N14_errorInternoSeEspera200())
})
