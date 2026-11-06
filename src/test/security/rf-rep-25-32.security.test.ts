/**
 * RF-REP-25, RF-REP-26 y RF-IA-32 — OWASP Top 10 sobre la API.
 * A01 control de acceso, A02 firma del token, A03 inyección, A04 integridad del cálculo,
 * A05 el error no filtra el stack y A07 autenticación rota.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { fromMock, supabaseModuleMock } from '../helpers/supabase-mock'
import { firmarToken, iniciarSesion, reiniciarSesion } from '../helpers/sesion-http'
import { coordinadorUser, estudianteUser, profesorUser } from '../fixtures/users'
import { estadisticasIndividuales } from '../../modules/analytics/calificaciones'
import { AiService } from '../../modules/ai-summary/ai.service'

vi.mock('../../config/supabase-only', () => supabaseModuleMock)
vi.mock('../../config/supabaseClient', () => supabaseModuleMock)

import { app } from '../../app'
import { evaluationsService } from '../../modules/evaluations/evaluations.service'

const SIN_TOKEN = { error: 'Token de acceso requerido', code: 'NO_TOKEN' }
const PROHIBIDO = { error: 'Permisos insuficientes', code: 'FORBIDDEN_ROLE' }

describe('RF-REP-25, RF-REP-26 y RF-IA-32 — Seguridad', () => {
  beforeEach(() => {
    fromMock.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
    reiniciarSesion()
  })

  it.each([
    ['resultados crudos', '/api/resultados'],
    ['estadísticas', '/api/resultados/estadisticas'],
    ['resumen del profesor', '/api/ai/summarize/by-professor?profesor_id=7'],
    ['resumen de la carrera', '/api/ai/summarize/by-career'],
    ['resumen de la facultad', '/api/ai/summarize/by-faculty'],
  ])('A01/A07: %s sin token responde 401 y no consulta la base', async (_caso, ruta) => {
    const res = await request(app).get(ruta)

    expect(res.status).toBe(401)
    expect(res.body).toEqual(SIN_TOKEN)
    expect(JSON.stringify(res.body)).not.toMatch(/stack|jsonwebtoken/i)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('A02: un JWT sin firma no abre los resultados', async () => {
    const b64 = (valor: object) => Buffer.from(JSON.stringify(valor)).toString('base64url')
    const falso = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ userId: profesorUser.id, tipo_usuario: 'profesor' })}.`

    const res = await request(app).get('/api/resultados').set('Authorization', `Bearer ${falso}`)

    expect(res.status).toBe(401)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('A02: un JWT firmado con otra clave no abre las estadísticas', async () => {
    const falso = firmarToken({ userId: profesorUser.id }, { secreto: 'otra-clave-que-no-es-la-del-servidor' })

    const res = await request(app).get('/api/resultados/estadisticas').set('Authorization', `Bearer ${falso}`)

    expect(res.status).toBe(401)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('A01: un estudiante no lee resultados ni estadísticas', async () => {
    const auth = iniciarSesion(estudianteUser)

    const crudos = await request(app).get('/api/resultados').set('Authorization', auth)
    const stats = await request(app).get('/api/resultados/estadisticas').set('Authorization', auth)

    expect(crudos.status).toBe(403)
    expect(crudos.body).toEqual(PROHIBIDO)
    expect(stats.status).toBe(403)
    expect(stats.body).toEqual(PROHIBIDO)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('A01/A03: el profesor no puede pedir las filas de otro id, ni con SQL en la consulta', async () => {
    const spy = vi.spyOn(evaluationsService, 'getCompletedResults').mockResolvedValue([])
    const auth = iniciarSesion(profesorUser)

    const res = await request(app)
      .get('/api/resultados')
      .query({ profesor_id: 'otro-id; DROP TABLE evaluaciones', periodo_id: "8 OR 1=1" })
      .set('Authorization', auth)

    expect(res.status).toBe(200)
    expect(spy).toHaveBeenCalledWith({ profesor_id: profesorUser.id })
    expect(JSON.stringify(spy.mock.calls)).not.toContain('DROP TABLE')
    expect(JSON.stringify(spy.mock.calls)).not.toContain('periodo_id')
    expect(JSON.stringify(res.body)).not.toContain('<script>')
  })

  it('A03: un periodo o grupo que no es número no llega al filtro', async () => {
    const spy = vi.spyOn(evaluationsService, 'getRatingStatistics').mockResolvedValue({
      total_evaluaciones: 0,
      calificacion_promedio: 0,
      calificacion_minima: 0,
      calificacion_maxima: 0,
      evaluaciones_por_mes: {},
    })
    const auth = iniciarSesion(coordinadorUser)

    const res = await request(app)
      .get('/api/resultados/estadisticas')
      .query({ periodo_id: '<script>alert(1)</script>', grupo_id: '4; DELETE FROM grupos' })
      .set('Authorization', auth)

    expect(res.status).toBe(200)
    expect(spy).toHaveBeenCalledWith({})
    expect(JSON.stringify(spy.mock.calls)).not.toContain('grupo_id')
    expect(JSON.stringify(res.body)).not.toContain('<script>')
  })

  it('A04: una nota 99 no infla el promedio ni la máxima', () => {
    const stats = estadisticasIndividuales([
      { calificacion_promedio: 5, fecha_completada: '2026-03-01T00:00:00.000Z' },
      { calificacion_promedio: 4, fecha_completada: '2026-03-02T00:00:00.000Z' },
      { calificacion_promedio: 99, fecha_completada: '2026-03-03T00:00:00.000Z' },
    ])

    expect(stats.total_evaluaciones).toBe(2)
    expect(stats.calificacion_promedio).toBe(4.5)
    expect(stats.calificacion_maxima).toBe(5)
  })

  it('A01/A03: el profesor no pide el resumen de otro, ni con un id inyectado', async () => {
    const auth = iniciarSesion(profesorUser)

    const res = await request(app)
      .get('/api/ai/summarize/by-professor')
      .query({ profesor_id: `${profesorUser.id}' OR '1'='1` })
      .set('Authorization', auth)

    expect(res.status).toBe(403)
    expect(res.body.error).toBe('No autorizado')
    expect(JSON.stringify(res.body)).not.toMatch(/stack|select \*|supabase/i)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('A01/A05: sin profesor_id el resumen responde 400 y no filtra el stack', async () => {
    const auth = iniciarSesion(coordinadorUser)

    const res = await request(app).get('/api/ai/summarize/by-professor').set('Authorization', auth)

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('profesor_id es requerido')
    expect(res.body).not.toHaveProperty('stack')
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('A01: el coordinador no pide el resumen de la facultad', async () => {
    const auth = iniciarSesion(coordinadorUser)

    const res = await request(app).get('/api/ai/summarize/by-faculty').set('Authorization', auth)

    expect(res.status).toBe(403)
    expect(res.body).toEqual(PROHIBIDO)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('A03: el resumen cuantitativo no incorpora una nota fuera de escala ni HTML', () => {
    const resumen = AiService.summarizeFromRatings([5, 4, 99, Number.NaN], 'profesor')

    expect(resumen.summary).toContain('2 respuestas cuantitativas')
    expect(resumen.summary).toContain('4.50/5')
    expect(resumen.summary).not.toContain('99')
    expect(resumen.summary).not.toContain('<script>')
    expect(resumen.analysisSource).toBe('quantitative_fallback')
  })
})
