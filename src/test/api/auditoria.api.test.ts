/**
 * GET /api/coordinador/auditoria — contrato HTTP. Ruta, middleware y serialización reales;
 * el servicio se espía (Mock) para fijar los argumentos exactos que recibe.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { supabaseModuleMock } from '../helpers/supabase-mock'
import { iniciarSesion, reiniciarSesion } from '../helpers/sesion-http'
import { adminUser, coordinadorUser, estudianteUser, profesorUser } from '../fixtures/users'

vi.mock('../../config/supabase-only', () => supabaseModuleMock)
vi.mock('../../config/supabaseClient', () => supabaseModuleMock)

import { app } from '../../app'
import { auditoriaService } from '../../modules/analytics/auditoria.service'
import { badRequest } from '../../shared/errors'

const vista = {
  disponible: true,
  eventos: [
    {
      id: 7,
      actorId: 'user-coordinador',
      actorNombre: 'David',
      actorRol: 'coordinador',
      accion: 'programar_encuesta',
      entidad: 'periodo',
      entidadId: '2026-2',
      detalle: 'Del 2026-11-01 al 2026-11-15',
      creadoEn: '2026-10-01T10:00:00.000Z',
    },
  ],
  resumen: { total: 1, porAccion: { programar_encuesta: 1 }, ultimoEvento: '2026-10-01T10:00:00.000Z' },
  pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1 },
}

describe('GET /api/coordinador/auditoria', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    reiniciarSesion()
  })

  it('sin token → 401 y no consulta el servicio', async () => {
    const servicio = vi.spyOn(auditoriaService, 'listar')

    const res = await request(app).get('/api/coordinador/auditoria')

    expect(res.status).toBe(401)
    expect(servicio).not.toHaveBeenCalled()
  })

  it.each([
    ['estudiante', estudianteUser],
    ['profesor', profesorUser],
    ['admin', adminUser],
  ])('un %s → 403: la auditoría es solo del coordinador', async (_rol, usuario) => {
    const servicio = vi.spyOn(auditoriaService, 'listar')
    const auth = iniciarSesion(usuario)

    const res = await request(app).get('/api/coordinador/auditoria').set('Authorization', auth)

    expect(res.status).toBe(403)
    expect(servicio).not.toHaveBeenCalled()
  })

  it('un coordinador recibe 200 y el cuerpo exacto del servicio', async () => {
    const servicio = vi.spyOn(auditoriaService, 'listar').mockResolvedValue(vista as never)
    const auth = iniciarSesion(coordinadorUser)

    const res = await request(app)
      .get('/api/coordinador/auditoria?accion=programar_encuesta&page=2&desde=2026-10-01')
      .set('Authorization', auth)

    expect(res.status).toBe(200)
    expect(res.body).toEqual(vista)
    expect(servicio).toHaveBeenCalledWith('user-coordinador', {
      accion: 'programar_encuesta',
      page: '2',
      desde: '2026-10-01',
    })
  })

  it('un filtro inválido llega como 400 con mensaje', async () => {
    vi.spyOn(auditoriaService, 'listar').mockRejectedValue(badRequest('La acción "x" no es válida.'))
    const auth = iniciarSesion(coordinadorUser)

    const res = await request(app).get('/api/coordinador/auditoria?accion=x').set('Authorization', auth)

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/acción/)
  })

  it('el cuerpo no expone campos internos de la base (carrera_id, actor_id en snake_case)', async () => {
    vi.spyOn(auditoriaService, 'listar').mockResolvedValue(vista as never)
    const auth = iniciarSesion(coordinadorUser)

    const res = await request(app).get('/api/coordinador/auditoria').set('Authorization', auth)

    expect(JSON.stringify(res.body)).not.toMatch(/carrera_id|actor_id|creado_en/)
  })
})
