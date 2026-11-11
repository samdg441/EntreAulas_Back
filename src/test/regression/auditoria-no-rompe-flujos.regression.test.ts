/**
 * Regresión: registrar auditoría NUNCA debe tumbar la acción auditada.
 * Se simula la tabla de auditoría caída y se comprueba que los flujos existentes siguen respondiendo igual.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import * as fake from '../helpers/fake-supabase'
import { firmarToken } from '../helpers/sesion-http'

vi.mock('../../config/supabase-only', () => fake)
vi.mock('../../config/supabaseClient', () => fake)

import { app } from '../../app'
import { RoleService } from '../../modules/auth/role.service'
import { coordinadorService } from '../../modules/analytics/coordinador.service'
import { logger } from '../../shared/logger'

const bearer = `Bearer ${firmarToken({ userId: 'coord1' })}`

describe('Regresión — la auditoría no afecta los flujos existentes', () => {
  beforeEach(() => {
    fake.fakeDb.reset()
    fake.fakeDb.seed('usuarios', [{ id: 'coord1', email: 'c@udemedellin.edu.co', nombre: 'C', apellido: 'C', tipo_usuario: 'coordinador', activo: true }])
    fake.fakeDb.seed('periodos_academicos', [{ id: 5, ano: 2026, semestre: 2, activo: true }])
    vi.spyOn(RoleService, 'obtenerRolesUsuario').mockResolvedValue(['coordinador'])
    vi.spyOn(RoleService, 'obtenerPermisosUsuario').mockResolvedValue([])
    vi.spyOn(RoleService, 'obtenerCoordinadorPorUsuario').mockResolvedValue({ carrera_id: 1 } as never)
    vi.spyOn(logger, 'error').mockImplementation(() => {})
    fake.fakeDb.fail('auditoria_eventos', { message: 'caída de la tabla', code: 'XX000' }, 0)
  })
  afterEach(() => vi.restoreAllMocks())

  it('PUT /api/periodos/evaluacion sigue respondiendo 200 con el mismo cuerpo aunque falle la auditoría', async () => {
    const res = await request(app).put('/api/periodos/evaluacion').set('Authorization', bearer).send({ periodo: '2026-2', fechaInicio: '2026-11-03', fechaFin: '2026-11-21' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ periodoId: 5, ano: 2026, semestre: 2, fechaInicio: '2026-11-03', fechaFin: '2026-11-21' })
  })

  it('GET /api/coordinador/reports-overview devuelve el reporte aunque falle la auditoría', async () => {
    const reporte = { summary: { totalEvaluaciones: 3 }, reportRows: [] }
    vi.spyOn(coordinadorService, 'getReportsOverview').mockResolvedValue(reporte as never)

    const res = await request(app).get('/api/coordinador/reports-overview?period=2026-1').set('Authorization', bearer)

    expect(res.status).toBe(200)
    expect(res.body).toEqual(reporte)
  })

  it('GET /api/coordinador/profesor-stats/:id devuelve las estadísticas aunque falle la auditoría', async () => {
    const stats = { summary: { totalEvaluaciones: 9 }, categories: [], courses: [] }
    vi.spyOn(coordinadorService, 'getProfesorStats').mockResolvedValue(stats as never)

    const res = await request(app).get('/api/coordinador/profesor-stats/12?period=2026-1').set('Authorization', bearer)

    expect(res.status).toBe(200)
    expect(res.body).toEqual(stats)
  })

  it('las validaciones del PUT no cambian: fechas invertidas siguen dando 400 y no se audita', async () => {
    fake.fakeDb.reset()
    fake.fakeDb.seed('usuarios', [{ id: 'coord1', email: 'c@udemedellin.edu.co', nombre: 'C', apellido: 'C', tipo_usuario: 'coordinador', activo: true }])

    const res = await request(app).put('/api/periodos/evaluacion').set('Authorization', bearer).send({ periodo: '2026-2', fechaInicio: '2026-11-21', fechaFin: '2026-11-03' })

    expect(res.status).toBe(400)
    expect(fake.fakeDb.filas('auditoria_eventos')).toHaveLength(0)
  })

  it('el error de la tabla de auditoría queda en el log para que el equipo lo vea', async () => {
    await request(app).get('/api/coordinador/reports-overview').set('Authorization', bearer)
    await new Promise((r) => setTimeout(r, 30))

    expect(logger.error).toHaveBeenCalled()
  })
})
