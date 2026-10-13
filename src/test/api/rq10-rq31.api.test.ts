/**
 * Contrato HTTP de RQ10, RQ11, RQ13, RQ29, RQ30 y RQ31 sobre la app Express real.
 * El middleware de auth es el de producción; la base y la IA se simulan.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { fromMock, supabaseModuleMock } from '../helpers/supabase-mock'
import { iniciarSesion, reiniciarSesion } from '../helpers/sesion-http'
import { adminUser, coordinadorUser, estudianteUser, profesorUser } from '../fixtures/users'
import { teachersAnalyticsService } from '../../modules/analytics/teachers-analytics.service'
import { teachersService } from '../../modules/academic/teachers.service'
import { academicService } from '../../modules/academic/academic.service'
import { authRepository } from '../../modules/auth/auth.repository'
import { roleRepository } from '../../modules/auth/role.repository'
import { RoleService } from '../../modules/auth/role.service'
import { teachersRepository } from '../../modules/academic/teachers.repository'
import { analyticsRepository } from '../../modules/analytics/analytics.repository'
import { AiService } from '../../modules/ai-summary/ai.service'

vi.mock('../../config/supabase-only', () => supabaseModuleMock)
vi.mock('../../config/supabaseClient', () => supabaseModuleMock)

import { app } from '../../app'

const cuerpoEvaluacion = {
  teacherId: '7',
  courseId: '10',
  groupId: '3',
  answers: [{ questionId: 1, rating: 4, textAnswer: 'claridad' }],
  overallRating: 4,
  comments: 'Buen curso',
}

const alta = {
  email: 'luis@soyudemedellin.edu.co',
  password: 'Clave-Segura2026!',
  nombre: 'Luis',
  apellido: 'Gomez',
  tipo_usuario: 'estudiante',
}

describe('RQ10, RQ11, RQ13, RQ29, RQ30 y RQ31 — API', () => {
  beforeEach(() => {
    fromMock.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
    reiniciarSesion()
  })

  describe('RQ10 — Estadísticas del estudiante', () => {
    it('sin token responde 401', async () => {
      const res = await request(app).get('/api/teachers/student-stats')

      expect(res.status).toBe(401)
      expect(res.body).toEqual({ error: 'Token de acceso requerido', code: 'NO_TOKEN' })
    })

    it('un estudiante recibe completadas, pendientes y promedio', async () => {
      const auth = iniciarSesion(estudianteUser)
      vi.spyOn(teachersAnalyticsService, 'getStudentStats').mockResolvedValue({
        evaluacionesCompletadas: 2,
        evaluacionesPendientes: 0,
        materiasMatriculadas: 2,
        promedioGeneral: 4.5,
        progresoGeneral: 100,
      })

      const res = await request(app).get('/api/teachers/student-stats').set('Authorization', auth)

      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({ evaluacionesCompletadas: 2, evaluacionesPendientes: 0, promedioGeneral: 4.5 })
      expect(teachersAnalyticsService.getStudentStats).toHaveBeenCalledWith(estudianteUser.id)
    })
  })

  describe('RQ11 — Enviar la evaluación', () => {
    it('sin token responde 401', async () => {
      const res = await request(app).post('/api/teachers/evaluations').send(cuerpoEvaluacion)

      expect(res.status).toBe(401)
      expect(res.body.code).toBe('NO_TOKEN')
    })

    it('un cuerpo con SQL no se guarda', async () => {
      const auth = iniciarSesion(estudianteUser)

      const res = await request(app)
        .post('/api/teachers/evaluations')
        .set('Authorization', auth)
        .send({ ...cuerpoEvaluacion, teacherId: '7; DROP TABLE evaluaciones' })

      expect(res.status).toBe(400)
      expect(res.body).not.toHaveProperty('evaluationId')
    })

    it('un estudiante guarda la evaluación y recibe el id', async () => {
      const auth = iniciarSesion(estudianteUser)
      vi.spyOn(teachersService, 'createEvaluation').mockResolvedValue({
        success: true,
        message: 'Evaluación guardada exitosamente',
        evaluationId: 'eval-1',
      })

      const res = await request(app).post('/api/teachers/evaluations').set('Authorization', auth).send(cuerpoEvaluacion)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({
        success: true,
        message: 'Evaluación guardada exitosamente',
        evaluationId: 'eval-1',
      })
    })
  })

  describe('RQ13 — Gestionar usuarios', () => {
    it('un administrador crea el usuario y la respuesta no lleva la contraseña', async () => {
      const auth = iniciarSesion(adminUser)
      vi.spyOn(authRepository, 'findUserByEmail').mockResolvedValue(null)
      vi.spyOn(authRepository, 'createUserWithType').mockImplementation(async (datos: Record<string, unknown>) => ({
        id: 'u-2',
        email: datos.email,
        nombre: datos.nombre,
        apellido: datos.apellido,
        tipo_usuario: datos.tipo_usuario,
        activo: true,
      }))

      const res = await request(app).post('/api/auth/create-user').set('Authorization', auth).send(alta)

      expect(res.status).toBe(201)
      expect(res.body.user).toMatchObject({ id: 'u-2', email: alta.email, nombre: 'Luis' })
      expect(res.body.user).not.toHaveProperty('password')
      expect(JSON.stringify(res.body)).not.toContain(alta.password)
    })

    it('un correo repetido no crea otro usuario', async () => {
      const auth = iniciarSesion(adminUser)
      vi.spyOn(authRepository, 'findUserByEmail').mockResolvedValue({ id: 'u-1' } as never)

      const res = await request(app).post('/api/auth/create-user').set('Authorization', auth).send(alta)

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('El email ya está registrado')
    })

    it('un cambio vacío responde 400', async () => {
      const auth = iniciarSesion(adminUser)
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue({
        id: 'u-1',
        email: 'ana@soyudemedellin.edu.co',
        tipo_usuario: 'estudiante',
      } as never)
      vi.spyOn(roleRepository, 'listRolesActivos').mockResolvedValue(['estudiante'])

      const res = await request(app).put('/api/users/u-1').set('Authorization', auth).send({})

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('No hay campos para actualizar')
    })

    it('el admin no se desactiva a sí mismo', async () => {
      const auth = iniciarSesion(adminUser)
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue({ id: adminUser.id, tipo_usuario: 'admin' } as never)
      const baja = vi.spyOn(academicService, 'deactivateUser')

      const res = await request(app).delete(`/api/users/${adminUser.id}`).set('Authorization', auth)

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('No puedes desactivar tu propia cuenta')
      expect(baja).not.toHaveBeenCalled()
    })

    it('desactiva a otro usuario', async () => {
      const auth = iniciarSesion(adminUser)
      vi.spyOn(authRepository, 'findUserById').mockResolvedValue({
        id: 'u-2',
        email: alta.email,
        nombre: 'Luis',
        apellido: 'Gomez',
        tipo_usuario: 'estudiante',
      } as never)
      vi.spyOn(academicService, 'deactivateUser').mockResolvedValue({
        id: 'u-2',
        email: alta.email,
        nombre: 'Luis',
        apellido: 'Gomez',
        tipo_usuario: 'estudiante',
        activo: false,
      } as never)

      const res = await request(app).delete('/api/users/u-2').set('Authorization', auth)

      expect(res.status).toBe(200)
      expect(res.body.user).toMatchObject({ id: 'u-2', activo: false })
      expect(res.body.user).not.toHaveProperty('password')
    })
  })

  describe('RQ29, RQ30 y RQ31 — Resúmenes', () => {
    beforeEach(() => {
      vi.spyOn(AiService, 'summarizeOpenResponses').mockImplementation(async (texts: string[]) => ({
        summary: `Resumen de ${texts.length} comentarios.`,
        topics: ['claridad'],
        analysisSource: 'open_text' as const,
        acosoDetectado: texts.some((texto) => texto.toLowerCase().includes('acoso')),
        mensajeAcoso: texts.some((texto) => texto.toLowerCase().includes('acoso')) ? 'Hubo acoso en una respuesta.' : undefined,
      }))
    })

    it('RQ29: sin comentarios responde 400', async () => {
      const auth = iniciarSesion(profesorUser)

      const res = await request(app).post('/api/ai/summarize').set('Authorization', auth).send({ texts: [] })

      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/texts/)
    })

    it('RQ29: el profesor resume sus propios comentarios', async () => {
      const auth = iniciarSesion(profesorUser)
      vi.spyOn(teachersRepository, 'findActiveByUsuarioId').mockResolvedValue({ id: 7 } as never)
      vi.spyOn(analyticsRepository, 'listEvaluaciones').mockResolvedValue([{ id: 'e1' }] as never)
      vi.spyOn(analyticsRepository, 'listRespuestasTextoByEvaluacionIds').mockResolvedValue([
        { respuesta_texto: 'La explicación fue clara' },
      ] as never)

      const res = await request(app)
        .get('/api/ai/summarize/by-professor')
        .query({ profesor_id: profesorUser.id })
        .set('Authorization', auth)

      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({ textsCount: 1, analysisSource: 'open_text' })
      expect(res.body.topics).toContain('claridad')
      expect(res.body.acosoDetectado).toBe(false)
    })

    it('RQ30 y RQ31: el coordinador resume la carrera y la alerta viaja en el mismo cuerpo', async () => {
      const auth = iniciarSesion(coordinadorUser)
      vi.spyOn(RoleService, 'obtenerCoordinadorPorUsuario').mockResolvedValue({ carrera_id: 1 } as never)
      vi.spyOn(teachersRepository, 'listActiveByCareer').mockResolvedValue([{ id: 7, usuario_id: 'u-ana' }] as never)
      vi.spyOn(analyticsRepository, 'getUsuariosByIds').mockResolvedValue([{ id: 'u-ana', nombre: 'Ana', apellido: 'Perez' }] as never)
      vi.spyOn(analyticsRepository, 'listEvaluaciones').mockResolvedValue([
        { id: 'e1', profesor_id: 7, calificacion_promedio: 4 },
      ] as never)
      vi.spyOn(analyticsRepository, 'listRespuestasTextoByEvaluacionIds').mockResolvedValue([
        { evaluacion_id: 'e1', respuesta_texto: 'Hubo acoso y faltó claridad' },
      ] as never)

      const res = await request(app).get('/api/ai/summarize/by-career').set('Authorization', auth)

      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({
        textsCount: 1,
        acosoDetectado: true,
        mensajeAcoso: 'Hubo acoso en una respuesta.',
      })
      expect(res.body.acosoProfesores).toEqual([
        expect.objectContaining({ profesorId: '7', menciones: 1 }),
      ])
    })

    it('RQ30: un texto corto de facultad no cuenta como comentario', async () => {
      const auth = iniciarSesion(adminUser)
      vi.spyOn(analyticsRepository, 'listEvaluaciones').mockResolvedValue([{ id: 'e1' }] as never)
      vi.spyOn(analyticsRepository, 'listRespuestasTextoByEvaluacionIds').mockResolvedValue([
        { respuesta_texto: 'abc' },
      ] as never)

      const res = await request(app).get('/api/ai/summarize/by-faculty').set('Authorization', auth)

      expect(res.status).toBe(200)
      expect(res.body.textsCount).toBe(0)
      expect(res.body.summary).toMatch(/facultad/)
      expect(res.body.acosoDetectado).toBeUndefined()
    })
  })
})
