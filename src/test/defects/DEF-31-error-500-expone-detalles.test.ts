/**
 * DEF-31 — Los 500 exponen el mensaje interno del error (RQ22/RQ24)
 *
 * Severidad: Media | Estado: ABIERTO | Visto en producción como DEF-API-01 (Cypress, front)
 *
 * `sendError` responde `{ error, details: error.message }` ante cualquier error que no sea
 * AppError. En Render, `profesor-stats/abc` devuelve el texto de PostgreSQL
 * (`invalid input syntax for type bigint`): revela motor, tipos y nombres de columnas.
 * Además `abc` no se valida: debería ser 400 sin llegar a la base.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { supabaseModuleMock } from '../helpers/supabase-mock'
import { iniciarSesion, reiniciarSesion } from '../helpers/sesion-http'
import { coordinadorUser } from '../fixtures/users'

vi.mock('../../config/supabase-only', () => supabaseModuleMock)
vi.mock('../../config/supabaseClient', () => supabaseModuleMock)

import { app } from '../../app'
import { coordinadorService } from '../../modules/analytics/coordinador.service'

describe('DEF-31 — Un 500 no debe exponer detalles internos', () => {
  let auth = ''
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    auth = iniciarSesion(coordinadorUser)
  })
  afterEach(() => {
    vi.restoreAllMocks()
    reiniciarSesion()
  })

  it('el cuerpo del 500 no incluye el mensaje de PostgreSQL', async () => {
    vi.spyOn(coordinadorService, 'getProfesorStats').mockRejectedValue(
      new Error('invalid input syntax for type bigint: "abc"')
    )
    const res = await request(app).get('/api/coordinador/profesor-stats/13').set('Authorization', auth)

    expect(res.status).toBe(500)
    expect(JSON.stringify(res.body)).not.toMatch(/bigint|syntax/i)
    expect(res.body).toEqual({ error: 'Error interno del servidor' })
  })

  it('un profesorId no numérico es 400 y no llega al servicio', async () => {
    const servicio = vi.spyOn(coordinadorService, 'getProfesorStats').mockResolvedValue({} as never)
    const res = await request(app).get('/api/coordinador/profesor-stats/abc').set('Authorization', auth)

    expect(res.status).toBe(400)
    expect(servicio).not.toHaveBeenCalled()
  })
})
