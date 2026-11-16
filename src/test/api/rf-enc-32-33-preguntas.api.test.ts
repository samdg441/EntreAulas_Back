/**
 * RF-ENC-32 y RF-ENC-33 — Contrato HTTP de las preguntas de la encuesta (Supertest).
 *
 * App Express real y middleware de auth real (JWT firmado con el secreto de pruebas).
 * Solo se reemplaza el repositorio con `vi.spyOn`: no hay base de datos ni red.
 *
 * DEF-48, DEF-49 y DEF-50 se escribieron en rojo antes de corregir el controlador (TDD).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { supabaseModuleMock } from '../helpers/supabase-mock'
import { iniciarSesion, reiniciarSesion } from '../helpers/sesion-http'
import { adminUser, coordinadorUser, estudianteUser, profesorUser } from '../fixtures/users'

vi.mock('../../config/supabase-only', () => supabaseModuleMock)
vi.mock('../../config/supabaseClient', () => supabaseModuleMock)

import { app } from '../../app'
import { evaluationsRepository } from '../../modules/evaluations/evaluations.repository'

const PREGUNTA = {
  id: 8,
  categoria_id: 1,
  texto_pregunta: 'El docente explica con claridad',
  descripcion: null,
  tipo_pregunta: 'likert',
  obligatoria: true,
  orden: 1,
  activa: true,
  id_carrera: null,
}

const NUEVA = {
  categoria_id: 1,
  texto_pregunta: 'El docente llega a tiempo',
  tipo_pregunta: 'likert',
  obligatoria: true,
  orden: 2,
}

describe('RF-ENC-32 y RF-ENC-33 — API de preguntas de la encuesta', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
    reiniciarSesion()
  })

  describe('RF-ENC-32 — POST /api/evaluations/questions', () => {
    it('sin token responde 401 NO_TOKEN', async () => {
      const res = await request(app).post('/api/evaluations/questions').send(NUEVA)

      expect(res.status).toBe(401)
      expect(res.body).toEqual({ error: 'Token de acceso requerido', code: 'NO_TOKEN' })
    })

    it.each([
      ['estudiante', estudianteUser],
      ['profesor', profesorUser],
    ])('un %s no puede crear preguntas (403)', async (_rol, usuario) => {
      const auth = iniciarSesion(usuario)
      const crear = vi.spyOn(evaluationsRepository, 'createQuestion')

      const res = await request(app).post('/api/evaluations/questions').set('Authorization', auth).send(NUEVA)

      expect(res.status).toBe(403)
      expect(res.body).toMatchObject({ code: 'FORBIDDEN_ROLE' })
      expect(crear).not.toHaveBeenCalled()
    })

    it.each([
      ['administrador', adminUser],
      ['coordinador', coordinadorUser],
    ])('el %s crea la pregunta activa (201)', async (_rol, usuario) => {
      const auth = iniciarSesion(usuario)
      const crear = vi.spyOn(evaluationsRepository, 'createQuestion').mockResolvedValue({ id: 9, ...NUEVA, activa: true })

      const res = await request(app).post('/api/evaluations/questions').set('Authorization', auth).send(NUEVA)

      expect(res.status).toBe(201)
      expect(res.body).toMatchObject({ success: true, data: { id: 9, activa: true } })
      expect(crear).toHaveBeenCalledOnce()
      expect(crear).toHaveBeenCalledWith(expect.objectContaining({ ...NUEVA, activa: true }))
    })

    it('sin texto ni orden responde 400 y no escribe en la base', async () => {
      const auth = iniciarSesion(adminUser)
      const crear = vi.spyOn(evaluationsRepository, 'createQuestion')

      const res = await request(app)
        .post('/api/evaluations/questions')
        .set('Authorization', auth)
        .send({ categoria_id: 1, tipo_pregunta: 'likert' })

      expect(res.status).toBe(400)
      expect(res.body).toMatchObject({ success: false, error: 'Datos incompletos' })
      expect(crear).not.toHaveBeenCalled()
    })

    it('si la base falla responde 500 sin exponer el detalle', async () => {
      const auth = iniciarSesion(adminUser)
      vi.spyOn(evaluationsRepository, 'createQuestion').mockRejectedValue(new Error('duplicate key value violates...'))

      const res = await request(app).post('/api/evaluations/questions').set('Authorization', auth).send(NUEVA)

      expect(res.status).toBe(500)
      expect(JSON.stringify(res.body)).not.toContain('duplicate key')
    })
  })

  describe('RF-ENC-33 — PUT /api/evaluations/questions/:id (corregir)', () => {
    it('el administrador corrige el texto (200)', async () => {
      const auth = iniciarSesion(adminUser)
      const actualizar = vi
        .spyOn(evaluationsRepository, 'updateQuestion')
        .mockResolvedValue({ ...PREGUNTA, texto_pregunta: 'El docente explica con ejemplos' })

      const res = await request(app)
        .put('/api/evaluations/questions/8')
        .set('Authorization', auth)
        .send({ ...NUEVA, texto_pregunta: 'El docente explica con ejemplos', orden: 1 })

      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({ success: true, data: { id: 8, texto_pregunta: 'El docente explica con ejemplos' } })
      expect(actualizar).toHaveBeenCalledOnce()
      expect(actualizar).toHaveBeenCalledWith(
        8,
        expect.objectContaining({ texto_pregunta: 'El docente explica con ejemplos' })
      )
    })

    it('un estudiante no puede corregir preguntas (403)', async () => {
      const auth = iniciarSesion(estudianteUser)
      const actualizar = vi.spyOn(evaluationsRepository, 'updateQuestion')

      const res = await request(app).put('/api/evaluations/questions/8').set('Authorization', auth).send(NUEVA)

      expect(res.status).toBe(403)
      expect(actualizar).not.toHaveBeenCalled()
    })

    it('DEF-48: un texto en blanco responde 400 y no se guarda', async () => {
      const auth = iniciarSesion(adminUser)
      const actualizar = vi.spyOn(evaluationsRepository, 'updateQuestion').mockResolvedValue(PREGUNTA)

      const res = await request(app)
        .put('/api/evaluations/questions/8')
        .set('Authorization', auth)
        .send({ ...NUEVA, texto_pregunta: '   ' })

      expect(res.status).toBe(400)
      expect(res.body).toMatchObject({ success: false, message: 'El texto de la pregunta es obligatorio.' })
      expect(actualizar).not.toHaveBeenCalled()
    })

    it.each(['abc', '0', '-4', '1.5'])('DEF-49: el id «%s» responde 400 y no llega a la base', async (id) => {
      const auth = iniciarSesion(adminUser)
      const actualizar = vi.spyOn(evaluationsRepository, 'updateQuestion').mockResolvedValue(PREGUNTA)

      const res = await request(app)
        .put(`/api/evaluations/questions/${id}`)
        .set('Authorization', auth)
        .send(NUEVA)

      expect(res.status).toBe(400)
      expect(res.body).toMatchObject({ success: false, message: 'La pregunta no es válida.' })
      expect(actualizar).not.toHaveBeenCalled()
    })

    it('DEF-50: solo se guardan los campos editables (no id, activa ni fecha)', async () => {
      const auth = iniciarSesion(adminUser)
      const actualizar = vi.spyOn(evaluationsRepository, 'updateQuestion').mockResolvedValue(PREGUNTA)

      const res = await request(app)
        .put('/api/evaluations/questions/8')
        .set('Authorization', auth)
        .send({ ...NUEVA, id: 999, activa: false, created_at: '2020-01-01' })

      expect(res.status).toBe(200)
      const [, cambios] = actualizar.mock.calls[0]
      expect(Object.keys(cambios).sort()).toEqual(
        ['categoria_id', 'obligatoria', 'orden', 'texto_pregunta', 'tipo_pregunta'].sort()
      )
    })

    it('DEF-49: el orden debe ser entero mayor que cero si viene en el cuerpo', async () => {
      const auth = iniciarSesion(adminUser)
      const actualizar = vi.spyOn(evaluationsRepository, 'updateQuestion').mockResolvedValue(PREGUNTA)

      const res = await request(app)
        .put('/api/evaluations/questions/8')
        .set('Authorization', auth)
        .send({ ...NUEVA, orden: 0 })

      expect(res.status).toBe(400)
      expect(res.body).toMatchObject({ message: 'El orden debe ser un entero mayor que cero.' })
      expect(actualizar).not.toHaveBeenCalled()
    })
  })

  describe('RF-ENC-33 — DELETE /api/evaluations/questions/:id (retirar)', () => {
    it('el administrador desactiva la pregunta (200)', async () => {
      const auth = iniciarSesion(adminUser)
      const desactivar = vi.spyOn(evaluationsRepository, 'deactivateQuestion').mockResolvedValue(true)

      const res = await request(app).delete('/api/evaluations/questions/8').set('Authorization', auth)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ success: true, message: 'Pregunta desactivada exitosamente' })
      expect(desactivar).toHaveBeenCalledOnce()
      expect(desactivar).toHaveBeenCalledWith(8)
    })

    it('si la base falla responde 500 con un mensaje entendible', async () => {
      const auth = iniciarSesion(adminUser)
      vi.spyOn(evaluationsRepository, 'deactivateQuestion').mockRejectedValue(new Error('timeout'))

      const res = await request(app).delete('/api/evaluations/questions/8').set('Authorization', auth)

      expect(res.status).toBe(500)
      expect(res.body).toMatchObject({ success: false })
      expect(JSON.stringify(res.body)).not.toContain('timeout')
    })

    it('un profesor no puede retirar preguntas (403)', async () => {
      const auth = iniciarSesion(profesorUser)
      const desactivar = vi.spyOn(evaluationsRepository, 'deactivateQuestion')

      const res = await request(app).delete('/api/evaluations/questions/8').set('Authorization', auth)

      expect(res.status).toBe(403)
      expect(desactivar).not.toHaveBeenCalled()
    })

    it('DEF-49: un id no numérico responde 400', async () => {
      const auth = iniciarSesion(adminUser)
      const desactivar = vi.spyOn(evaluationsRepository, 'deactivateQuestion').mockResolvedValue(true)

      const res = await request(app).delete('/api/evaluations/questions/abc').set('Authorization', auth)

      expect(res.status).toBe(400)
      expect(desactivar).not.toHaveBeenCalled()
    })
  })

  describe('RF-ENC-32 — GET /api/evaluations/questions', () => {
    it('un estudiante autenticado ve las preguntas activas', async () => {
      const auth = iniciarSesion(estudianteUser)
      vi.spyOn(evaluationsRepository, 'getQuestionsWithCategories').mockResolvedValue([PREGUNTA] as never)

      const res = await request(app).get('/api/evaluations/questions').set('Authorization', auth)

      expect(res.status).toBe(200)
      expect(res.body.data).toEqual([expect.objectContaining({ id: 8, activa: true })])
    })
  })
})
