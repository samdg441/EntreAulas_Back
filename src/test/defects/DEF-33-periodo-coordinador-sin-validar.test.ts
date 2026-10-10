/**
 * DEF-33 — El coordinador acepta periodos inválidos y recibe datos de todos los periodos (RQ23/RQ25)
 *
 * Severidad: Media | Estado: ABIERTO | Visto en producción como DEF-API-02 y DEF-API-03
 *
 * `reports-overview` y `profesor-stats` pasan `period` sin validar; el servicio usa
 * `rangoFechasPeriodoOTodo`, que ante un periodo inválido cae a 2020–2030. En Render,
 * `period=2026-9` devolvió 708 evaluaciones (todas) frente a 695 de `2026-1`: el
 * coordinador ve números de otro alcance sin ningún aviso. DEF-04 es el mismo caso en /teachers.
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

const PERIODOS_INVALIDOS = ['2026-9', '2026', "2026-1' OR '1'='1", 'abc']

describe('DEF-33 — Un periodo inválido debe ser 400, no "todos los periodos"', () => {
  let auth = ''
  beforeEach(() => {
    auth = iniciarSesion(coordinadorUser)
  })
  afterEach(() => {
    vi.restoreAllMocks()
    reiniciarSesion()
  })

  it.each(PERIODOS_INVALIDOS)('reports-overview?period=%s → 400 sin consultar', async (period) => {
    const servicio = vi.spyOn(coordinadorService, 'getReportsOverview').mockResolvedValue({} as never)
    const res = await request(app).get('/api/coordinador/reports-overview').query({ period }).set('Authorization', auth)

    expect(res.status).toBe(400)
    expect(servicio).not.toHaveBeenCalled()
  })

  it.each(PERIODOS_INVALIDOS)('profesor-stats/13?period=%s → 400 sin consultar', async (period) => {
    const servicio = vi.spyOn(coordinadorService, 'getProfesorStats').mockResolvedValue({} as never)
    const res = await request(app).get('/api/coordinador/profesor-stats/13').query({ period }).set('Authorization', auth)

    expect(res.status).toBe(400)
    expect(servicio).not.toHaveBeenCalled()
  })
})
