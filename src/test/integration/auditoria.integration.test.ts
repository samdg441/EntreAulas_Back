/**
 * Integración HTTP → ruta → servicio → base en memoria (Fake) de la auditoría.
 * Se verifica el recorrido completo: una acción real del coordinador deja un evento
 * y solo el coordinador de esa carrera lo ve.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import * as fake from '../helpers/fake-supabase'
import { supabaseModuleMock } from '../helpers/supabase-mock'
import { firmarToken } from '../helpers/sesion-http'

vi.mock('../../config/supabase-only', () => fake)
vi.mock('../../config/supabaseClient', () => fake)

import { app } from '../../app'
import { RoleService } from '../../modules/auth/role.service'

void supabaseModuleMock
const usuario = (id: string, rol: string) => ({ id, email: `${id}@udemedellin.edu.co`, nombre: id.toUpperCase(), apellido: 'PRUEBA', tipo_usuario: rol, activo: true })
const bearer = (id: string) => `Bearer ${firmarToken({ userId: id })}`

describe('Auditoría — integración de punta a punta', () => {
  beforeEach(() => {
    fake.fakeDb.reset()
    fake.fakeDb.seed('usuarios', [usuario('coord1', 'coordinador'), usuario('coord2', 'coordinador'), usuario('estudiante1', 'estudiante')])
    fake.fakeDb.seed('periodos_academicos', [{ id: 5, ano: 2026, semestre: 2, activo: true }])
    const carreras: Record<string, number> = { coord1: 1, coord2: 2 }
    vi.spyOn(RoleService, 'obtenerRolesUsuario').mockImplementation(async (id: string) => (id.startsWith('coord') ? ['coordinador'] : ['estudiante']))
    vi.spyOn(RoleService, 'obtenerPermisosUsuario').mockResolvedValue([])
    vi.spyOn(RoleService, 'obtenerCoordinadorPorUsuario').mockImplementation(async (id: string) => (carreras[id] ? ({ carrera_id: carreras[id] } as never) : null))
  })
  afterEach(() => vi.restoreAllMocks())

  const esperarEventos = async (cantidad: number) => {
    for (let i = 0; i < 50 && fake.fakeDb.filas('auditoria_eventos').length < cantidad; i++) await new Promise((r) => setTimeout(r, 10))
  }

  it('programar una encuesta deja un evento y el mismo coordinador lo ve en su auditoría', async () => {
    const guardar = await request(app)
      .put('/api/periodos/evaluacion')
      .set('Authorization', bearer('coord1'))
      .send({ periodo: '2026-2', fechaInicio: '2026-11-03', fechaFin: '2026-11-21' })
    expect(guardar.status).toBe(200)
    await esperarEventos(1)

    const res = await request(app).get('/api/coordinador/auditoria').set('Authorization', bearer('coord1'))

    expect(res.status).toBe(200)
    expect(res.body.disponible).toBe(true)
    expect(res.body.eventos).toHaveLength(1)
    expect(res.body.eventos[0]).toMatchObject({
      accion: 'programar_encuesta',
      actorNombre: 'COORD1 PRUEBA',
      actorRol: 'coordinador',
      entidadId: '2026-2',
      detalle: 'Del 2026-11-03 al 2026-11-21',
    })
  })

  it('un coordinador de otra carrera no ve los eventos de la primera (aislamiento por carrera)', async () => {
    await request(app).put('/api/periodos/evaluacion').set('Authorization', bearer('coord1')).send({ periodo: '2026-2', fechaInicio: '2026-11-03', fechaFin: '2026-11-21' })
    await esperarEventos(1)

    const res = await request(app).get('/api/coordinador/auditoria').set('Authorization', bearer('coord2'))

    expect(res.status).toBe(200)
    expect(res.body.eventos).toEqual([])
    expect(res.body.resumen.total).toBe(0)
  })

  it('los filtros combinados (acción + fechas + búsqueda) se aplican sobre los datos reales', async () => {
    fake.fakeDb.seed('auditoria_eventos', [
      { id: 1, actor_id: 'coord1', actor_nombre: 'María Gómez', actor_rol: 'coordinador', accion: 'generar_qr', entidad: 'qr', entidad_id: null, carrera_id: 1, detalle: '12 QR de Cálculo', creado_en: '2026-10-05T10:00:00.000Z' },
      { id: 2, actor_id: 'coord1', actor_nombre: 'María Gómez', actor_rol: 'coordinador', accion: 'generar_qr', entidad: 'qr', entidad_id: null, carrera_id: 1, detalle: '3 QR de Física', creado_en: '2026-11-05T10:00:00.000Z' },
      { id: 3, actor_id: 'coord1', actor_nombre: 'Pedro', actor_rol: 'coordinador', accion: 'consultar_reportes', entidad: 'reporte', entidad_id: null, carrera_id: 1, detalle: 'Reporte', creado_en: '2026-10-06T10:00:00.000Z' },
    ])

    const res = await request(app)
      .get('/api/coordinador/auditoria?accion=generar_qr&desde=2026-10-01&hasta=2026-10-31&search=calculo')
      .set('Authorization', bearer('coord1'))

    expect(res.body.eventos.map((e: { id: number }) => e.id)).toEqual([1])
  })

  it('un estudiante no puede leer la auditoría (403) aunque haya eventos', async () => {
    fake.fakeDb.seed('auditoria_eventos', [{ id: 1, actor_id: 'coord1', actor_nombre: 'X', actor_rol: 'coordinador', accion: 'generar_qr', entidad: 'qr', entidad_id: null, carrera_id: 1, detalle: '', creado_en: '2026-10-05T10:00:00.000Z' }])

    const res = await request(app).get('/api/coordinador/auditoria').set('Authorization', bearer('estudiante1'))

    expect(res.status).toBe(403)
  })

  it('sin la tabla de auditoría la API responde 200 con disponible=false (no rompe el panel)', async () => {
    fake.fakeDb.fail('auditoria_eventos', { message: 'relation "auditoria_eventos" does not exist', code: '42P01' })

    const res = await request(app).get('/api/coordinador/auditoria').set('Authorization', bearer('coord1'))

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ disponible: false, eventos: [] })
    expect(res.body.aviso).toMatch(/create-auditoria-eventos\.sql/)
  })
})
