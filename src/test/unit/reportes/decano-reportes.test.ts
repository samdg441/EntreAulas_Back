import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { queueFrom } from '../../helpers/query-builder'
import { fromMock, supabaseModuleMock } from '../../helpers/supabase-mock'
import { coordinadorUser, estudianteUser } from '../../fixtures/users'
import { setTestUser } from '../../helpers/test-user'

vi.mock('../../../config/supabase-only', () => supabaseModuleMock)
vi.mock('../../../config/supabaseClient', () => supabaseModuleMock)
vi.mock('../../../middleware/auth', () => import('../../helpers/auth-mock'))

import { app } from '../../../app'
import { carrerasDelReporte, esDecano } from '../../../modules/analytics/decano.routes'
import { calcularTasaRespuesta } from '../../../modules/analytics/coordinador.service'

const decanoUser = { ...coordinadorUser, id: 'decano-1', tipo_usuario: 'decano', roles: ['decano'] }

const CARRERAS = [
  { id: 2, nombre: 'Ingeniería de Sistemas', activa: true },
  { id: 3, nombre: 'Tronco comun FI', activa: true },
  { id: 4, nombre: 'Ingeniería Civil', activa: true },
  { id: 5, nombre: 'Carrera cerrada', activa: false },
]

describe('Reportes del decano — GET /api/decano/reports-overview', () => {
  beforeEach(() => {
    fromMock.mockReset()
    setTestUser({ ...decanoUser })
  })

  it('un usuario que no es decano recibe 403', async () => {
    setTestUser({ ...estudianteUser })

    const res = await request(app).get('/api/decano/reports-overview?period=2026-1')

    expect(res.status).toBe(403)
  })

  it('una carrera inexistente o inactiva responde 404', async () => {
    fromMock.mockImplementation(queueFrom({ carreras: [{ data: CARRERAS, error: null }] }))

    const res = await request(app).get('/api/decano/reports-overview?period=2026-1&careerId=5')

    expect(res.status).toBe(404)
  })

  it('sin docentes en las carreras devuelve el reporte vacío', async () => {
    fromMock.mockImplementation(
      queueFrom({
        carreras: [{ data: CARRERAS, error: null }],
        periodos_academicos: [{ data: null, error: null }],
        profesores: [],
      })
    )

    const res = await request(app).get('/api/decano/reports-overview?period=2026-1')

    expect(res.status).toBe(200)
    expect(res.body.summary).toMatchObject({ totalEvaluaciones: 0, tasaRespuesta: 0 })
  })

  it('error al leer carreras → 500', async () => {
    fromMock.mockImplementation(queueFrom({ carreras: [{ data: null, error: { message: 'db' } }] }))

    const res = await request(app).get('/api/decano/reports-overview')

    expect(res.status).toBe(500)
  })
})

describe('Reportes del decano — reglas', () => {
  beforeEach(() => fromMock.mockReset())

  it('sin carrera (o "all") incluye todas las activas excepto el tronco común', async () => {
    fromMock.mockImplementation(queueFrom({ carreras: [{ data: CARRERAS, error: null }, { data: CARRERAS, error: null }] }))

    await expect(carrerasDelReporte(undefined)).resolves.toEqual([2, 4])
    await expect(carrerasDelReporte('all')).resolves.toEqual([2, 4])
  })

  it('con carrera válida devuelve solo esa', async () => {
    fromMock.mockImplementation(queueFrom({ carreras: [{ data: CARRERAS, error: null }] }))

    await expect(carrerasDelReporte('4')).resolves.toEqual([4])
  })

  it('reconoce al decano por rol o por tipo de usuario', () => {
    expect(esDecano({ roles: ['decano'] })).toBe(true)
    expect(esDecano({ tipo_usuario: 'decano' })).toBe(true)
    expect(esDecano({ roles: ['coordinador'], tipo_usuario: 'coordinador' })).toBe(false)
    expect(esDecano(undefined)).toBe(false)
  })

  it('tasa de respuesta: porcentaje con un decimal, sin pasar de 100', () => {
    expect(calcularTasaRespuesta(0, 10)).toBe(0)
    expect(calcularTasaRespuesta(5, 0)).toBe(0)
    expect(calcularTasaRespuesta(1, 3)).toBe(33.3)
    expect(calcularTasaRespuesta(12, 10)).toBe(100)
  })
})
