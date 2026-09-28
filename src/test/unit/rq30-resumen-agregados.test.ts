import { describe, expect, it } from 'vitest'
import type { Request, Response } from 'express'
import { authenticateToken, requireRole } from '../../middleware/auth'
import { AiService } from '../../modules/ai-summary/ai.service'
import {
  applyPeriodoToFilters,
  emptyCareerSql,
  emptyFacultySql,
  emptyProfessorSql,
  extractFacultyOpenTexts,
  extractValidOpenTexts,
} from '../../modules/ai-summary/ai.routes'
import { partesPeriodo, rangoFechasPeriodo } from '../../modules/analytics/calificaciones'
import {
  alcanceNaturalDelRol,
  AVISO_POR_ALCANCE,
  contextoIaDelAlcance,
  decidirResumenPorAlcance,
  endpointPorAlcance,
  fraseDelAlcanceEnResumen,
  rolPuedePedirAlcance,
  ROLES_POR_ALCANCE,
} from '../helpers/resumen-alcance'


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

function pasaRequireRole(rolesRuta: string[], tipoUsuario: string) {
  const req = fakeReq({
    user: { roles: [tipoUsuario], tipo_usuario: tipoUsuario },
  } as unknown as Partial<Request>)
  const res = fakeRes()
  let next = false
  requireRole(rolesRuta)(req, res as unknown as Response, () => {
    next = true
  })
  return { next, status: res.statusCode, body: res.body }
}

const COMENTARIOS = [
  { respuesta_texto: 'El profesor explica con claridad y buena metodología' },
  { respuesta_texto: 'ab' },
  { respuesta_texto: 'Falta más retroalimentación en las prácticas' },
]

const NOMBRES = new Map([
  ['7', 'Ana Perez'],
  ['8', 'Luis Gomez'],
])

class RQ30ResumenesAgregados {
  async sinSesionNoHayInsights() {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret'
    const req = fakeReq()
    const res = fakeRes()
    let next = false
    await authenticateToken(req, res as unknown as Response, () => {
      next = true
    })
    expect(next).toBe(false)
    expect(res.statusCode).toBe(401)

    for (const alcance of ['profesor', 'carrera', 'facultad'] as const) {
      const r = decidirResumenPorAlcance({
        autenticado: false,
        tipoUsuario: 'decano',
        alcance,
        profesorId: 'p-1',
        respuestas: COMENTARIOS,
      })
      expect(r.status).toBe(401)
      expect(r.ok).toBe(false)
    }
  }

  cadaRolPideSuAlcanceNatural() {
    expect(alcanceNaturalDelRol('profesor')).toBe('profesor')
    expect(alcanceNaturalDelRol('docente')).toBe('profesor')
    expect(alcanceNaturalDelRol('coordinador')).toBe('carrera')
    expect(alcanceNaturalDelRol('decano')).toBe('facultad')
    expect(alcanceNaturalDelRol('admin')).toBe('facultad')

    expect(endpointPorAlcance('profesor')).toBe('/api/ai/summarize/by-professor')
    expect(endpointPorAlcance('carrera')).toBe('/api/ai/summarize/by-career')
    expect(endpointPorAlcance('facultad')).toBe('/api/ai/summarize/by-faculty')
  }

  lasRutasRechazanQuienNoCorrespondeAlAlcance() {
    const estudiante = pasaRequireRole([...ROLES_POR_ALCANCE.profesor], 'estudiante')
    expect(estudiante.next).toBe(false)
    expect(estudiante.status).toBe(403)

    const profesorEnCarrera = pasaRequireRole([...ROLES_POR_ALCANCE.carrera], 'profesor')
    expect(profesorEnCarrera.next).toBe(false)

    const coordinadorEnFacultad = pasaRequireRole([...ROLES_POR_ALCANCE.facultad], 'coordinador')
    expect(coordinadorEnFacultad.next).toBe(false)

    expect(rolPuedePedirAlcance('estudiante', 'profesor')).toBe(false)
    expect(rolPuedePedirAlcance('profesor', 'carrera')).toBe(false)
    expect(rolPuedePedirAlcance('coordinador', 'facultad')).toBe(false)

    const r = decidirResumenPorAlcance({
      autenticado: true,
      tipoUsuario: 'profesor',
      alcance: 'facultad',
      respuestas: COMENTARIOS,
    })
    expect(r.status).toBe(403)
  }

  rolesAutorizadosEntranASuRuta() {
    expect(pasaRequireRole([...ROLES_POR_ALCANCE.profesor], 'profesor').next).toBe(true)
    expect(pasaRequireRole([...ROLES_POR_ALCANCE.carrera], 'coordinador').next).toBe(true)
    expect(pasaRequireRole([...ROLES_POR_ALCANCE.facultad], 'decano').next).toBe(true)
    expect(pasaRequireRole([...ROLES_POR_ALCANCE.facultad], 'admin').next).toBe(true)
  }

