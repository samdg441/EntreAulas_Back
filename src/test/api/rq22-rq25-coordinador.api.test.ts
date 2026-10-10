/**
 * RQ22 métricas, RQ23 histórico, RQ24 resumen del coordinador y RQ25 datos del reporte.
 * La ruta, el middleware y la serialización son reales; el servicio se espía para fijar
 * exactamente qué parámetros le llegan y qué devuelve la API.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { supabaseModuleMock } from '../helpers/supabase-mock'
import { iniciarSesion, reiniciarSesion } from '../helpers/sesion-http'
import { coordinadorUser, estudianteUser, profesorUser } from '../fixtures/users'

vi.mock('../../config/supabase-only', () => supabaseModuleMock)
vi.mock('../../config/supabaseClient', () => supabaseModuleMock)

import { app } from '../../app'
import { coordinadorService } from '../../modules/analytics/coordinador.service'
import { teachersAnalyticsService } from '../../modules/analytics/teachers-analytics.service'
import { notFound } from '../../shared/errors'

const resumen = {
  stats: { totalProfesores: 2, totalCursos: 3, promedioEvaluaciones: 4.5, profesoresEnRiesgo: 1, totalEvaluaciones: 40 },
  teachers: [{ profesorId: 13, nombre: 'Ana Pérez', email: 'ana@udem.edu.co', totalEvaluaciones: 20, promedio: 4.5 }],
  pagination: { page: 1, pageSize: 8, total: 1, totalPages: 1 },
}

const reporte = {
  summary: { totalEvaluaciones: 40, calificacionPromedio: 4.5 },
  reportRows: [{ DOCENTE: 'Ana Pérez', ASIGNATURA: 'Cálculo', GRUPO: '1', PROMEDIO: 4.5 }],
}

describe('RQ22–RQ25 — API del coordinador', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
    reiniciarSesion()
  })

  describe('RQ24 — GET /api/coordinador/dashboard-summary', () => {
    it('sin token → 401 y el servicio no se ejecuta', async () => {
      const servicio = vi.spyOn(coordinadorService, 'getDashboardSummary')

      const res = await request(app).get('/api/coordinador/dashboard-summary')

      expect(res.status).toBe(401)
      expect(servicio).not.toHaveBeenCalled()
    })

    it.each([
      ['estudiante', estudianteUser],
      ['profesor', profesorUser],
    ])('un %s → 403 y el servicio no se ejecuta', async (_rol, usuario) => {
      const servicio = vi.spyOn(coordinadorService, 'getDashboardSummary')
      const auth = iniciarSesion(usuario)

      const res = await request(app).get('/api/coordinador/dashboard-summary').set('Authorization', auth)

      expect(res.status).toBe(403)
      expect(res.body).toEqual({ error: 'Solo coordinadores pueden acceder a esta información.' })
      expect(servicio).not.toHaveBeenCalled()
    })

    it('el coordinador recibe el resumen; la búsqueda y la página llegan al servicio', async () => {
      const servicio = vi.spyOn(coordinadorService, 'getDashboardSummary').mockResolvedValue(resumen as never)
      const auth = iniciarSesion(coordinadorUser)

      const res = await request(app)
        .get('/api/coordinador/dashboard-summary?page=2&pageSize=8&search=ana')
        .set('Authorization', auth)

      expect(res.status).toBe(200)
      expect(res.body).toEqual(resumen)
      expect(servicio).toHaveBeenCalledWith(coordinadorUser.id, { page: '2', pageSize: '8', search: 'ana' })
    })
  })

  describe('RQ23/RQ25 — GET /api/coordinador/reports-overview', () => {
    it('pasa periodo, curso y grupo al servicio y devuelve las filas exportables', async () => {
      const servicio = vi.spyOn(coordinadorService, 'getReportsOverview').mockResolvedValue(reporte as never)
      const auth = iniciarSesion(coordinadorUser)

      const res = await request(app)
        .get('/api/coordinador/reports-overview?period=2026-1&courseId=12&grupoId=63')
        .set('Authorization', auth)

      expect(res.status).toBe(200)
      expect(res.body.reportRows[0]).toEqual({ DOCENTE: 'Ana Pérez', ASIGNATURA: 'Cálculo', GRUPO: '1', PROMEDIO: 4.5 })
      expect(servicio).toHaveBeenCalledWith(coordinadorUser.id, '2026-1', { courseId: '12', grupoId: '63' })
    })

    it('Regresión RQ25: un estudiante no obtiene las filas del reporte', async () => {
      const servicio = vi.spyOn(coordinadorService, 'getReportsOverview')
      const auth = iniciarSesion(estudianteUser)

      const res = await request(app).get('/api/coordinador/reports-overview?period=2026-1').set('Authorization', auth)

      expect(res.status).toBe(403)
      expect(res.body).not.toHaveProperty('reportRows')
      expect(servicio).not.toHaveBeenCalled()
    })
  })

  describe('RQ22 — GET /api/coordinador/profesor-stats/:profesorId', () => {
    it('pide las métricas del docente en el periodo', async () => {
      const servicio = vi.spyOn(coordinadorService, 'getProfesorStats').mockResolvedValue({ calificacionPromedio: 4.5 } as never)
      const auth = iniciarSesion(coordinadorUser)

      const res = await request(app).get('/api/coordinador/profesor-stats/13?period=2026-1').set('Authorization', auth)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ calificacionPromedio: 4.5 })
      expect(servicio).toHaveBeenCalledWith(coordinadorUser.id, '13', '2026-1')
    })

    it('un docente de otra carrera → 404 con el mensaje del servicio', async () => {
      vi.spyOn(coordinadorService, 'getProfesorStats').mockRejectedValue(notFound('Docente no encontrado en la carrera del coordinador'))
      const auth = iniciarSesion(coordinadorUser)

      const res = await request(app).get('/api/coordinador/profesor-stats/999?period=2026-1').set('Authorization', auth)

      expect(res.status).toBe(404)
      expect(res.body).toEqual({ error: 'Docente no encontrado en la carrera del coordinador' })
    })

    it('un error inesperado → 500 con mensaje genérico', async () => {
      vi.spyOn(coordinadorService, 'getProfesorStats').mockRejectedValue(new Error('fallo'))
      const auth = iniciarSesion(coordinadorUser)

      const res = await request(app).get('/api/coordinador/profesor-stats/13').set('Authorization', auth)

      expect(res.status).toBe(500)
      expect(res.body.error).toBe('Error interno del servidor')
    })
  })

  describe('RQ23 — GET /api/teachers/:profesorId/stats/historical', () => {
    it('sin token → 401', async () => {
      const res = await request(app).get('/api/teachers/13/stats/historical?period=2026-1')

      expect(res.status).toBe(401)
    })

    it('pasa el docente y el periodo al servicio', async () => {
      const servicio = vi
        .spyOn(teachersAnalyticsService, 'getHistorical')
        .mockResolvedValue({ calificacionPromedio: 4, totalEvaluaciones: 1 } as never)
      const auth = iniciarSesion(profesorUser)

      const res = await request(app).get('/api/teachers/13/stats/historical?period=2026-1').set('Authorization', auth)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ calificacionPromedio: 4, totalEvaluaciones: 1 })
      expect(servicio).toHaveBeenCalledWith('13', '2026-1')
    })
  })
})
