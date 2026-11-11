/**
 * Seguridad de GET /api/coordinador/auditoria (OWASP Top 10 2021):
 *  A01 Control de acceso roto · A02 Fallos criptográficos (JWT) · A03 Inyección · A04 Diseño inseguro
 *  A09 Fallos de registro y monitoreo.
 * El JWT es real (firma y verificación verdaderas); solo se simula la base.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { supabaseModuleMock } from '../helpers/supabase-mock'
import { firmarToken, iniciarSesion, reiniciarSesion } from '../helpers/sesion-http'
import { adminUser, coordinadorUser, estudianteUser, profesorUser } from '../fixtures/users'

vi.mock('../../config/supabase-only', () => supabaseModuleMock)
vi.mock('../../config/supabaseClient', () => supabaseModuleMock)

import { app } from '../../app'
import { auditoriaService } from '../../modules/analytics/auditoria.service'

const vacia = {
  disponible: true,
  eventos: [],
  resumen: { total: 0, porAccion: {}, ultimoEvento: null },
  pagination: { page: 1, pageSize: 10, total: 0, totalPages: 0 },
}
const ruta = '/api/coordinador/auditoria'
const base64url = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')

describe('Auditoría — seguridad de la API', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    reiniciarSesion()
  })

  describe('A02 — el JWT se valida de verdad', () => {
    it('un JWT sin firma (alg: none) → 401', async () => {
      const servicio = vi.spyOn(auditoriaService, 'listar')
      const token = `${base64url({ alg: 'none', typ: 'JWT' })}.${base64url({ userId: coordinadorUser.id })}.`

      const res = await request(app).get(ruta).set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(401)
      expect(servicio).not.toHaveBeenCalled()
    })

    it('un JWT firmado con otra clave → 401', async () => {
      const servicio = vi.spyOn(auditoriaService, 'listar')
      const token = jwt.sign({ userId: coordinadorUser.id }, 'clave-del-atacante', { expiresIn: '10m' })

      const res = await request(app).get(ruta).set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(401)
      expect(servicio).not.toHaveBeenCalled()
    })

    it('un JWT vencido → 401 con código TOKEN_EXPIRED', async () => {
      const token = firmarToken({ userId: coordinadorUser.id }, { expiresIn: '-1s' })

      const res = await request(app).get(ruta).set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(401)
      expect(res.body.code).toBe('TOKEN_EXPIRED')
    })

    it('un usuario inactivo con token válido → 401', async () => {
      const auth = iniciarSesion(coordinadorUser, { activo: false })

      const res = await request(app).get(ruta).set('Authorization', auth)

      expect(res.status).toBe(401)
    })
  })

  describe('A01 — solo el coordinador', () => {
    it.each([
      ['administrador', adminUser],
      ['profesor', profesorUser],
      ['estudiante', estudianteUser],
      ['decano', { ...profesorUser, id: 'u-decano', tipo_usuario: 'decano', roles: ['decano'] }],
    ])('un %s no accede aunque tenga un token válido (403)', async (_nombre, usuario) => {
      const servicio = vi.spyOn(auditoriaService, 'listar')
      const auth = iniciarSesion(usuario)

      const res = await request(app).get(ruta).set('Authorization', auth)

      expect(res.status).toBe(403)
      expect(res.body.code).toBe('FORBIDDEN_ROLE')
      expect(servicio).not.toHaveBeenCalled()
    })

    it('el rol se toma de la base y no del contenido del token (no se puede subir de rol)', async () => {
      const servicio = vi.spyOn(auditoriaService, 'listar')
      iniciarSesion(estudianteUser)
      const token = firmarToken({ userId: estudianteUser.id, roles: ['coordinador'], tipo_usuario: 'coordinador' })

      const res = await request(app).get(ruta).set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(403)
      expect(servicio).not.toHaveBeenCalled()
    })

    it('la auditoría es de solo lectura: POST, PUT y DELETE no existen', async () => {
      const auth = iniciarSesion(coordinadorUser)

      for (const metodo of ['post', 'put', 'delete', 'patch'] as const) {
        const res = await request(app)[metodo](ruta).set('Authorization', auth).send({ accion: 'borrar' })
        expect(res.status, metodo).toBe(404)
      }
    })
  })

  describe('A03 — entradas maliciosas en los filtros', () => {
    it.each([
      ["accion=' OR 1=1--"],
      ['accion=programar_encuesta;DROP TABLE auditoria_eventos'],
      ['accion=../../etc/passwd'],
      ['accion[]=generar_qr&accion[]=x'],
    ])('el filtro %s se rechaza con 400 (nunca llega a la base)', async (consulta) => {
      const auth = iniciarSesion(coordinadorUser)

      const res = await request(app).get(`${ruta}?${consulta}`).set('Authorization', auth)

      expect(res.status).toBe(400)
      expect(JSON.stringify(res.body)).not.toMatch(/auditoria_eventos|select |from /i)
    })

    it.each(['desde=2026-13-45', 'hasta=ayer', "desde=2026-01-01' OR '1'='1", 'desde=2026-12-31&hasta=2026-01-01'])(
      'la fecha inválida %s → 400',
      async (consulta) => {
        const auth = iniciarSesion(coordinadorUser)

        const res = await request(app).get(`${ruta}?${consulta}`).set('Authorization', auth)

        expect(res.status).toBe(400)
      }
    )

    it('un texto de búsqueda enorme se recorta: la búsqueda efectiva nunca supera 80 caracteres', async () => {
      const { parsearFiltrosAuditoria } = await import('../../modules/analytics/auditoria')

      expect(parsearFiltrosAuditoria({ search: 'a'.repeat(5000) }).search).toHaveLength(80)
    })

    it('el tamaño de página se limita a 50: nadie puede volcar toda la tabla de una vez', async () => {
      const { parsearFiltrosAuditoria } = await import('../../modules/analytics/auditoria')

      expect(parsearFiltrosAuditoria({ pageSize: '100000' }).pageSize).toBe(50)
    })
  })

  describe('A04/A09 — diseño seguro y trazabilidad', () => {
    it('un fallo interno no expone detalles de la base (500 genérico)', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.spyOn(auditoriaService, 'listar').mockRejectedValue(new Error('connection to postgres://admin:secreto@host failed'))
      const auth = iniciarSesion(coordinadorUser)

      const res = await request(app).get(ruta).set('Authorization', auth)

      expect(res.status).toBe(500)
      expect(JSON.stringify(res.body)).not.toMatch(/postgres|secreto|admin:/)
    })

    it('la respuesta lleva las cabeceras de seguridad y no anuncia Express', async () => {
      const auth = iniciarSesion(coordinadorUser)
      vi.spyOn(auditoriaService, 'listar').mockResolvedValue(vacia as never)

      const res = await request(app).get(ruta).set('Authorization', auth)

      expect(res.headers['x-content-type-options']).toBe('nosniff')
      expect(res.headers['x-powered-by']).toBeUndefined()
    })
  })
})
