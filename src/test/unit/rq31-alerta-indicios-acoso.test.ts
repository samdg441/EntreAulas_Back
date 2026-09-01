import { describe, expect, it } from 'vitest'
import type { Request, Response } from 'express'
import { authenticateToken, requireRole } from '../../middleware/auth'
import {
  construirAcosoProfesores,
  decidirResumenByCareer,
  detectarAcosoEnTextos,
  rolPuedeVerAlertaCarrera,
  ROLES_ALERTA_ACOSO,
  textoTieneIndicioAcoso,
} from '../helpers/alerta-acoso'

/**
 * RQ31 — Recibir alerta ante indicios de acoso
 * GET /api/ai/summarize/by-career
 *
 *  3-5  JWT / inactivo → 401 (no alerta)
 *  6-8  rol no coordinador/decano/admin → 403
 *  9-11 léxico sin coincidencias → 200 acosoDetectado false
 * 11-14 coincidencias → 200 acosoDetectado + mensajeAcoso + acosoProfesores
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

const TEXTOS_NEUTROS = [
  'El profesor explica con claridad y buena metodología',
  'Falta más retroalimentación en las prácticas',
]

const TEXTOS_ACOSO = [
  'El docente explica bien la materia',
  'Hubo comentarios de acoso y hostigamiento en clase',
  'Me sentí con miedo por el maltrato',
]

const RESPUESTAS_ACOSO = [
  {
    evaluacion_id: 'e1',
    profesor_id: 'prof-a',
    profesorNombre: 'Ana Diaz',
    respuesta_texto: 'Hubo comentarios de acoso y hostigamiento en clase',
  },
  {
    evaluacion_id: 'e2',
    profesor_id: 'prof-a',
    profesorNombre: 'Ana Diaz',
    respuesta_texto: 'Me sentí con miedo por el maltrato',
  },
  {
    evaluacion_id: 'e3',
    profesor_id: 'prof-b',
    profesorNombre: 'Luis Gomez',
    respuesta_texto: 'Muy puntual y claro',
  },
]

class RQ31AlertaIndiciosAcoso {
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
    expect(res.body).toMatchObject({ code: 'NO_TOKEN' })

    const r = decidirResumenByCareer({
      autenticado: false,
      tipoUsuario: 'coordinador',
      texts: TEXTOS_ACOSO,
    })
    expect(r.status).toBe(401)
    expect(r.data).toBeUndefined()
  }

  async N5_tokenInvalido() {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret'
    const req = fakeReq({ headers: { authorization: 'Bearer token-roto' } })
    const res = fakeRes()
    await authenticateToken(req, res as unknown as Response, () => {})
    expect(res.statusCode).toBe(401)
    expect(res.body).toMatchObject({ code: 'TOKEN_INVALID' })
  }

  N8_rolNoAutorizado() {
    for (const rol of ['estudiante', 'profesor', 'docente']) {
      expect(rolPuedeVerAlertaCarrera(rol)).toBe(false)
      const req = fakeReq({
        user: { roles: [rol], tipo_usuario: rol },
      } as unknown as Partial<Request>)
      const res = fakeRes()
      let llamoNext = false
      requireRole(['coordinador', 'decano', 'admin'])(req, res as unknown as Response, () => {
        llamoNext = true
      })
      expect(llamoNext).toBe(false)
      expect(res.statusCode).toBe(403)
      expect(res.body).toMatchObject({ code: 'FORBIDDEN_ROLE' })

      const r = decidirResumenByCareer({ autenticado: true, tipoUsuario: rol, texts: TEXTOS_ACOSO })
      expect(r.status).toBe(403)
      expect(r.data).toBeUndefined()
    }
  }

  N7_rolesAutorizados() {
    for (const rol of ROLES_ALERTA_ACOSO) {
      expect(rolPuedeVerAlertaCarrera(rol)).toBe(true)
      const req = fakeReq({
        user: { roles: [rol], tipo_usuario: rol },
      } as unknown as Partial<Request>)
      const res = fakeRes()
      let llamoNext = false
      requireRole(['coordinador', 'decano', 'admin'])(req, res as unknown as Response, () => {
        llamoNext = true
      })
      expect(llamoNext).toBe(true)
    }
  }

  N10_lexicoDetectaPalabras() {
    expect(textoTieneIndicioAcoso('Hubo acoso en el aula')).toBe(true)
    expect(textoTieneIndicioAcoso('HOSTIGAMIENTO reiterado')).toBe(true)
    expect(textoTieneIndicioAcoso('comentario inapropiado hacia una estudiante')).toBe(true)
    expect(textoTieneIndicioAcoso('explica con claridad')).toBe(false)
    expect(textoTieneIndicioAcoso('')).toBe(false)
  }

  N11_sinIndiciosNoHayAlerta() {
    const det = detectarAcosoEnTextos(TEXTOS_NEUTROS)
    expect(det.acosoDetectado).toBe(false)
    expect(det.mensajeAcoso).toBeUndefined()
    expect(det.textosConAcoso).toHaveLength(0)

    const r = decidirResumenByCareer({
      autenticado: true,
      tipoUsuario: 'coordinador',
      texts: TEXTOS_NEUTROS,
      respuestas: [
        {
          evaluacion_id: 'e1',
          profesor_id: 'p1',
          profesorNombre: 'Ana',
          respuesta_texto: TEXTOS_NEUTROS[0],
        },
      ],
    })
    expect(r.status).toBe(200)
    expect(r.data?.acosoDetectado).toBe(false)
    expect(r.data?.mensajeAcoso).toBeUndefined()
    expect(r.data?.acosoProfesores).toEqual([])
    expect(r.data?.textsCount).toBe(2)
    expect(r.data?.summary).toBeTruthy()
  }

  N12_conIndiciosArmaAlertaYDocentes() {
    const det = detectarAcosoEnTextos(TEXTOS_ACOSO)
    expect(det.acosoDetectado).toBe(true)
    expect(det.textosConAcoso).toHaveLength(2)
    expect(det.mensajeAcoso).toMatch(/ALERTA/)
    expect(det.mensajeAcoso).toMatch(/2 respuesta/)
    expect(det.mensajeAcoso).toMatch(/protocolos institucionales/)

    const docentes = construirAcosoProfesores(RESPUESTAS_ACOSO)
    expect(docentes).toHaveLength(1)
    expect(docentes[0]).toMatchObject({
      profesorId: 'prof-a',
      nombre: 'Ana Diaz',
      menciones: 2,
    })
    expect(docentes[0].ejemplos[0]).toMatch(/acoso/)

    const r = decidirResumenByCareer({
      autenticado: true,
      tipoUsuario: 'decano',
      texts: TEXTOS_ACOSO,
      respuestas: RESPUESTAS_ACOSO,
    })
    expect(r.status).toBe(200)
    expect(r.data?.acosoDetectado).toBe(true)
    expect(r.data?.mensajeAcoso).toBeTruthy()
    expect(r.data?.acosoProfesores).toHaveLength(1)
    expect(r.data?.acosoProfesores[0].menciones).toBe(2)
    expect(r.data?.textsCount).toBe(3)
  }

  N12_variosDocentesSeOrdenanPorMenciones() {
    const docentes = construirAcosoProfesores([
      ...RESPUESTAS_ACOSO,
      {
        evaluacion_id: 'e4',
        profesor_id: 'prof-b',
        profesorNombre: 'Luis Gomez',
        respuesta_texto: 'Amenaza e intimidación en la asesoría',
      },
    ])
    expect(docentes[0].profesorId).toBe('prof-a')
    expect(docentes[0].menciones).toBe(2)
    expect(docentes[1].profesorId).toBe('prof-b')
    expect(docentes[1].menciones).toBe(1)
  }

  FALLA_N5_sinTokenSeEsperaAlerta() {
    const r = decidirResumenByCareer({
      autenticado: false,
      tipoUsuario: 'coordinador',
      texts: TEXTOS_ACOSO,
    })
    expect(r.status).toBe(200)
    expect(r.data?.acosoDetectado).toBe(true)
  }

  FALLA_N8_profesorSeEsperaAlerta() {
    const r = decidirResumenByCareer({
      autenticado: true,
      tipoUsuario: 'profesor',
      texts: TEXTOS_ACOSO,
      respuestas: RESPUESTAS_ACOSO,
    })
    expect(r.status).toBe(200)
    expect(r.data?.acosoDetectado).toBe(true)
  }

  FALLA_N11_neutroSeEsperaAlerta() {
    const r = decidirResumenByCareer({
      autenticado: true,
      tipoUsuario: 'admin',
      texts: TEXTOS_NEUTROS,
    })
    expect(r.data?.acosoDetectado).toBe(true)
    expect(r.data?.mensajeAcoso).toMatch(/ALERTA/)
  }
}

const pruebas = new RQ31AlertaIndiciosAcoso()

describe('RQ31 — Recibir alerta ante indicios de acoso', () => {
  it('Nodo 3-5: sin JWT → 401, no hay alerta', () => pruebas.N5_sinToken())
  it('Nodo 3-5: JWT inválido → 401', () => pruebas.N5_tokenInvalido())
  it('Nodo 6-8: estudiante/profesor → 403', () => pruebas.N8_rolNoAutorizado())
  it('Nodo 7: coordinador/decano/admin continúan', () => pruebas.N7_rolesAutorizados())
  it('Nodo 10: el léxico marca acoso, hostigamiento e inapropiado', () => pruebas.N10_lexicoDetectaPalabras())
  it('Nodo 9-11: sin coincidencias → acosoDetectado false', () => pruebas.N11_sinIndiciosNoHayAlerta())
  it('Nodo 11-14: con coincidencias → alerta + acosoProfesores', () =>
    pruebas.N12_conIndiciosArmaAlertaYDocentes())
  it('Nodo 12: varios docentes se ordenan por menciones', () =>
    pruebas.N12_variosDocentesSeOrdenanPorMenciones())
  it('FALLA N5: sin token — se espera (mal) alerta', () => pruebas.FALLA_N5_sinTokenSeEsperaAlerta())
  it('FALLA N8: profesor — se espera (mal) alerta', () => pruebas.FALLA_N8_profesorSeEsperaAlerta())
  it('FALLA N11: textos neutros — se espera (mal) alerta', () => pruebas.FALLA_N11_neutroSeEsperaAlerta())
})
