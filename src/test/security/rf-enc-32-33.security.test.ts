/**
 * Punto 13 — Pruebas de seguridad de la API de encuestas (RF-ENC-32, RF-ENC-33), por categoría OWASP Top 10 (2021).
 *
 * Análisis dinámico con Supertest: app Express real, middleware JWT real y helmet real.
 * Solo el repositorio se reemplaza con vi.spyOn, para comprobar que un ataque NO llega a la base.
 *
 * Los casos marcados «HALLAZGO ABIERTO» validan el comportamiento actual de un riesgo documentado
 * en docs/pruebas/13-SEGURIDAD.md; si alguien lo corrige, la prueba avisa y hay que actualizar el informe.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { supabaseModuleMock } from '../helpers/supabase-mock'
import { firmarToken, iniciarSesion, reiniciarSesion } from '../helpers/sesion-http'
import { adminUser, coordinadorUser, estudianteUser, profesorUser } from '../fixtures/users'

vi.mock('../../config/supabase-only', () => supabaseModuleMock)
vi.mock('../../config/supabaseClient', () => supabaseModuleMock)

import { app } from '../../app'
import { evaluationsRepository } from '../../modules/evaluations/evaluations.repository'

const RUTA = '/api/evaluations/questions'
const NUEVA = { categoria_id: 1, texto_pregunta: 'El docente llega a tiempo', tipo_pregunta: 'likert', obligatoria: true, orden: 2 }
const PREGUNTA = { id: 8, ...NUEVA, activa: true, id_carrera: null }

const base64url = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')

/** Espía todas las escrituras: ninguna debe ocurrir cuando el ataque se rechaza. */
function espiarEscrituras() {
  return [
    vi.spyOn(evaluationsRepository, 'createQuestion').mockResolvedValue(PREGUNTA),
    vi.spyOn(evaluationsRepository, 'updateQuestion').mockResolvedValue(PREGUNTA),
    vi.spyOn(evaluationsRepository, 'deactivateQuestion').mockResolvedValue(true),
    vi.spyOn(evaluationsRepository, 'createCategoria').mockResolvedValue({ id: 3 } as never),
    vi.spyOn(evaluationsRepository, 'updateCategoria').mockResolvedValue({ id: 1 } as never),
  ]
}

const ESCRITURAS: Array<[string, string, object | undefined]> = [
  ['post', RUTA, NUEVA],
  ['put', `${RUTA}/8`, NUEVA],
  ['delete', `${RUTA}/8`, undefined],
  ['post', '/api/evaluations/categories', { nombre: 'X', orden: 1 }],
  ['put', '/api/evaluations/categories/1', { nombre: 'X', orden: 1 }],
]

function pedir(metodo: string, ruta: string, cuerpo?: object, auth?: string) {
  let r = request(app)[metodo as 'post' | 'put' | 'delete'](ruta)
  if (auth) r = r.set('Authorization', auth)
  return cuerpo ? r.send(cuerpo) : r
}