  profesorSoloSeResumeASiMismo() {
    const propio = decidirResumenPorAlcance({
      autenticado: true,
      tipoUsuario: 'profesor',
      userId: 'p-1',
      alcance: 'profesor',
      profesorId: 'p-1',
      respuestas: COMENTARIOS,
    })
    expect(propio.status).toBe(200)
    expect(propio.ok && propio.data.alcance).toBe('profesor')

    const ajeno = decidirResumenPorAlcance({
      autenticado: true,
      tipoUsuario: 'profesor',
      userId: 'p-1',
      alcance: 'profesor',
      profesorId: 'otro',
      respuestas: COMENTARIOS,
    })
    expect(ajeno.status).toBe(403)

    const adminAjeno = decidirResumenPorAlcance({
      autenticado: true,
      tipoUsuario: 'admin',
      userId: 'admin-1',
      alcance: 'profesor',
      profesorId: 'p-1',
      respuestas: COMENTARIOS,
    })
    expect(adminAjeno.status).toBe(200)
  }

  sinComentariosElAvisoNombraElAlcance() {
    const docente = decidirResumenPorAlcance({
      autenticado: true,
      tipoUsuario: 'profesor',
      userId: 'p-1',
      alcance: 'profesor',
      profesorId: 'p-1',
    })
    expect(docente.ok && docente.data.summary).toBe(AVISO_POR_ALCANCE.profesor)
    expect(docente.ok && docente.data.summary).toMatch(/profesor/)

    const carrera = decidirResumenPorAlcance({
      autenticado: true,
      tipoUsuario: 'coordinador',
      alcance: 'carrera',
    })
    expect(carrera.ok && carrera.data.summary).toBe(AVISO_POR_ALCANCE.carrera)
    expect(carrera.ok && carrera.data.summary).toMatch(/carrera/)

    const facultad = decidirResumenPorAlcance({
      autenticado: true,
      tipoUsuario: 'decano',
      alcance: 'facultad',
    })
    expect(facultad.ok && facultad.data.summary).toBe(AVISO_POR_ALCANCE.facultad)
    expect(facultad.ok && facultad.data.summary).toMatch(/facultad/)

    expect(emptyProfessorSql(1, { periodo_id: 9 })).toContain('e.carrera_id = 1')
    expect(emptyCareerSql(2, 9)).toContain('carrera_id = 2')
    expect(emptyFacultySql(9)).toContain('periodo_id = 9')
  }

  comentariosAbiertosProducenInsightsDelAlcance() {
    const docente = decidirResumenPorAlcance({
      autenticado: true,
      tipoUsuario: 'profesor',
      userId: 'p-1',
      alcance: 'profesor',
      profesorId: 'p-1',
      respuestas: COMENTARIOS,
    })
    expect(docente.status).toBe(200)
    expect(docente.ok && docente.data.analysisSource).toBe('open_text')
    expect(docente.ok && docente.data.textsCount).toBe(2)
    expect(docente.ok && docente.data.endpoint).toContain('by-professor')
    expect(docente.ok && docente.data.summary).toMatch(/profesor/)

    const carrera = decidirResumenPorAlcance({
      autenticado: true,
      tipoUsuario: 'coordinador',
      alcance: 'carrera',
      respuestas: COMENTARIOS,
    })
    expect(carrera.ok && carrera.data.endpoint).toContain('by-career')
    expect(carrera.ok && carrera.data.summary).toMatch(/coordinador/)

    const facultad = decidirResumenPorAlcance({
      autenticado: true,
      tipoUsuario: 'decano',
      alcance: 'facultad',
      respuestas: COMENTARIOS,
    })
    expect(facultad.ok && facultad.data.endpoint).toContain('by-faculty')
    expect(facultad.ok && facultad.data.summary).toMatch(/decano/)
  }

  valoracionesSinTextoHablanDelAlcanceCorrecto() {
    const ratings = [4, 5, 4, 3]
    const docente = AiService.summarizeFromRatings(ratings, contextoIaDelAlcance('profesor'))
    expect(fraseDelAlcanceEnResumen(docente.summary, 'profesor')).toBe(true)
    expect(docente.analysisSource).toBe('quantitative_fallback')

    const carrera = decidirResumenPorAlcance({
      autenticado: true,
      tipoUsuario: 'coordinador',
      alcance: 'carrera',
      ratings,
      evaluaciones: [
        { profesor_id: 7, calificacion_promedio: 3.2 },
        { profesor_id: 8, calificacion_promedio: 4.8 },
      ],
      nombresDocentes: NOMBRES,
    })
    expect(carrera.ok && carrera.data.analysisSource).toBe('quantitative_fallback')
    expect(carrera.ok && fraseDelAlcanceEnResumen(carrera.data.summary, 'carrera')).toBe(true)
    expect(carrera.ok && carrera.data.summary).toMatch(/docentes de la carrera/)
    expect(carrera.ok && carrera.data.topics).toContain('docentes bajo 4.0')
    expect(carrera.ok && carrera.data.lowPerformers).toEqual([
      expect.objectContaining({ profesorId: '7', nombre: 'Ana Perez' }),
    ])

    const facultad = decidirResumenPorAlcance({
      autenticado: true,
      tipoUsuario: 'decano',
      alcance: 'facultad',
      ratings,
    })
    expect(facultad.ok && fraseDelAlcanceEnResumen(facultad.data.summary, 'facultad')).toBe(true)
    expect(facultad.ok && facultad.data.summary).toMatch(/docentes de la facultad/)
  }

