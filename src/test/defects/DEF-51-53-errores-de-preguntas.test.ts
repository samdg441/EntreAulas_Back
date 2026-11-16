/**
 * DEF-51, DEF-52 y DEF-53 — Errores de las preguntas de la encuesta (RF-ENC-32, RF-ENC-33).
 *
 * Recorre toda la cadena real (ruta → controlador → servicio → repositorio); solo se simula la respuesta
 * de Supabase con los códigos que devuelve en cada caso:
 *   PGRST116 = .single() no encontró la fila · 23503 = violación de llave foránea · 0 filas = el update no tocó nada.
 *
 * Escritas en rojo antes de la corrección (TDD).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { fromMock, supabaseModuleMock } from '../helpers/supabase-mock'
import { iniciarSesion, reiniciarSesion } from '../helpers/sesion-http'
import { adminUser } from '../fixtures/users'

vi.mock('../../config/supabase-only', () => supabaseModuleMock)
vi.mock('../../config/supabaseClient', () => supabaseModuleMock)

import { app } from '../../app'

type Resultado = { data: unknown; error: unknown }

/** Cadena de consulta de Supabase que termina en `resultado` (se puede esperar directo o con .single()). */
function consulta(resultado: Resultado) {
  const cadena: Record<string, unknown> = {}
  for (const metodo of ['update', 'insert', 'eq', 'select']) cadena[metodo] = vi.fn(() => cadena)
  cadena.single = vi.fn(() => Promise.resolve(resultado))
  cadena.then = (ok: (v: Resultado) => unknown, mal: (e: unknown) => unknown) => Promise.resolve(resultado).then(ok, mal)
  return cadena
}

const NO_EXISTE = { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' }
const LLAVE_FORANEA = { code: '23503', message: 'insert or update on table "preguntas_evaluacion" violates foreign key constraint' }
const PREGUNTA = { id: 8, categoria_id: 1, texto_pregunta: 'El docente llega a tiempo', tipo_pregunta: 'likert', orden: 1, activa: true }

describe('DEF-51 a DEF-53 — Errores de las preguntas', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    fromMock.mockReset()
    reiniciarSesion()
    vi.restoreAllMocks()
  })

  it('DEF-51: corregir una pregunta que no existe responde 404, no 500', async () => {
    const auth = iniciarSesion(adminUser)
    fromMock.mockReturnValue(consulta({ data: null, error: NO_EXISTE }))

    const res = await request(app).put('/api/evaluations/questions/99999').set('Authorization', auth).send({ texto_pregunta: 'Nueva' })

    expect(res.status).toBe(404)
    expect(res.body).toMatchObject({ success: false, message: 'La pregunta no existe.' })
  })

  it('DEF-52: retirar una pregunta que no existe responde 404 y no confirma nada', async () => {
    const auth = iniciarSesion(adminUser)
    fromMock.mockReturnValue(consulta({ data: [], error: null }))

    const res = await request(app).delete('/api/evaluations/questions/99999').set('Authorization', auth)

    expect(res.status).toBe(404)
    expect(res.body).toMatchObject({ success: false, message: 'La pregunta no existe.' })
    expect(JSON.stringify(res.body)).not.toContain('exitosamente')
  })

  it('DEF-52: retirar una pregunta que sí existe sigue respondiendo 200', async () => {
    const auth = iniciarSesion(adminUser)
    fromMock.mockReturnValue(consulta({ data: [{ id: 8 }], error: null }))

    const res = await request(app).delete('/api/evaluations/questions/8').set('Authorization', auth)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true, message: 'Pregunta desactivada exitosamente' })
  })

  it('DEF-53: crear una pregunta en una encuesta que no existe responde 400, no 500', async () => {
    const auth = iniciarSesion(adminUser)
    fromMock.mockReturnValue(consulta({ data: null, error: LLAVE_FORANEA }))

    const res = await request(app)
      .post('/api/evaluations/questions')
      .set('Authorization', auth)
      .send({ categoria_id: 999, texto_pregunta: 'El docente llega a tiempo', tipo_pregunta: 'likert', orden: 1 })

    expect(res.status).toBe(400)
    expect(res.body).toMatchObject({ success: false, message: 'La encuesta no existe.' })
  })

  it('DEF-53: mover una pregunta a una encuesta que no existe también responde 400', async () => {
    const auth = iniciarSesion(adminUser)
    fromMock.mockReturnValue(consulta({ data: null, error: LLAVE_FORANEA }))

    const res = await request(app).put('/api/evaluations/questions/8').set('Authorization', auth).send({ categoria_id: 999 })

    expect(res.status).toBe(400)
    expect(res.body).toMatchObject({ message: 'La encuesta no existe.' })
  })

  it('una falla real de la base sigue siendo 500 y sin detalles internos', async () => {
    const auth = iniciarSesion(adminUser)
    fromMock.mockReturnValue(consulta({ data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } }))

    const res = await request(app).put('/api/evaluations/questions/8').set('Authorization', auth).send({ texto_pregunta: 'Nueva' })

    expect(res.status).toBe(500)
    expect(JSON.stringify(res.body)).not.toMatch(/57014|statement timeout/)
  })

  it('corregir una pregunta que existe sigue respondiendo 200 con la pregunta guardada', async () => {
    const auth = iniciarSesion(adminUser)
    fromMock.mockReturnValue(consulta({ data: { ...PREGUNTA, texto_pregunta: 'Nueva' }, error: null }))

    const res = await request(app).put('/api/evaluations/questions/8').set('Authorization', auth).send({ texto_pregunta: 'Nueva' })

    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({ id: 8, texto_pregunta: 'Nueva' })
  })
})
