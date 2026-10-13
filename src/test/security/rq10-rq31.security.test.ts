/**
 * RQ10, RQ11, RQ13, RQ29, RQ30 y RQ31 — Acceso por rol y entradas que no deben colarse.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { fromMock, supabaseModuleMock } from '../helpers/supabase-mock'
import { iniciarSesion, reiniciarSesion } from '../helpers/sesion-http'
import { adminUser, coordinadorUser, estudianteUser, profesorUser } from '../fixtures/users'
import { decidirDesactivacionUsuario, decidirActualizacionUsuario, usuarioSinPassword, validarActualizacionUsuario } from '../helpers/gestionar-usuarios'
import { decidirResumenByProfessor } from '../helpers/resumen-ia'
import { decidirResumenPorAlcance, rolPuedePedirAlcance } from '../helpers/resumen-alcance'
import { construirAcosoProfesores, detectarAcosoEnTextos } from '../helpers/alerta-acoso'
import { validarBodyEvaluacion } from '../helpers/evaluacion-docente'

vi.mock('../../config/supabase-only', () => supabaseModuleMock)
vi.mock('../../config/supabaseClient', () => supabaseModuleMock)

import { app } from '../../app'

const cuerpoEvaluacion = {
  teacherId: '7',
  courseId: '10',
  groupId: '3',
  answers: [{ questionId: 1, rating: 4, textAnswer: '<script>alert(1)</script>' }],
  overallRating: 4,
  comments: '<script>alert(1)</script>',
}

describe('RQ10, RQ11, RQ13, RQ29 y RQ30 — Sin token no hay datos', () => {
  beforeEach(() => {
    fromMock.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
    reiniciarSesion()
  })

  it.each([
    ['estadísticas del estudiante', 'get', '/api/teachers/student-stats'],
    ['enviar evaluación', 'post', '/api/teachers/evaluations'],
    ['listar usuarios', 'get', '/api/users'],
    ['crear usuario', 'post', '/api/auth/create-user'],
    ['resumen del profesor', 'get', '/api/ai/summarize/by-professor?profesor_id=7'],
    ['resumen de la carrera', 'get', '/api/ai/summarize/by-career'],
    ['resumen de la facultad', 'get', '/api/ai/summarize/by-faculty'],
  ] as const)('%s responde 401 y no consulta la base', async (_caso, metodo, ruta) => {
    const res = await request(app)[metodo](ruta).send(cuerpoEvaluacion)

    expect(res.status).toBe(401)
    expect(res.body.code).toBe('NO_TOKEN')
    expect(fromMock).not.toHaveBeenCalled()
  })
})

describe('RQ10, RQ11, RQ13, RQ29 y RQ30 — El rol no escala', () => {
  beforeEach(() => {
    fromMock.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
    reiniciarSesion()
  })

  it('RQ10: un profesor no lee las estadísticas del estudiante', async () => {
    const auth = iniciarSesion(profesorUser)

    const res = await request(app).get('/api/teachers/student-stats').set('Authorization', auth)

    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/estudiantes/i)
    expect(res.body).not.toHaveProperty('data')
  })

  it('RQ11: un profesor no guarda una evaluación, ni aunque el comentario traiga HTML', async () => {
    const auth = iniciarSesion(profesorUser)

    const res = await request(app).post('/api/teachers/evaluations').set('Authorization', auth).send(cuerpoEvaluacion)

    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/estudiantes/i)
    expect(JSON.stringify(res.body)).not.toContain('<script>')
  })

  it('RQ11: un teacherId con SQL no pasa la validación ni toca la base', async () => {
    const auth = iniciarSesion(estudianteUser)

    const res = await request(app)
      .post('/api/teachers/evaluations')
      .set('Authorization', auth)
      .send({ ...cuerpoEvaluacion, teacherId: '7; DROP TABLE evaluaciones' })

    expect(res.status).toBe(400)
    expect(res.body.error).toBeTruthy()
    expect(fromMock).not.toHaveBeenCalled()
  })

  it.each([
    ['listar usuarios', 'get', '/api/users'],
    ['crear usuario', 'post', '/api/auth/create-user'],
    ['desactivar usuario', 'delete', '/api/users/user-admin'],
  ] as const)('RQ13: un estudiante no puede %s', async (_caso, metodo, ruta) => {
    const auth = iniciarSesion(estudianteUser)

    const res = await request(app)[metodo](ruta).set('Authorization', auth).send({
      email: 'ana@soyudemedellin.edu.co',
      password: 'Clave-Segura2026!',
      nombre: 'Ana',
      apellido: 'Pérez',
      tipo_usuario: 'admin',
    })

    expect(res.status).toBe(403)
    expect(res.body.code).toBe('FORBIDDEN_ROLE')
  })

  it.each([
    ['estudiante', estudianteUser, '/api/ai/summarize/by-professor?profesor_id=7'],
    ['profesor', profesorUser, '/api/ai/summarize/by-career'],
    ['coordinador', coordinadorUser, '/api/ai/summarize/by-faculty'],
  ] as const)('RQ29/RQ30: %s no entra a %s', async (_rol, usuario, ruta) => {
    const auth = iniciarSesion(usuario)

    const res = await request(app).get(ruta).set('Authorization', auth)

    expect(res.status).toBe(403)
    expect(res.body.code).toBe('FORBIDDEN_ROLE')
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('RQ29: un profesor no resume a otro profesor', async () => {
    const auth = iniciarSesion(profesorUser)

    const res = await request(app)
      .get('/api/ai/summarize/by-professor')
      .query({ profesor_id: 'otro-profesor' })
      .set('Authorization', auth)

    expect(res.status).toBe(403)
    expect(res.body.error).toBe('No autorizado')
  })
})

describe('RQ11, RQ13, RQ29, RQ30 y RQ31 — La carga maliciosa no se acepta', () => {
  it('RQ11: teacherId con SQL y una nota fuera de rango no arman una evaluación', () => {
    const invalido = validarBodyEvaluacion({
      ...cuerpoEvaluacion,
      teacherId: '7 OR 1=1',
      overallRating: 99,
    })

    expect(invalido.ok).toBe(false)
    expect(invalido.status).toBe(400)
    expect(invalido.data).toBeUndefined()
  })

  it('RQ13: la respuesta pública no devuelve la contraseña y un tipo inventado se rechaza', () => {
    const actualizado = decidirActualizacionUsuario({
      autenticado: true,
      esAdmin: true,
      id: 'u-1',
      existe: true,
      nombre: 'Ana',
      password: 'Clave-Segura2026!',
    })
    const tipo = validarActualizacionUsuario({ id: 'u-1', existe: true, tipo_usuario: 'superadmin' })
    const vacio = validarActualizacionUsuario({ id: 'u-1', existe: true })

    expect(actualizado.ok).toBe(true)
    expect(actualizado.data?.user).not.toHaveProperty('password')
    expect(JSON.stringify(actualizado.data)).not.toContain('Clave-Segura2026!')
    expect(usuarioSinPassword({ id: 'u-1', password: 'Clave-Segura2026!' })).not.toHaveProperty('password')
    expect(tipo).toMatchObject({ ok: false, status: 400 })
    expect(vacio.error).toBe('No hay campos para actualizar')
  })

  it('RQ13: el admin no se desactiva a sí mismo y quien no es admin no desactiva a nadie', () => {
    expect(
      decidirDesactivacionUsuario({
        autenticado: true,
        esAdmin: true,
        id: adminUser.id,
        existe: true,
        adminId: adminUser.id,
      })
    ).toMatchObject({ ok: false, status: 400 })

    expect(
      decidirDesactivacionUsuario({
        autenticado: true,
        esAdmin: false,
        id: 'u-2',
        existe: true,
        adminId: estudianteUser.id,
      })
    ).toMatchObject({ ok: false, status: 403, code: 'FORBIDDEN_ROLE' })
  })

  it.each([
    ['estudiante', 'profesor'],
    ['estudiante', 'carrera'],
    ['profesor', 'carrera'],
    ['profesor', 'facultad'],
    ['coordinador', 'facultad'],
  ] as const)('RQ30: %s no puede pedir el alcance %s', (rol, alcance) => {
    expect(rolPuedePedirAlcance(rol, alcance)).toBe(false)
    expect(
      decidirResumenPorAlcance({ autenticado: true, tipoUsuario: rol, alcance, profesorId: '7', respuestas: [] }).status
    ).toBe(403)
  })

  it('RQ29: un estudiante y un profesor ajeno no reciben el resumen', () => {
    expect(decidirResumenByProfessor({ autenticado: true, tipoUsuario: 'estudiante', profesorId: '7' }).status).toBe(403)
    expect(
      decidirResumenByProfessor({
        autenticado: true,
        tipoUsuario: 'profesor',
        userId: profesorUser.id,
        profesorId: 'otro-profesor',
        texts: ['<script>alert(1)</script>'],
      })
    ).toMatchObject({ ok: false, status: 403, error: 'No autorizado' })
  })

  it('RQ31: HTML, SQL y una mención corta no encienden la alerta', () => {
    const textos = ['<script>alert(1)</script>', "'; DROP TABLE respuestas;--", 'ac', 'la clase fue normal']
    const deteccion = detectarAcosoEnTextos(textos)
    const profesores = construirAcosoProfesores(
      textos.map((respuesta_texto, i) => ({
        evaluacion_id: `e-${i}`,
        profesor_id: '7',
        profesorNombre: 'Ana Perez',
        respuesta_texto,
      }))
    )

    expect(deteccion.acosoDetectado).toBe(false)
    expect(deteccion.mensajeAcoso).toBeUndefined()
    expect(profesores).toEqual([])
  })
})