  facultadExigeTextosUnPocoMasLargosQueDocente() {
    const corto = [{ respuesta_texto: 'abc' }]
    expect(extractValidOpenTexts(corto)).toEqual(['abc'])
    expect(extractFacultyOpenTexts(corto)).toEqual([])

    const r = decidirResumenPorAlcance({
      autenticado: true,
      tipoUsuario: 'decano',
      alcance: 'facultad',
      respuestas: corto,
    })
    expect(r.ok && r.data.textsCount).toBe(0)
    expect(r.ok && r.data.summary).toMatch(/facultad/)
  }

  async elPeriodoSeLeeIgualEnLosTresAlcances() {
    expect(partesPeriodo('2026-1')).toEqual({ year: 2026, semester: 1 })
    expect(rangoFechasPeriodo('2026-1')).toEqual({ start: '2026-01-01', end: '2026-06-30' })

    const filtros: { periodo_gte?: string; periodo_lte?: string; periodo_id?: number } = {}
    await applyPeriodoToFilters(filtros, '2026-1')
    expect(filtros.periodo_gte).toBe('2026-01-01')
    expect(filtros.periodo_lte).toBe('2026-06-30')

    const numerico: { periodo_id?: number } = {}
    await applyPeriodoToFilters(numerico, '12')
    expect(numerico.periodo_id).toBe(12)
  }

  FALLA_estudianteRecibeFacultad() {
    const r = decidirResumenPorAlcance({
      autenticado: true,
      tipoUsuario: 'estudiante',
      alcance: 'facultad',
      respuestas: COMENTARIOS,
    })
    expect(r.status).toBe(200)
    expect(r.ok && r.data.alcance).toBe('facultad')
  }

  FALLA_profesorConsultaCarrera() {
    const r = decidirResumenPorAlcance({
      autenticado: true,
      tipoUsuario: 'profesor',
      userId: 'p-1',
      alcance: 'carrera',
      ratings: [5, 5],
    })
    expect(r.status).toBe(200)
    expect(r.ok && r.data.summary).toMatch(/carrera/)
  }

  FALLA_avisoDeDocenteSeEsperaDeFacultad() {
    const r = decidirResumenPorAlcance({
      autenticado: true,
      tipoUsuario: 'profesor',
      userId: 'p-1',
      alcance: 'profesor',
      profesorId: 'p-1',
    })
    expect(r.ok && r.data.summary).toMatch(/facultad/)
  }
}

const pruebas = new RQ30ResumenesAgregados()

describe('RQ30 — Resúmenes agregados por docente, carrera o facultad', () => {
  it('Dado que no hay sesión, cuando pide cualquier alcance, entonces responde 401', () =>
    pruebas.sinSesionNoHayInsights())
  it('Dado el rol del usuario, cuando elige análisis, entonces usa el alcance natural', () =>
    pruebas.cadaRolPideSuAlcanceNatural())
  it('Dado un rol fuera de alcance, cuando pide carrera o facultad, entonces 403', () =>
    pruebas.lasRutasRechazanQuienNoCorrespondeAlAlcance())
  it('Dado profesor, coordinador o decano, cuando entra a su ruta, entonces continúa', () =>
    pruebas.rolesAutorizadosEntranASuRuta())
  it('Dado un profesor, cuando pide el resumen de otro, entonces se le niega', () =>
    pruebas.profesorSoloSeResumeASiMismo())
  it('Dado que no hay comentarios, cuando pide el resumen, entonces el aviso nombra el alcance', () =>
    pruebas.sinComentariosElAvisoNombraElAlcance())
  it('Dado comentarios abiertos, cuando pide el resumen, entonces los insights son de ese alcance', () =>
    pruebas.comentariosAbiertosProducenInsightsDelAlcance())
  it('Dado solo valoraciones, cuando pide el resumen, entonces el fallback habla de docente, carrera o facultad', () =>
    pruebas.valoracionesSinTextoHablanDelAlcanceCorrecto())
  it('Dado textos cortos, cuando el alcance es facultad, entonces no cuentan como comentario abierto', () =>
    pruebas.facultadExigeTextosUnPocoMasLargosQueDocente())
  it('Dado un período YYYY-X, cuando filtra cualquiera de los tres alcances, entonces se traduce a fechas', () =>
    pruebas.elPeriodoSeLeeIgualEnLosTresAlcances())
  it.fails('FALLA: un estudiante recibe insights de facultad', () => pruebas.FALLA_estudianteRecibeFacultad())
  it.fails('FALLA: un profesor consulta la carrera y se espera (mal) 200', () =>
    pruebas.FALLA_profesorConsultaCarrera())
  it.fails('FALLA: el aviso de docente se espera (mal) de facultad', () =>
    pruebas.FALLA_avisoDeDocenteSeEsperaDeFacultad())
})
