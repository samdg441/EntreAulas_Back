/**
 * RQ18 — Contrato HTTP de los endpoints de QR sobre la app Express real.
 * Middleware de auth, validación y serialización de errores son los de producción;
 * solo la base de datos está simulada.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { fromMock, supabaseModuleMock } from '../helpers/supabase-mock'
import { iniciarSesion, reiniciarSesion } from '../helpers/sesion-http'
import { adminUser, coordinadorUser, estudianteUser } from '../fixtures/users'

vi.mock('../../config/supabase-only', () => supabaseModuleMock)
vi.mock('../../config/supabaseClient', () => supabaseModuleMock)

import { app } from '../../app'
import { qrRepository } from '../../modules/evaluations/qr.repository'

const filaQr = {
  token: 'tok-63',
  profesor_id: 13,
  curso_id: 12,
  grupo_id: 63,
  periodo_id: 4,
  profesor: { usuario: { nombre: 'Ana', apellido: 'Pérez' } },
  curso: { nombre: 'Cálculo', codigo: 'MAT101' },
  grupo: { numero_grupo: 1 },
}

describe('RQ18 — API de QR', () => {
  beforeEach(() => {
    fromMock.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
    reiniciarSesion()
  })

  describe('GET /api/qr-evaluaciones/:token (público)', () => {
    it('un token activo devuelve profesor, curso, grupo y periodo', async () => {
      vi.spyOn(qrRepository, 'findActivoByToken').mockResolvedValue(filaQr as never)

      const res = await request(app).get('/api/qr-evaluaciones/tok-63')

      expect(res.status).toBe(200)
      expect(res.headers['content-type']).toMatch(/application\/json/)
      expect(res.body).toMatchObject({
        profesorId: 13,
        cursoId: 12,
        materiaId: 12,
        grupoId: 63,
        periodoId: 4,
        profesorNombre: 'Ana Pérez',
        cursoNombre: 'Cálculo',
        cursoCodigo: 'MAT101',
      })
    })

    it('Regresión RQ18: un token apagado o inexistente → 404', async () => {
      vi.spyOn(qrRepository, 'findActivoByToken').mockResolvedValue(null as never)

      const res = await request(app).get('/api/qr-evaluaciones/no-existe')

      expect(res.status).toBe(404)
      expect(res.body).toEqual({ error: 'QR inválido o expirado.' })
    })

    it('Regresión RQ18: si la base falla → 500 genérico, nunca 200 ni el error interno', async () => {
      vi.spyOn(qrRepository, 'findActivoByToken').mockRejectedValue(new Error('connection terminated unexpectedly'))

      const res = await request(app).get('/api/qr-evaluaciones/tok-63')

      expect(res.status).toBe(500)
      expect(res.body).toEqual({ error: 'Error al resolver el token.' })
    })
  })

  describe('GET /api/qr-evaluaciones/:token/imagen.png (público, lo usan los correos)', () => {
    it('devuelve un PNG cacheable', async () => {
      const res = await request(app).get('/api/qr-evaluaciones/tok-63/imagen.png').buffer(true)

      expect(res.status).toBe(200)
      expect(res.headers['content-type']).toBe('image/png')
      expect(res.headers['cache-control']).toBe('public, max-age=86400')
      expect(Buffer.from(res.body).subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
    })

    it('con ?descargar=1 se descarga como archivo', async () => {
      const res = await request(app).get('/api/qr-evaluaciones/tok-63/imagen.png?descargar=1').buffer(true)

      expect(res.headers['content-disposition']).toBe('attachment; filename="qr-evaluacion.png"')
    })
  })

  describe('POST /api/qr-evaluaciones/batch', () => {
    it('sin token → 401 NO_TOKEN', async () => {
      const res = await request(app).post('/api/qr-evaluaciones/batch').send({ grupoIds: [63] })

      expect(res.status).toBe(401)
      expect(res.body.code).toBe('NO_TOKEN')
    })

    it('Regresión RQ18: un estudiante → 403 FORBIDDEN_ROLE y no toca la base', async () => {
      const auth = iniciarSesion(estudianteUser)

      const res = await request(app).post('/api/qr-evaluaciones/batch').set('Authorization', auth).send({ grupoIds: [63] })

      expect(res.status).toBe(403)
      expect(res.body.code).toBe('FORBIDDEN_ROLE')
      expect(fromMock).not.toHaveBeenCalled()
    })

    it.each([[undefined], [[]], [['abc', 'x']], ['63']])('grupoIds = %j → 400 antes de consultar la base', async (grupoIds) => {
      const auth = iniciarSesion(coordinadorUser)

      const res = await request(app).post('/api/qr-evaluaciones/batch').set('Authorization', auth).send({ grupoIds })

      expect(res.status).toBe(400)
      expect(res.body.error).toEqual(expect.any(String))
      expect(fromMock).not.toHaveBeenCalled()
    })
  })

  describe('POST /api/qr-evaluaciones/share-email', () => {
    const pedido = { to: 'ana@udemedellin.edu.co', subject: 'Evaluación', grupoIds: [63] }

    it('sin token → 401', async () => {
      const res = await request(app).post('/api/qr-evaluaciones/share-email').send(pedido)

      expect(res.status).toBe(401)
    })

    it('un estudiante → 403', async () => {
      const auth = iniciarSesion(estudianteUser)

      const res = await request(app).post('/api/qr-evaluaciones/share-email').set('Authorization', auth).send(pedido)

      expect(res.status).toBe(403)
    })

    it.each([
      [{ ...pedido, to: 'no-es-correo' }, 'Correo de destino inválido.'],
      [{ ...pedido, to: '' }, 'Correo de destino inválido.'],
      [{ ...pedido, subject: '   ' }, 'El asunto es requerido.'],
    ])('body inválido %j → 400 "%s" sin consultar la base', async (body, error) => {
      const auth = iniciarSesion(adminUser)

      const res = await request(app).post('/api/qr-evaluaciones/share-email').set('Authorization', auth).send(body)

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error })
      expect(fromMock).not.toHaveBeenCalled()
    })
  })
})
