/**
 * DEF-04 — El parámetro `period` no se valida (RQ23)
 *
 * Severidad: Media | Estado: ABIERTO
 *
 * `period` se parte por '-' y se interpola sin validar. `?period=DROP-TABLE`
 * produce el rango `DROP-07-01` … `DROP-12-31`, `?period=2026-9` se toma
 * como segundo semestre, `?period=` o ausente busca 2020–2030 como `all`,
 * y `?period=2026` se interpreta como 2026-2.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { queueFrom } from '../helpers/query-builder'
import { fromMock, supabaseModuleMock } from '../helpers/supabase-mock'
import { setTestUser } from '../helpers/test-user'
import { profesorUser } from '../fixtures/users'

vi.mock('../../config/supabase-only', () => supabaseModuleMock)
vi.mock('../../config/supabaseClient', () => supabaseModuleMock)
vi.mock('../../middleware/auth', () => import('../helpers/auth-mock'))

import { app } from '../../app'

const sinDatos = () =>
  queueFrom({
    profesores: [
      { data: { id: 7 }, error: null },
      { data: { id: 7 }, error: null },
    ],
    evaluaciones: [{ data: [], error: null }],
    grupos: [{ data: [], error: null }],
    cursos: [{ data: [], error: null }],
  })

describe('DEF-04 — El período debe validarse antes de usarse', () => {
  beforeEach(() => {
    fromMock.mockReset()
    setTestUser({ ...profesorUser })
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    fromMock.mockImplementation(sinDatos())
  })

  it.each([
    { caso: 'un período con texto arbitrario', query: '?period=DROP-TABLE' },
    { caso: 'un semestre inexistente (2026-9)', query: '?period=2026-9' },
    { caso: 'sin period', query: '' },
    { caso: 'un period vacío', query: '?period=' },
    { caso: 'un año sin semestre (2026)', query: '?period=2026' },
  ])('$caso debe rechazarse con 400', async ({ query }) => {
    const res = await request(app).get(`/api/teachers/7/stats/historical${query}`)
    expect(res.status).toBe(400)
  })
})
