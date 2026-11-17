/**
 * Suite de regresión de Esteban (punto 10) — API de encuestas y preguntas.
 *
 * Bloque 1: comportamiento que ya existía y NO debe cambiar tras corregir DEF-48 a DEF-50
 *           (permisos, altas, retiros, contratos de respuesta).
 * Bloque 2: defectos corregidos que deben SEGUIR corregidos (fallan en la línea base 9baadcf).
 *
 * Solo usa la interfaz HTTP (Supertest sobre la app Express real y el middleware JWT real);
 * el repositorio se reemplaza con vi.spyOn. Así la misma suite corre contra la línea base y la versión final.
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
const NUEVA = { categoria_id: 1, texto_pregunta: 'El docente llega a tiempo', tipo_pregunta: 'likert', obligatoria: true, orden: 2 }
const RUTA = '/api/evaluations/questions'

describe('Regresión — API de encuestas (RF-ENC-32, RF-ENC-33)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
    reiniciarSesion()
  })

  describe('Bloque 1 — comportamiento que no debe cambiar', () => {
    it('R-API-01: un usuario autenticado lista las preguntas activas', async () => {
      const auth = iniciarSesion(estudianteUser)
      vi.spyOn(evaluationsRepository, 'getQuestionsWithCategories').mockResolvedValue([PREGUNTA] as never)

      const res = await request(app).get(RUTA).set('Authorization', auth)

      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({ success: true, data: [{ id: 8, activa: true }] })
    })

    it('R-API-02: sin token, las rutas de preguntas responden 401', async () => {
      const respuestas = await Promise.all([
        request(app).get(RUTA),
        request(app).post(RUTA).send(NUEVA),
        request(app).put(`${RUTA}/8`).send(NUEVA),
        request(app).delete(`${RUTA}/8`),
      ])

      expect(respuestas.map((r) => r.status)).toEqual([401, 401, 401, 401])
    })

    it.each([
      ['administrador', adminUser],
      ['coordinador', coordinadorUser],
    ])('R-API-03: el %s crea una pregunta activa (201)', async (_rol, usuario) => {
      const auth = iniciarSesion(usuario)
      const crear = vi.spyOn(evaluationsRepository, 'createQuestion').mockResolvedValue({ id: 9, ...NUEVA, activa: true })

      const res = await request(app).post(RUTA).set('Authorization', auth).send(NUEVA)

      expect(res.status).toBe(201)
      expect(res.body).toMatchObject({ success: true, data: { id: 9 }, message: 'Pregunta creada exitosamente' })
      expect(crear).toHaveBeenCalledWith(expect.objectContaining({ ...NUEVA, activa: true }))
    })

    it('R-API-04: crear sin los campos obligatorios responde 400 y no escribe', async () => {
      const auth = iniciarSesion(adminUser)
      const crear = vi.spyOn(evaluationsRepository, 'createQuestion')

      const res = await request(app).post(RUTA).set('Authorization', auth).send({ categoria_id: 1 })

      expect(res.status).toBe(400)
      expect(res.body).toMatchObject({ success: false, error: 'Datos incompletos' })
      expect(crear).not.toHaveBeenCalled()
    })

    it.each([
      ['POST', RUTA],
      ['PUT', `${RUTA}/8`],
      ['DELETE', `${RUTA}/8`],
    ])('R-API-05: un estudiante no puede usar %s %s (403)', async (metodo, ruta) => {
      const auth = iniciarSesion(estudianteUser)
      const llamada = request(app)[metodo.toLowerCase() as 'post' | 'put' | 'delete'](ruta).set('Authorization', auth)

      const res = await (metodo === 'DELETE' ? llamada : llamada.send(NUEVA))

      expect(res.status).toBe(403)
    })

    it('R-API-06: el administrador corrige una pregunta válida (200) y se guarda en el id pedido', async () => {
      const auth = iniciarSesion(adminUser)
      const actualizar = vi
        .spyOn(evaluationsRepository, 'updateQuestion')
        .mockResolvedValue({ ...PREGUNTA, texto_pregunta: 'El docente explica con ejemplos' })

      const res = await request(app)
        .put(`${RUTA}/8`)
        .set('Authorization', auth)
        .send({ ...NUEVA, texto_pregunta: 'El docente explica con ejemplos', orden: 1 })

      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({ success: true, message: 'Pregunta actualizada exitosamente' })
      expect(actualizar).toHaveBeenCalledWith(8, expect.objectContaining({ texto_pregunta: 'El docente explica con ejemplos' }))
    })

    it('R-API-07: el administrador retira una pregunta (200)', async () => {
      const auth = iniciarSesion(adminUser)
      const desactivar = vi.spyOn(evaluationsRepository, 'deactivateQuestion').mockResolvedValue(true)

      const res = await request(app).delete(`${RUTA}/8`).set('Authorization', auth)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ success: true, message: 'Pregunta desactivada exitosamente' })
      expect(desactivar).toHaveBeenCalledWith(8)
    })

    it('R-API-08: si la base falla al retirar responde 500 sin exponer el detalle', async () => {
      const auth = iniciarSesion(adminUser)
      vi.spyOn(evaluationsRepository, 'deactivateQuestion').mockRejectedValue(new Error('timeout de conexión'))

      const res = await request(app).delete(`${RUTA}/8`).set('Authorization', auth)

      expect(res.status).toBe(500)
      expect(JSON.stringify(res.body)).not.toContain('timeout de conexión')
    })

    it('R-API-09: las encuestas se listan y una sin nombre no se crea', async () => {
      const auth = iniciarSesion(adminUser)
      vi.spyOn(evaluationsRepository, 'listCategorias').mockResolvedValue([{ id: 1, nombre: 'Docencia', orden: 1 }] as never)
      const crear = vi.spyOn(evaluationsRepository, 'createCategoria')

      const lista = await request(app).get('/api/evaluations/categories').set('Authorization', auth)
      const vacia = await request(app).post('/api/evaluations/categories').set('Authorization', auth).send({ nombre: '  ', orden: 2 })

      expect(lista.status).toBe(200)
      expect(lista.body.categories).toEqual([expect.objectContaining({ nombre: 'Docencia' })])
      expect(vacia.status).toBe(400)
      expect(crear).not.toHaveBeenCalled()
    })
  })

  describe('Bloque 2 — defectos corregidos que deben seguir corregidos', () => {
    it('R-DEF-48: corregir con el texto en blanco responde 400 y no guarda', async () => {
      const auth = iniciarSesion(adminUser)
      const actualizar = vi.spyOn(evaluationsRepository, 'updateQuestion').mockResolvedValue(PREGUNTA)

      const res = await request(app).put(`${RUTA}/8`).set('Authorization', auth).send({ ...NUEVA, texto_pregunta: '   ' })

      expect(res.status).toBe(400)
      expect(actualizar).not.toHaveBeenCalled()
    })

    it('R-DEF-49: un id «1.5» no corrige la pregunta 1', async () => {
      const auth = iniciarSesion(adminUser)
      const actualizar = vi.spyOn(evaluationsRepository, 'updateQuestion').mockResolvedValue(PREGUNTA)

      const res = await request(app).put(`${RUTA}/1.5`).set('Authorization', auth).send(NUEVA)

      expect(res.status).toBe(400)
      expect(actualizar).not.toHaveBeenCalled()
    })

    it('R-DEF-50: la corrección no puede reactivar una pregunta ni cambiar su id', async () => {
      const auth = iniciarSesion(adminUser)
      const actualizar = vi.spyOn(evaluationsRepository, 'updateQuestion').mockResolvedValue(PREGUNTA)

      await request(app).put(`${RUTA}/8`).set('Authorization', auth).send({ ...NUEVA, id: 999, activa: true })

      expect(actualizar).toHaveBeenCalledOnce()
      expect(actualizar.mock.calls[0][1]).not.toHaveProperty('id')
      expect(actualizar.mock.calls[0][1]).not.toHaveProperty('activa')
    })
  })
})
