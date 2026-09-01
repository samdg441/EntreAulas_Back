import { describe, expect, it } from 'vitest'
import type { Request, Response } from 'express'
import { authenticateToken, requireRole } from '../../middleware/auth'
import { AiService } from '../../modules/ai-summary/ai.service'
import {
  AVISO_SIN_DATOS,
  decidirResumenByProfessor,
  resumenLocal,
  rolPuedeResumir,
  ROLES_RESUMEN_IA,
} from '../helpers/resumen-ia'

/**
 * RQ29 — Generar resumen automático de comentarios
 * GET /api/ai/summarize/by-professor
 *
 *  3-5  JWT / inactivo → 401
 *  6-8  rol no autorizado (estudiante) → 403
 *  9-13 sin textos ni ratings → 200 aviso sin datos
 * 11-12 sin textos, con ratings → quantitative_fallback
 * 14-15 Gemini OK → open_text
 * 15-16 Gemini falla → resumen local
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

const ROLES_OK = [...ROLES_RESUMEN_IA]
const TEXTOS = [
  'El profesor explica con claridad y buena metodología',
  'Falta más retroalimentación en las prácticas',
]

class RQ29ResumenAutomaticoComentarios {
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

    const r = decidirResumenByProfessor({
      autenticado: false,
      tipoUsuario: 'profesor',
      profesorId: 'p-1',
      texts: TEXTOS,
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

  N8_estudianteForbidden() {
    const req = fakeReq({
      user: { roles: ['estudiante'], tipo_usuario: 'estudiante' },
    } as unknown as Partial<Request>)
    const res = fakeRes()
    let llamoNext = false
    requireRole(['docente', 'profesor', 'coordinador', 'decano', 'admin'])(
      req,
      res as unknown as Response,
      () => {
        llamoNext = true
      }
    )
    expect(llamoNext).toBe(false)
    expect(res.statusCode).toBe(403)
    expect(res.body).toMatchObject({ code: 'FORBIDDEN_ROLE' })

    expect(rolPuedeResumir('estudiante')).toBe(false)
    const r = decidirResumenByProfessor({
      autenticado: true,
      tipoUsuario: 'estudiante',
      profesorId: 'p-1',
      texts: TEXTOS,
    })
    expect(r.status).toBe(403)
    expect(r.error).toBe('Permisos insuficientes')
  }

  N7_rolesAutorizadosContinuan() {
    for (const rol of ROLES_OK) {
      expect(rolPuedeResumir(rol)).toBe(true)
      const req = fakeReq({
        user: { roles: [rol], tipo_usuario: rol },
      } as unknown as Partial<Request>)
      const res = fakeRes()
      let llamoNext = false
      requireRole(['docente', 'profesor', 'coordinador', 'decano', 'admin'])(
        req,
        res as unknown as Response,
        () => {
          llamoNext = true
        }
      )
      expect(llamoNext).toBe(true)
    }
  }

  N8_profesorNoConsultaAOtro() {
    const r = decidirResumenByProfessor({
      autenticado: true,
      tipoUsuario: 'profesor',
      userId: 'prof-1',
      profesorId: 'prof-ajeno',
      texts: TEXTOS,
    })
    expect(r.status).toBe(403)
    expect(r.error).toBe('No autorizado')
  }

  N13_sinTextosNiRatings() {
    const r = decidirResumenByProfessor({
      autenticado: true,
      tipoUsuario: 'coordinador',
      profesorId: 'p-1',
      texts: [],
      ratings: [],
    })
    expect(r.ok).toBe(true)
    expect(r.status).toBe(200)
    expect(r.data?.textsCount).toBe(0)
    expect(r.data?.topics).toEqual([])
    expect(r.data?.summary).toMatch(/respuestas abiertas/i)
    expect(r.data?.summary).toBe(AVISO_SIN_DATOS)
    expect(r.data?.analysisSource).toBeUndefined()
  }

  N12_fallbackCuantitativo() {
    const ratings = [5, 4, 3, 5]
    const directo = AiService.summarizeFromRatings(ratings, 'profesor')
    expect(directo.analysisSource).toBe('quantitative_fallback')
    expect(directo.topics.length).toBeGreaterThan(0)
    expect(directo.summary).toMatch(/respuestas cuantitativas/)
    expect(directo.summary).toMatch(/4\./)

    const r = decidirResumenByProfessor({
      autenticado: true,
      tipoUsuario: 'profesor',
      userId: 'p-1',
      profesorId: 'p-1',
      texts: [],
      ratings,
    })
    expect(r.status).toBe(200)
    expect(r.data?.textsCount).toBe(0)
    expect(r.data?.ratingsCount).toBe(4)
    expect(r.data?.analysisSource).toBe('quantitative_fallback')
    expect(r.data?.topics).toContain('sin respuestas abiertas')
    expect(r.data?.summary.length).toBeGreaterThan(20)
  }

  N12_ratingsInvalidosNoSirven() {
    const vacio = AiService.summarizeFromRatings([], 'profesor')
    expect(vacio.topics).toEqual([])
    expect(vacio.summary).toMatch(/No hay respuestas cuantitativas/)

    const invalidos = AiService.summarizeFromRatings([0, 99, NaN], 'profesor')
    expect(invalidos.summary).toMatch(/válidas/)
  }

  N17_geminiProduceResumen() {
    const r = decidirResumenByProfessor({
      autenticado: true,
      tipoUsuario: 'coordinador',
      profesorId: 'p-1',
      texts: TEXTOS,
      geminiOk: true,
      geminiSummary: 'Los estudiantes destacan claridad y piden más retroalimentación.',
      geminiTopics: ['claridad', 'retroalimentacion'],
    })
    expect(r.status).toBe(200)
    expect(r.data?.textsCount).toBe(2)
    expect(r.data?.analysisSource).toBe('open_text')
    expect(r.data?.summary).toContain('claridad')
    expect(r.data?.topics).toEqual(['claridad', 'retroalimentacion'])
  }

  N16_geminiFallaUsaLocal() {
    const local = resumenLocal(TEXTOS)
    expect(local.analysisSource).toBe('open_text')
    expect(local.summary).toMatch(/Resumen local/)
    expect(local.topics.length).toBeGreaterThan(0)

    const r = decidirResumenByProfessor({
      autenticado: true,
      tipoUsuario: 'admin',
      profesorId: 'p-1',
      texts: TEXTOS,
      geminiOk: false,
    })
    expect(r.status).toBe(200)
    expect(r.data?.textsCount).toBe(2)
    expect(r.data?.analysisSource).toBe('open_text')
    expect(r.data?.summary).toBe(local.summary)
    expect(r.data?.topics).toEqual(local.topics)
  }

  FALLA_N5_sinTokenSeEspera200() {
    const r = decidirResumenByProfessor({
      autenticado: false,
      tipoUsuario: 'profesor',
      profesorId: 'p-1',
      texts: TEXTOS,
    })
    expect(r.status).toBe(200)
  }

  FALLA_N8_estudianteSeEsperaResumen() {
    const r = decidirResumenByProfessor({
      autenticado: true,
      tipoUsuario: 'estudiante',
      profesorId: 'p-1',
      texts: TEXTOS,
      geminiOk: true,
      geminiSummary: 'no debería llegar',
    })
    expect(r.status).toBe(200)
    expect(r.data?.summary).toBe('no debería llegar')
  }

  FALLA_N13_sinDatosSeEsperaTemas() {
    const r = decidirResumenByProfessor({
      autenticado: true,
      tipoUsuario: 'profesor',
      userId: 'p-1',
      profesorId: 'p-1',
      texts: [],
      ratings: [],
    })
    expect(r.data?.topics.length).toBeGreaterThan(0)
    expect(r.data?.analysisSource).toBe('open_text')
  }

  FALLA_N16_sinGeminiSeEsperaVacio() {
    const r = decidirResumenByProfessor({
      autenticado: true,
      tipoUsuario: 'profesor',
      userId: 'p-1',
      profesorId: 'p-1',
      texts: TEXTOS,
      geminiOk: false,
    })
    expect(r.data?.summary).toBe('')
  }
}

const pruebas = new RQ29ResumenAutomaticoComentarios()

describe('RQ29 — Generar resumen automático de comentarios', () => {
  it('Nodo 3-5: sin JWT → 401', () => pruebas.N5_sinToken())
  it('Nodo 3-5: JWT inválido → 401', () => pruebas.N5_tokenInvalido())
  it('Nodo 6-8: estudiante → 403 FORBIDDEN_ROLE', () => pruebas.N8_estudianteForbidden())
  it('Nodo 7: docente/profesor/coordinador/decano/admin continúan', () =>
    pruebas.N7_rolesAutorizadosContinuan())
  it('Nodo 8: profesor no consulta a otro → 403', () => pruebas.N8_profesorNoConsultaAOtro())
  it('Nodo 9-13: sin textos ni ratings → 200 aviso sin datos', () => pruebas.N13_sinTextosNiRatings())
  it('Nodo 11-12: solo ratings → quantitative_fallback', () => pruebas.N12_fallbackCuantitativo())
  it('Nodo 12: ratings vacíos o inválidos no generan promedio', () => pruebas.N12_ratingsInvalidosNoSirven())
  it('Nodo 14-17: Gemini OK → open_text', () => pruebas.N17_geminiProduceResumen())
  it('Nodo 15-16: Gemini falla → resumen local', () => pruebas.N16_geminiFallaUsaLocal())
  it('FALLA N5: sin token — se espera (mal) 200', () => pruebas.FALLA_N5_sinTokenSeEspera200())
  it('FALLA N8: estudiante — se espera (mal) resumen', () => pruebas.FALLA_N8_estudianteSeEsperaResumen())
  it('FALLA N13: sin datos — se espera (mal) temas', () => pruebas.FALLA_N13_sinDatosSeEsperaTemas())
  it('FALLA N16: sin Gemini — se espera (mal) vacío', () => pruebas.FALLA_N16_sinGeminiSeEsperaVacio())
})
