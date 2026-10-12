/**
 * Contrato HTTP de RQ6, RQ14, RQ15, RQ16, RQ17 y RQ27 sobre la app Express real.
 * El middleware de auth es el de producción; la base solo se simula en los casos que la tocan.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { fromMock, supabaseModuleMock } from '../helpers/supabase-mock'
import { iniciarSesion, reiniciarSesion } from '../helpers/sesion-http'
import { adminUser, estudianteUser, profesorUser } from '../fixtures/users'

vi.mock('../../config/supabase-only', () => supabaseModuleMock)
vi.mock('../../config/supabaseClient', () => supabaseModuleMock)

import { app } from '../../app'
import * as qrBatch from '../../modules/evaluations/qr-batch'
import * as qrAutoEnroll from '../../modules/evaluations/qr-auto-enroll'
import { qrRepository } from '../../modules/evaluations/qr.repository'
import { teachersService } from '../../modules/academic/teachers.service'
import { academicService } from '../../modules/academic/academic.service'
import { roleRepository } from '../../modules/auth/role.repository'

const filaQr = {
  token: '00000000-0000-4000-8000-000000000014',
  profesor_id: 13,
  curso_id: 12,
  grupo_id: 63,
  periodo_id: 4,
  profesor: { usuario: { nombre: 'Ana', apellido: 'Pérez' } },
  curso: { nombre: 'Programación I', codigo: 'SIS-101' },
  grupo: { numero_grupo: 1 },
}

describe('RQ6, RQ14–RQ17 y RQ27 — API', () => {
  beforeEach(() => {
    fromMock.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
    reiniciarSesion()
  })

  describe('RQ6 — Control de acceso por roles', () => {
    it('sin token, el listado de usuarios responde 401', async () => {
      const res = await request(app).get('/api/users')

      expect(res.status).toBe(401)
      expect(res.body).toEqual({ error: 'Token de acceso requerido', code: 'NO_TOKEN' })
    })

    it('un estudiante no lista usuarios', async () => {
      const auth = iniciarSesion(estudianteUser)

      const res = await request(app).get('/api/users').set('Authorization', auth)

      expect(res.status).toBe(403)
      expect(res.body).toMatchObject({ code: 'FORBIDDEN_ROLE' })
    })

    it('un administrador lista usuarios', async () => {
      const auth = iniciarSesion(adminUser)
      vi.spyOn(academicService, 'listUsersSummary').mockResolvedValue([
        { id: adminUser.id, email: adminUser.email, tipo_usuario: 'admin' },
      ] as never)
      vi.spyOn(roleRepository, 'listRolesAgrupados').mockResolvedValue(new Map([[adminUser.id, ['admin']]]))

      const res = await request(app).get('/api/users').set('Authorization', auth)

      expect(res.status).toBe(200)
      expect(res.body.users).toEqual([
        expect.objectContaining({ id: adminUser.id, email: adminUser.email, roles: ['admin'] }),
      ])
    })
  })

  describe('RQ14 — Auto-inscripción por QR', () => {
    it('un profesor no puede matricularse por QR', async () => {
      const auth = iniciarSesion(profesorUser)

      const res = await request(app).post('/api/qr-evaluaciones/00000000-0000-4000-8000-000000000014/auto-enroll').set('Authorization', auth)

      expect(res.status).toBe(403)
      expect(res.body.error).toMatch(/estudiantes/i)
    })

    it('un estudiante queda inscrito cuando el QR es válido', async () => {
      const auth = iniciarSesion(estudianteUser)
      vi.spyOn(qrAutoEnroll, 'autoEnrollPorQr').mockResolvedValue({
        status: 201,
        body: { enrolled: true, created: true, estudianteId: 'est-1', grupoId: 63 },
      })

      const res = await request(app).post('/api/qr-evaluaciones/00000000-0000-4000-8000-000000000014/auto-enroll').set('Authorization', auth)

      expect(res.status).toBe(201)
      expect(res.body).toMatchObject({ enrolled: true, created: true, grupoId: 63 })
    })
  })

  describe('RQ15 — Generación masiva de QR', () => {
    it('sin grupos responde 400 y no consulta la base', async () => {
      const auth = iniciarSesion(adminUser)

      const res = await request(app).post('/api/qr-evaluaciones/batch').set('Authorization', auth).send({ grupoIds: [] })

      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/grupoIds/)
      expect(fromMock).not.toHaveBeenCalled()
    })

    it('un administrador genera el lote', async () => {
      const auth = iniciarSesion(adminUser)
      vi.spyOn(qrBatch, 'generarQrsBatch').mockResolvedValue({
        created: [{ grupoId: 63, token: '00000000-0000-4000-8000-000000000014' }],
        skipped: [],
      })

      const res = await request(app)
        .post('/api/qr-evaluaciones/batch')
        .set('Authorization', auth)
        .send({ grupoIds: [63] })

      expect(res.status).toBe(201)
      expect(res.body.created).toEqual([{ grupoId: 63, token: '00000000-0000-4000-8000-000000000014' }])
    })
  })

  describe('RQ16 — Distribución de QR por correo', () => {
    it('un correo inválido responde 400', async () => {
      const auth = iniciarSesion(adminUser)

      const res = await request(app)
        .post('/api/qr-evaluaciones/share-email')
        .set('Authorization', auth)
        .send({ to: 'no-es-correo', subject: 'Evaluación', grupoIds: [63] })

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: 'Correo de destino inválido.' })
    })

    it('sin asunto responde 400', async () => {
      const auth = iniciarSesion(adminUser)

      const res = await request(app)
        .post('/api/qr-evaluaciones/share-email')
        .set('Authorization', auth)
        .send({ to: 'ana@udemedellin.edu.co', subject: '   ', grupoIds: [63] })

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: 'El asunto es requerido.' })
    })
  })

  describe('RQ17 — Resolución de token QR', () => {
    it('un token activo devuelve el grupo de la encuesta', async () => {
      vi.spyOn(qrRepository, 'findActivoByToken').mockResolvedValue(filaQr as never)

      const res = await request(app).get('/api/qr-evaluaciones/00000000-0000-4000-8000-000000000014')

      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({ grupoId: 63, cursoCodigo: 'SIS-101', profesorNombre: 'Ana Pérez' })
    })

    it('un token inexistente responde 404', async () => {
      vi.spyOn(qrRepository, 'findActivoByToken').mockResolvedValue(null as never)

      const res = await request(app).get('/api/qr-evaluaciones/no-existe')

      expect(res.status).toBe(404)
      expect(res.body.error).toMatch(/inválido|expirado/i)
    })
  })

  describe('RQ27 — Relación estudiante–materia', () => {
    it('un profesor no consulta las materias de un estudiante', async () => {
      const auth = iniciarSesion(profesorUser)

      const res = await request(app).get('/api/teachers/student-enrolled-subjects').set('Authorization', auth)

      expect(res.status).toBe(403)
      expect(res.body.error).toMatch(/estudiantes/i)
    })

    it('un estudiante recibe sus materias matriculadas', async () => {
      const auth = iniciarSesion(estudianteUser)
      vi.spyOn(teachersService, 'getStudentEnrolledSubjects').mockResolvedValue({
        materiasMatriculadas: [{ id: 11, grupo: { curso: { codigo: 'SIS-101', nombre: 'Programación I' } } }],
        total: 1,
      } as never)

      const res = await request(app).get('/api/teachers/student-enrolled-subjects').set('Authorization', auth)

      expect(res.status).toBe(200)
      expect(res.body.total).toBe(1)
      expect(res.body.materiasMatriculadas).toHaveLength(1)
    })
  })
})
