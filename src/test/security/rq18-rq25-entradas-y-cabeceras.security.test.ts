/**
 * RQ18 y RQ22–RQ25 — Entradas maliciosas, tamaño del body, CORS y datos manipulados.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { fromMock, supabaseModuleMock } from '../helpers/supabase-mock'
import { iniciarSesion, reiniciarSesion } from '../helpers/sesion-http'
import { adminUser, coordinadorUser, estudianteUser } from '../fixtures/users'

vi.hoisted(() => {
  process.env.CORS_ORIGIN = 'https://entre-aulas-front.vercel.app'
})
vi.mock('../../config/supabase-only', () => supabaseModuleMock)
vi.mock('../../config/supabaseClient', () => supabaseModuleMock)

import { app } from '../../app'
import { calcularPromedio, resumenHistorico, rangoFechasPeriodo } from '../../modules/analytics/calificaciones'
import { armarResumenCoordinador, parsearPaginacion } from '../../modules/analytics/coordinador-resumen'
import { decidirExportacionReporte } from '../../modules/analytics/reporte-exportacion'

describe('RQ18 — Seguridad del envío de QR por correo', () => {
  beforeEach(() => {
    fromMock.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
    reiniciarSesion()
  })

  it.each([
    ['inyección de cabecera Bcc', 'ana@udem.edu.co\nBcc: todos@evil.co'],
    ['inyección con CRLF', 'ana@udem.edu.co\r\nCc: x@evil.co'],
    ['varios destinatarios', 'ana@udem.edu.co,luis@evil.co'],
    ['destinatario como arreglo', ['ana@udem.edu.co', 'luis@evil.co']],
  ])('%s → 400 y no se consulta la base ni se envía nada', async (_caso, to) => {
    const auth = iniciarSesion(adminUser)

    const res = await request(app)
      .post('/api/qr-evaluaciones/share-email')
      .set('Authorization', auth)
      .send({ to, subject: 'Evaluación', grupoIds: [63] })

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Correo de destino inválido.' })
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('un body de más de 100 KB se rechaza con 413 antes de llegar a la ruta', async () => {
    const auth = iniciarSesion(coordinadorUser)
    const enorme = { grupoIds: Array.from({ length: 40_000 }, (_, i) => i + 1) }

    const res = await request(app).post('/api/qr-evaluaciones/batch').set('Authorization', auth).send(enorme)

    expect(res.status).toBe(413)
    expect(fromMock).not.toHaveBeenCalled()
  })
})

describe('Cabeceras y CORS', () => {
  it('no anuncia Express (x-powered-by)', async () => {
    const res = await request(app).get('/health')

    expect(res.headers).not.toHaveProperty('x-powered-by')
  })

  it('el front oficial pasa el preflight y un origen ajeno no', async () => {
    const preflight = (origen: string) =>
      request(app)
        .options('/api/coordinador/dashboard-summary')
        .set('Origin', origen)
        .set('Access-Control-Request-Method', 'GET')
        .set('Access-Control-Request-Headers', 'authorization')

    const oficial = await preflight('https://entre-aulas-front.vercel.app')
    const ajeno = await preflight('https://evil.example')

    expect(oficial.headers['access-control-allow-origin']).toBe('https://entre-aulas-front.vercel.app')
    expect(ajeno.headers).not.toHaveProperty('access-control-allow-origin')
  })
})

describe('RQ22–RQ25 — Integridad de los datos', () => {
  it('RQ22: valores manipulados no inflan ni hunden el promedio', () => {
    expect(calcularPromedio([5, 4, 1000, -5, Infinity, Number.NaN, '5abc', '4'])).toBeCloseTo(13 / 3)
  })

  it.each(["2026-1' OR '1'='1", '2026-1;DROP TABLE evaluaciones', '../2026-1', '2026-9', '', '2026'])(
    'RQ23: el periodo %j no produce un rango de fechas',
    (periodo) => {
      expect(rangoFechasPeriodo(periodo)).toBeNull()
      expect(resumenHistorico([{ calificacion_promedio: 4, fecha_creacion: '2026-03-01' }], periodo).totalEvaluaciones).toBe(0)
    }
  )

  it.each([
    [{ page: '1e9', pageSize: '1e9' }, { page: 1_000_000_000, pageSize: 50 }],
    [{ page: '-1', pageSize: '-1' }, { page: 1, pageSize: 8 }],
    [{ page: 'abc', pageSize: '{}' }, { page: 1, pageSize: 8 }],
  ])('RQ24: la paginación %j se acota a %j', (query, esperado) => {
    expect(parsearPaginacion(query)).toEqual(esperado)
  })

  it('RQ24: una búsqueda con comodines de regex se trata como texto', () => {
    const plantel = {
      profesores: [{ id: 7, usuario_id: 'u1' }],
      usuarios: [{ id: 'u1', nombre: 'Ana', apellido: 'Pérez', email: 'ana@t.com' }],
      evaluaciones: [],
      totalCursos: 1,
    }
    for (const search of ['.*', '[', '(', '\\']) {
      expect(() => armarResumenCoordinador({ ...plantel, search })).not.toThrow()
      expect(armarResumenCoordinador({ ...plantel, search }).teachers).toEqual([])
    }
  })

  it.each([
    [undefined, false],
    [estudianteUser, false],
    [{ tipo_usuario: '', roles: [] }, false],
    [{ tipo_usuario: 'COORDINADOR' }, true],
    [{ roles: ['estudiante', 'decano'] }, true],
    [coordinadorUser, true],
  ])('RQ25: exportar con %j → %s', (user, permitido) => {
    expect(decidirExportacionReporte({ user, filas: [], period: '2026-1' }).ok).toBe(permitido)
  })
})