describe('Punto 13 — Seguridad de la API de encuestas', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
    reiniciarSesion()
  })

  // ───────────────────────── A01 Broken Access Control ─────────────────────────
  describe('A01 — Control de acceso', () => {
    it.each(ESCRITURAS)('SEC-01 sin token: %s %s → 401 y no escribe', async (metodo, ruta, cuerpo) => {
      const escrituras = espiarEscrituras()

      const res = await pedir(metodo, ruta, cuerpo)

      expect(res.status).toBe(401)
      expect(res.body).toEqual({ error: 'Token de acceso requerido', code: 'NO_TOKEN' })
      escrituras.forEach((e) => expect(e).not.toHaveBeenCalled())
    })

    it.each([
      ['estudiante', estudianteUser],
      ['profesor', profesorUser],
    ])('SEC-02 un %s no puede modificar el instrumento (403 en las 5 escrituras)', async (_rol, usuario) => {
      const auth = iniciarSesion(usuario)
      const escrituras = espiarEscrituras()

      const estados = []
      for (const [metodo, ruta, cuerpo] of ESCRITURAS) estados.push((await pedir(metodo, ruta, cuerpo, auth)).status)

      expect(estados).toEqual([403, 403, 403, 403, 403])
      escrituras.forEach((e) => expect(e).not.toHaveBeenCalled())
    })

    it('SEC-03 decir «admin» dentro del JWT no da permisos: el rol sale de la base', async () => {
      iniciarSesion(estudianteUser)
      const escrituras = espiarEscrituras()
      const token = firmarToken({ userId: estudianteUser.id, tipo_usuario: 'admin', roles: ['admin'] })

      const res = await pedir('put', `${RUTA}/8`, NUEVA, `Bearer ${token}`)

      expect(res.status).toBe(403)
      escrituras.forEach((e) => expect(e).not.toHaveBeenCalled())
    })

    it('SEC-04 HALLAZGO ABIERTO: un coordinador puede corregir una pregunta de otra carrera', async () => {
      // El coordinador es de la carrera 1; la pregunta 20 es de la carrera 2.
      // La ruta solo comprueba el rol, no a qué carrera pertenece la pregunta.
      const auth = iniciarSesion(coordinadorUser)
      const actualizar = vi
        .spyOn(evaluationsRepository, 'updateQuestion')
        .mockResolvedValue({ ...PREGUNTA, id: 20, id_carrera: 2 } as never)

      const res = await pedir('put', `${RUTA}/20`, { texto_pregunta: 'Cambiada por otra carrera' }, auth)

      expect(res.status).toBe(200)
      expect(actualizar).toHaveBeenCalledWith(20, { texto_pregunta: 'Cambiada por otra carrera' })
    })
  })

  // ───────────────────────── A07 Identification and Authentication Failures ─────────────────────────
  describe('A07 — Autenticación (JWT)', () => {
    it.each([
      ['alg none sin firma', () => `${base64url({ alg: 'none', typ: 'JWT' })}.${base64url({ userId: adminUser.id })}.`],
      ['firmado con otra clave', () => firmarToken({ userId: adminUser.id }, { secreto: 'clave-del-atacante' })],
      ['vencido', () => firmarToken({ userId: adminUser.id }, { expiresIn: -10 })],
      [
        'payload cambiado con la firma original',
        () => {
          const [cabecera, , firma] = firmarToken({ userId: estudianteUser.id }).split('.')
          return `${cabecera}.${base64url({ userId: adminUser.id })}.${firma}`
        },
      ],
    ])('SEC-05 token %s → 401 y no corrige la pregunta', async (_caso, token) => {
      iniciarSesion(adminUser)
      const escrituras = espiarEscrituras()

      const res = await pedir('put', `${RUTA}/8`, NUEVA, `Bearer ${token()}`)

      expect(res.status).toBe(401)
      expect(JSON.stringify(res.body)).not.toMatch(/jsonwebtoken|JsonWebTokenError|stack/i)
      escrituras.forEach((e) => expect(e).not.toHaveBeenCalled())
    })

    it('SEC-06 un administrador desactivado no puede seguir usando su token', async () => {
      const auth = iniciarSesion(adminUser, { activo: false })
      const escrituras = espiarEscrituras()

      const res = await pedir('delete', `${RUTA}/8`, undefined, auth)

      expect(res.status).toBe(401)
      escrituras.forEach((e) => expect(e).not.toHaveBeenCalled())
    })
  })

  // ───────────────────────── A03 Injection ─────────────────────────
  describe('A03 — Inyección', () => {
    it.each(['8 OR 1=1', '8;DROP TABLE preguntas_evaluacion', '8%27--', '0x8', '1e1'])(
      'SEC-07 el id «%s» en la ruta → 400 y no llega a la base',
      async (id) => {
        const auth = iniciarSesion(adminUser)
        const escrituras = espiarEscrituras()

        const res = await pedir('put', `${RUTA}/${encodeURIComponent(id)}`, NUEVA, auth)

        expect(res.status).toBe(400)
        escrituras.forEach((e) => expect(e).not.toHaveBeenCalled())
      }
    )

    it('SEC-08 SQL en el texto se guarda como texto literal (consulta parametrizada) y no rompe la respuesta', async () => {
      const auth = iniciarSesion(adminUser)
      const texto = "'; DROP TABLE preguntas_evaluacion; --"
      const crear = vi.spyOn(evaluationsRepository, 'createQuestion').mockResolvedValue({ ...PREGUNTA, texto_pregunta: texto })

      const res = await pedir('post', RUTA, { ...NUEVA, texto_pregunta: texto }, auth)

      expect(res.status).toBe(201)
      expect(crear).toHaveBeenCalledWith(expect.objectContaining({ texto_pregunta: texto }))
      expect(JSON.stringify(res.body)).not.toMatch(/syntax error|postgres|stack/i)
    })

    it.each([
      ['un objeto', { a: 1 }],
      ['una lista', ['uno', 'dos']],
      ['un número', 42],
    ])('SEC-17 un texto que llega como %s → 400 (antes se guardaba «[object Object]»)', async (_caso, texto) => {
      const auth = iniciarSesion(adminUser)
      const escrituras = espiarEscrituras()

      const res = await pedir('put', `${RUTA}/8`, { texto_pregunta: texto }, auth)

      expect(res.status).toBe(400)
      escrituras.forEach((e) => expect(e).not.toHaveBeenCalled())
    })

    it('SEC-17 al crear, un texto que no es cadena o solo tiene espacios → 400', async () => {
      const auth = iniciarSesion(adminUser)
      const escrituras = espiarEscrituras()

      const estados = []
      for (const texto of [{ a: 1 }, ['uno'], '   ']) estados.push((await pedir('post', RUTA, { ...NUEVA, texto_pregunta: texto }, auth)).status)

      expect(estados).toEqual([400, 400, 400])
      escrituras.forEach((e) => expect(e).not.toHaveBeenCalled())
    })

    it('SEC-09 HTML en el texto se guarda tal cual: el escape es responsabilidad del front (ver prueba del front)', async () => {
      const auth = iniciarSesion(adminUser)
      const xss = '<img src=x onerror=alert(1)>'
      vi.spyOn(evaluationsRepository, 'updateQuestion').mockResolvedValue({ ...PREGUNTA, texto_pregunta: xss })

      const res = await pedir('put', `${RUTA}/8`, { texto_pregunta: xss }, auth)

      expect(res.status).toBe(200)
      expect(res.headers['content-type']).toMatch(/application\/json/)
    })
  })

  // ───────────────────────── A04 Insecure Design ─────────────────────────
  describe('A04 — Diseño inseguro', () => {
    it('SEC-10 «__proto__», «constructor», id y activa en el cuerpo no llegan a la base ni contaminan objetos', async () => {
      const auth = iniciarSesion(adminUser)
      const actualizar = vi.spyOn(evaluationsRepository, 'updateQuestion').mockResolvedValue(PREGUNTA)
      const cuerpo = `{"texto_pregunta":"Válida","__proto__":{"activa":false,"esAdmin":true},"constructor":{"prototype":{"x":1}},"id":999,"activa":false}`

      const res = await request(app).put(`${RUTA}/8`).set('Authorization', auth).set('Content-Type', 'application/json').send(cuerpo)

      expect(res.status).toBe(200)
      expect(Object.keys(actualizar.mock.calls[0][1])).toEqual(['texto_pregunta'])
      expect(({} as Record<string, unknown>).esAdmin).toBeUndefined()
      expect(({} as Record<string, unknown>).x).toBeUndefined()
    })

    it('SEC-11 un cuerpo de más de 100 KB se rechaza sin llegar a la base', async () => {
      const auth = iniciarSesion(adminUser)
      const escrituras = espiarEscrituras()

      const res = await pedir('post', RUTA, { ...NUEVA, texto_pregunta: 'a'.repeat(120_000) }, auth)

      expect(res.status).toBe(413)
      expect(JSON.stringify(res.body)).not.toMatch(/stack|PayloadTooLargeError|node_modules/)
      escrituras.forEach((e) => expect(e).not.toHaveBeenCalled())
    })

    it('SEC-12 HALLAZGO ABIERTO: el back acepta cualquier tipo_pregunta', async () => {
      // La pantalla solo ofrece likert, texto y opcion_multiple, pero la API guarda cualquier valor.
      const auth = iniciarSesion(adminUser)
      const crear = vi.spyOn(evaluationsRepository, 'createQuestion').mockResolvedValue(PREGUNTA)

      const res = await pedir('post', RUTA, { ...NUEVA, tipo_pregunta: 'tipo-inventado' }, auth)

      expect(res.status).toBe(201)
      expect(crear).toHaveBeenCalledWith(expect.objectContaining({ tipo_pregunta: 'tipo-inventado' }))
    })
  })

  // ───────────────────────── A05 Security Misconfiguration ─────────────────────────
  describe('A05 — Configuración de seguridad', () => {
    it('SEC-13 un fallo de la base no expone stack, SQL ni detalles internos', async () => {
      const auth = iniciarSesion(adminUser)
      vi.spyOn(evaluationsRepository, 'updateQuestion').mockRejectedValue(
        Object.assign(new Error('relation "preguntas_evaluacion" violates constraint at /srv/app/node_modules/pg'), { code: '23505' })
      )

      const res = await pedir('put', `${RUTA}/8`, NUEVA, auth)

      expect(res.status).toBe(500)
      expect(JSON.stringify(res.body)).not.toMatch(/preguntas_evaluacion|node_modules|stack|23505/)
    })

    it('SEC-14 un JSON mal formado responde 400 en JSON, sin stack', async () => {
      const auth = iniciarSesion(adminUser)

      const res = await request(app).put(`${RUTA}/8`).set('Authorization', auth).set('Content-Type', 'application/json').send('{"texto_pregunta":')

      expect(res.status).toBe(400)
      expect(res.headers['content-type']).toMatch(/application\/json/)
      expect(JSON.stringify(res.body)).not.toMatch(/stack|SyntaxError|node_modules/)
    })

    it('SEC-15 las respuestas de preguntas llevan las cabeceras de helmet y no anuncian Express', async () => {
      const auth = iniciarSesion(adminUser)
      vi.spyOn(evaluationsRepository, 'getQuestionsWithCategories').mockResolvedValue([PREGUNTA] as never)

      const res = await request(app).get(RUTA).set('Authorization', auth)

      expect(res.headers['x-content-type-options']).toBe('nosniff')
      expect(res.headers['x-frame-options']).toBeDefined()
      expect(res.headers['x-powered-by']).toBeUndefined()
    })

    it('SEC-16 un origen ajeno no entra en la lista; sin CORS_ORIGIN el back queda abierto en «*»', async () => {
      // app.ts lee CORS_ORIGIN al cargarse. En Jenkins el .env lo trae definido
      // (localhost:3001,8081); en un .env local vacío sigue el hallazgo abierto.
      const origenes = (process.env.CORS_ORIGIN ?? '').split(',').map((o) => o.trim()).filter(Boolean)

      const res = await request(app)
        .options(`${RUTA}/8`)
        .set('Origin', 'https://evil.example')
        .set('Access-Control-Request-Method', 'PUT')

      const permitido = res.headers['access-control-allow-origin']
      if (origenes.length === 0) {
        expect(permitido).toBe('*')
      } else {
        expect(permitido).not.toBe('*')
        expect(permitido).not.toBe('https://evil.example')
      }
      expect(res.headers['set-cookie']).toBeUndefined()
    })
  })
})
