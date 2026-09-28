import { afterEach, beforeEach, describe, it, vi } from 'vitest'
import { expect } from 'chai'
import jwt from 'jsonwebtoken'
import type { NextFunction, Request, Response } from 'express'
import { fromMock, supabaseModuleMock } from '../helpers/supabase-mock'
import { queueFrom } from '../helpers/query-builder'
import { adminUser, coordinadorUser, estudianteUser, profesorUser } from '../fixtures/users'

const academicRepository = vi.hoisted(() => ({
  findEstudianteByUsuarioId: vi.fn(),
  findInscripcion: vi.fn(),
  reactivateInscripcion: vi.fn(),
  insertInscripcion: vi.fn(),
  listCursosActivosInCareer: vi.fn(),
  listAsignacionesActivasByGrupoIds: vi.fn(),
  listAsignacionesByGrupoIds: vi.fn(),
  findAsignacionByGrupo: vi.fn(),
}))

const qrRepository = vi.hoisted(() => ({
  findActivoGrupoByToken: vi.fn(),
  listActivosByGrupoIds: vi.fn(),
  listActivosParaShare: vi.fn(),
  insert: vi.fn(),
}))

const RoleService = vi.hoisted(() => ({
  obtenerRolesUsuario: vi.fn(),
  obtenerPermisosUsuario: vi.fn(),
  obtenerCoordinadorPorUsuario: vi.fn(),
}))

const sendMail = vi.hoisted(() => vi.fn())

vi.mock('../../config/supabase-only', () => supabaseModuleMock)
vi.mock('../../config/supabaseClient', () => supabaseModuleMock)
vi.mock('../../modules/academic/academic.repository', () => ({ academicRepository }))
vi.mock('../../modules/evaluations/qr.repository', () => ({ qrRepository }))
vi.mock('../../modules/auth/role.service', () => ({ RoleService, default: RoleService }))
vi.mock('../../shared/adapters/mailer.adapter', () => ({ sendMail }))

import { authenticateToken, requirePermission, requireRole } from '../../middleware/auth'
import { autoEnrollPorQr } from '../../modules/evaluations/qr-auto-enroll'
import { generarQrsBatch } from '../../modules/evaluations/qr-batch'
import { compartirQrsPorEmail } from '../../modules/evaluations/qr-share-email'
import { mapearRespuestaQr, resolverEvaluacionQr } from '../../modules/evaluations/qr-resolucion'
import { decidirRelacionEstudianteMateria } from '../../modules/academic/estudiante-materias'
import { AppError } from '../../shared/errors'

/**
 * Regresión de RQ6, RQ14, RQ15, RQ16, RQ17 y RQ27.
 * Cada caso es independiente: datos locales, una operación y la comprobación,
 * como en test_regression.py y test_carrito_aaa_first.py.
 */

const findUserById = supabaseModuleMock.SupabaseDB.findUserById as ReturnType<typeof vi.fn>

function httpCapturado() {
  const capturado = { statusCode: 0, body: undefined as unknown, next: false }
  const res = {
    status(code: number) {
      capturado.statusCode = code
      return this
    },
    json(body: unknown) {
      capturado.body = body
      return this
    },
  }
  const next = () => {
    capturado.next = true
  }
  return { res: res as unknown as Response, next: next as NextFunction, capturado }
}

async function acceso(authorization?: string) {
  const req = { headers: { authorization } } as unknown as Request
  const { res, next, capturado } = httpCapturado()
  await authenticateToken(req, res, next)
  return { ...capturado, user: req.user }
}

function decision(middleware: ReturnType<typeof requireRole>, user: Request['user']) {
  const { res, next, capturado } = httpCapturado()
  middleware({ user } as Request, res, next)
  return capturado
}

async function rechazoDe(accion: () => Promise<unknown>): Promise<AppError> {
  try {
    await accion()
  } catch (error) {
    return error as AppError
  }
  expect.fail('se esperaba un error')
}

const GRUPO_CON_PROFESOR = { id: 1, curso_id: 10, profesor_id: 'p1' }

function mockGrupos(filas: unknown[]) {
  fromMock.mockImplementation(queueFrom({ grupos: [{ data: filas, error: null }] }))
}

function prepararInscripcion() {
  academicRepository.findEstudianteByUsuarioId.mockResolvedValue({ id: 'est-1' })
  qrRepository.findActivoGrupoByToken.mockResolvedValue({ grupo_id: 11 })
  academicRepository.insertInscripcion.mockResolvedValue(undefined)
  academicRepository.reactivateInscripcion.mockResolvedValue(undefined)
}

function prepararLote() {
  academicRepository.listAsignacionesActivasByGrupoIds.mockResolvedValue([])
  qrRepository.listActivosByGrupoIds.mockResolvedValue([])
  qrRepository.insert.mockResolvedValue(undefined)
}

const FILA_QR = {
  grupo_id: 3,
  token: 'tok-1',
  curso: { nombre: 'Álgebra', codigo: 'MAT-101', carrera_id: 1 },
  grupo: { numero_grupo: 'A' },
  profesor: { usuario: { nombre: 'Ana', apellido: 'Pérez' } },
}

const SMTP = {
  SMTP_HOST: 'smtp.test',
  SMTP_USER: 'u',
  SMTP_PASS: 'p',
  SMTP_FROM: 'from@test.com',
  FRONTEND_URL: 'http://localhost:5173/',
}

const CUERPO_CORREO = { to: ' a@b.com ', subject: 'QR grupos', message: 'Links', grupoIds: [3, 3] }

let envPrevio: Record<string, string | undefined> = {}

function prepararCorreo() {
  envPrevio = {}
  for (const [clave, valor] of Object.entries(SMTP)) {
    envPrevio[clave] = process.env[clave]
    process.env[clave] = valor
  }
  sendMail.mockResolvedValue(undefined)
  qrRepository.listActivosParaShare.mockResolvedValue([FILA_QR])
}

const INSCRIPCION = {
  id: 11,
  grupo: {
    id: 21,
    numero_grupo: 1,
    horario: 'Lun 8-10',
    aula: 'A-101',
    curso: { id: 31, nombre: 'Programación I', codigo: 'SIS-101', creditos: 3 },
    asignaciones_profesor: {
      profesor: { id: 'prof-1', usuario: { nombre: 'Ana', apellido: 'Pérez' } },
    },
    periodo: { id: 41, ano: 2026, semestre: 1, nombre: '2026-I' },
  },
}

const MATERIA_ESPERADA = {
  id: 11,
  grupo: {
    id: 21,
    numeroGrupo: 1,
    horario: 'Lun 8-10',
    aula: 'A-101',
    curso: { id: 31, nombre: 'Programación I', codigo: 'SIS-101', creditos: 3 },
    profesor: { id: 'prof-1', nombre: 'Ana Pérez' },
    periodo: { id: 41, nombre: '2026-I', codigo: '2026-1' },
  },
}

const QR_VIGENTE = { activo: true, profesor_id: 'p1', curso_id: 10, grupo_id: 3 }

describe('Regresión de RQ6, RQ14, RQ15, RQ16, RQ17 y RQ27', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  describe('RQ6 — Control de acceso por roles', () => {
    const usuarioActivo = {
      id: 'u-est',
      email: 'est@test.com',
      tipo_usuario: 'estudiante',
      activo: true,
    }

    function tokenDe(userId: string, opciones?: jwt.SignOptions) {
      return jwt.sign({ userId }, process.env.JWT_SECRET as string, opciones)
    }

    it('regresión: el token válido deja pasar con sus roles y permisos', async () => {
      // Arrange: datos locales y controlados para mantener la independencia.
      findUserById.mockResolvedValueOnce(usuarioActivo)
      RoleService.obtenerRolesUsuario.mockResolvedValueOnce(['estudiante'])
      RoleService.obtenerPermisosUsuario.mockResolvedValueOnce(['view_evaluations'])
      const token = tokenDe('u-est', { expiresIn: '1h' })

      // Act: una sola operación principal.
      const resultado = await acceso(`Bearer ${token}`)

      // Assert: la prueba se valida automáticamente.
      expect(resultado.next, 'continúa').to.equal(true)
      expect(resultado.user, 'sesión').to.deep.equal({
        id: 'u-est',
        email: 'est@test.com',
        tipo_usuario: 'estudiante',
        roles: ['estudiante'],
        permisos: ['view_evaluations'],
      })
    })

    it('regresión: el estudiante entra a la ruta de su rol', () => {
      // Arrange
      const user = { id: 'u-est', tipo_usuario: 'estudiante', roles: ['estudiante'] } as Request['user']

      // Act
      const resultado = decision(requireRole(['estudiante']), user)

      // Assert
      expect(resultado.statusCode, 'código').to.equal(0)
      expect(resultado.next, 'entra').to.equal(true)
    })

    it('regresión: el mismo estudiante no entra a rutas de admin', () => {
      // Arrange
      const user = { id: 'u-est', tipo_usuario: 'estudiante', roles: ['estudiante'] } as Request['user']

      // Act
      const resultado = decision(requireRole(['admin', 'coordinador']), user)

      // Assert
      expect(resultado.statusCode, 'código').to.equal(403)
      expect(resultado.body, 'cuerpo').to.include({
        error: 'Permisos insuficientes',
        code: 'FORBIDDEN_ROLE',
      })
    })

    it('regresión: niega el permiso que no tiene', () => {
      // Arrange
      const user = { id: 'u-est', permisos: ['view_evaluations'] } as Request['user']

      // Act
      const resultado = decision(requirePermission('manage_users'), user)

      // Assert
      expect(resultado.statusCode, 'código').to.equal(403)
      expect(resultado.body, 'cuerpo').to.include({ code: 'FORBIDDEN_PERMISSION' })
    })

    it('regresión: el permiso all sí entra', () => {
      // Arrange
      const user = { id: 'u-est', permisos: ['all'] } as Request['user']

      // Act
      const resultado = decision(requirePermission('manage_users'), user)

      // Assert
      expect(resultado.next, 'entra').to.equal(true)
    })

    it.each([
      { caso: 'desactivado', usuario: { id: 'u-est', email: 'est@test.com', tipo_usuario: 'estudiante', activo: false } },
      { caso: 'borrado', usuario: null },
    ])('regresión: el token deja de servir si el usuario está $caso', async ({ usuario }) => {
      // Arrange
      findUserById.mockResolvedValueOnce(usuario)
      const token = tokenDe('u-est', { expiresIn: '1h' })

      // Act
      const resultado = await acceso(`Bearer ${token}`)

      // Assert
      expect(resultado.statusCode, 'código').to.equal(401)
      expect(resultado.body, 'cuerpo').to.include({ code: 'USER_INVALID' })
    })

    it('regresión: un token expirado responde 401', async () => {
      // Arrange
      const token = tokenDe('u-est', { expiresIn: '-10s' })

      // Act
      const resultado = await acceso(`Bearer ${token}`)

      // Assert
      expect(resultado.statusCode, 'código').to.equal(401)
      expect(resultado.body, 'cuerpo').to.include({ code: 'TOKEN_EXPIRED' })
    })

    it('regresión: un token con otra firma responde 401', async () => {
      // Arrange
      const token = jwt.sign({ userId: 'u-est' }, 'otro-secreto')

      // Act
      const resultado = await acceso(`Bearer ${token}`)

      // Assert
      expect(resultado.statusCode, 'código').to.equal(401)
      expect(resultado.body, 'cuerpo').to.include({ code: 'TOKEN_INVALID' })
    })

    it('regresión: una petición sin Bearer responde 401', async () => {
      // Arrange
      const encabezado = 'Basic abc'

      // Act
      const resultado = await acceso(encabezado)

      // Assert
      expect(resultado.statusCode, 'código').to.equal(401)
      expect(resultado.body, 'cuerpo').to.include({ code: 'NO_TOKEN' })
    })
  })

  describe('RQ14 — Auto-inscripción por QR', () => {
    it('regresión: el estudiante queda inscrito en el grupo del QR', async () => {
      // Arrange: datos locales y controlados para mantener la independencia.
      prepararInscripcion()
      academicRepository.findInscripcion.mockResolvedValueOnce(null)

      // Act: una sola operación principal.
      const resultado = await autoEnrollPorQr('qr-grupo-11', estudianteUser)

      // Assert: la prueba se valida automáticamente.
      expect(resultado.status, 'código').to.equal(201)
      expect(resultado.body, 'cuerpo').to.deep.equal({
        enrolled: true,
        created: true,
        estudianteId: 'est-1',
        grupoId: 11,
      })
    })

    it('regresión: escanear otra vez no duplica la inscripción', async () => {
      // Arrange
      prepararInscripcion()
      academicRepository.findInscripcion.mockResolvedValueOnce(null)
      await autoEnrollPorQr('qr-grupo-11', estudianteUser)
      academicRepository.findInscripcion.mockResolvedValueOnce({ id: 100, activa: true })

      // Act
      const resultado = await autoEnrollPorQr('qr-grupo-11', estudianteUser)

      // Assert: aserciones expresivas sobre una colección.
      expect(academicRepository.insertInscripcion.mock.calls, 'inserciones').to.have.lengthOf(1)
      expect(academicRepository.insertInscripcion.mock.calls, 'única alta').to.deep.equal([['est-1', 11]])
      expect(resultado.body, 'cuerpo').to.include({ enrolled: false, alreadyEnrolled: true })
    })

    it('regresión: una inscripción inactiva se reactiva', async () => {
      // Arrange
      prepararInscripcion()
      academicRepository.findInscripcion.mockResolvedValueOnce({ id: 100, activa: false })

      // Act
      const resultado = await autoEnrollPorQr('qr-grupo-11', estudianteUser)

      // Assert
      expect(resultado.status, 'código').to.equal(200)
      expect(resultado.body, 'cuerpo').to.include({ enrolled: true, reactivated: true })
      expect(academicRepository.reactivateInscripcion.mock.calls, 'reactivaciones').to.deep.equal([[100]])
    })

    it.each(['estudiante', 'Estudiante'])('regresión: el rol %s queda inscrito', async (tipo) => {
      // Arrange
      prepararInscripcion()
      academicRepository.findInscripcion.mockResolvedValueOnce(null)
      const usuario = { id: 'user-estudiante', tipo_usuario: tipo, roles: [tipo] }

      // Act
      const resultado = await autoEnrollPorQr('qr-grupo-11', usuario)

      // Assert
      expect(resultado.status, 'código').to.equal(201)
      expect(resultado.body, 'cuerpo').to.include({ created: true, grupoId: 11 })
    })

    it('regresión: un profesor no se matricula', async () => {
      // Arrange
      prepararInscripcion()

      // Act y Assert
      const error = await rechazoDe(() => autoEnrollPorQr('qr-grupo-11', profesorUser))
      expect(error, 'profesor')
        .to.be.instanceOf(AppError)
        .and.include({ status: 403, message: 'Solo los estudiantes pueden matricularse por QR.' })
    })

    it('regresión: un QR apagado es rechazado', async () => {
      // Arrange
      prepararInscripcion()
      qrRepository.findActivoGrupoByToken.mockResolvedValueOnce(null)

      // Act y Assert
      const error = await rechazoDe(() => autoEnrollPorQr('qr-apagado', estudianteUser))
      expect(error, 'QR apagado')
        .to.be.instanceOf(AppError)
        .and.include({ status: 404, message: 'QR inválido o expirado.' })
    })

    it('regresión: una petición sin token es rechazada', async () => {
      // Arrange
      prepararInscripcion()

      // Act y Assert
      const error = await rechazoDe(() => autoEnrollPorQr('', estudianteUser))
      expect(error, 'sin token')
        .to.be.instanceOf(AppError)
        .and.include({ status: 400, message: 'Token requerido.' })
    })
  })

  describe('RQ15 — Generación masiva de QR', () => {
    it('regresión: el admin genera un QR activo para el grupo con profesor', async () => {
      // Arrange: datos locales y controlados para mantener la independencia.
      prepararLote()
      mockGrupos([GRUPO_CON_PROFESOR])

      // Act: una sola operación principal.
      const resultado = await generarQrsBatch(adminUser, ['1'], 2026)

      // Assert: la prueba se valida automáticamente.
      expect(resultado.skipped, 'omitidos').to.be.empty
      expect(resultado.created, 'creados').to.have.lengthOf(1)
      expect(resultado.created[0].token, 'token').to.match(/^[0-9a-f-]{36}$/)
      expect(qrRepository.insert.mock.calls[0][0], 'fila').to.include({
        grupo_id: 1,
        profesor_id: 'p1',
        curso_id: 10,
        activo: true,
        periodo_id: 2026,
      })
    })

    it('regresión: volver a generar reusa el mismo token', async () => {
      // Arrange
      prepararLote()
      mockGrupos([GRUPO_CON_PROFESOR])
      const primero = await generarQrsBatch(adminUser, [1], 2026)
      mockGrupos([GRUPO_CON_PROFESOR])
      qrRepository.listActivosByGrupoIds.mockResolvedValueOnce([
        { grupo_id: 1, token: primero.created[0].token, profesor_id: 'p1' },
      ])

      // Act
      const resultado = await generarQrsBatch(adminUser, [1], 2026)

      // Assert: aserciones expresivas sobre una colección.
      expect(resultado.created, 'mismos QR').to.have.lengthOf(1)
      expect(resultado.created, 'token reusado').to.deep.equal(primero.created)
    })

    it('regresión: el coordinador no genera QR de otra carrera', async () => {
      // Arrange
      prepararLote()
      mockGrupos([GRUPO_CON_PROFESOR])
      RoleService.obtenerCoordinadorPorUsuario.mockResolvedValueOnce({ carrera_id: 5 })
      academicRepository.listCursosActivosInCareer.mockResolvedValueOnce([{ id: 99 }])

      // Act
      const resultado = await generarQrsBatch(coordinadorUser, [1], 2026)

      // Assert
      expect(resultado.created, 'creados').to.be.empty
      expect(resultado.skipped, 'omitidos').to.deep.equal([
        { grupoId: 1, reason: 'El grupo no pertenece a tu carrera.' },
      ])
    })

    it('regresión: un coordinador sin carrera es rechazado', async () => {
      // Arrange
      prepararLote()
      RoleService.obtenerCoordinadorPorUsuario.mockResolvedValueOnce(null)

      // Act y Assert
      const error = await rechazoDe(() => generarQrsBatch(coordinadorUser, [1], 2026))
      expect(error, 'sin carrera')
        .to.be.instanceOf(AppError)
        .and.include({ status: 403, message: 'Coordinador sin carrera asignada o no encontrado.' })
    })

    it('regresión: un grupo sin profesor se omite', async () => {
      // Arrange
      prepararLote()
      mockGrupos([{ id: 5, curso_id: 3, profesor_id: null }])

      // Act
      const resultado = await generarQrsBatch(adminUser, [5], null)

      // Assert
      expect(resultado.created, 'creados').to.be.empty
      expect(resultado.skipped[0].reason, 'motivo').to.include('profesor_id')
    })

    it('regresión: un periodo no numérico no se guarda', async () => {
      // Arrange
      prepararLote()
      mockGrupos([GRUPO_CON_PROFESOR])

      // Act
      await generarQrsBatch(adminUser, [1], 'abc')

      // Assert
      expect(qrRepository.insert.mock.calls[0][0], 'fila')
        .to.include({ grupo_id: 1, activo: true })
        .and.not.have.property('periodo_id')
    })

    it.each([
      { caso: 'vacío', grupoIds: [] as unknown[], mensaje: 'Se requiere grupoIds (array de IDs de grupo).' },
      { caso: 'no numérico', grupoIds: ['x'], mensaje: 'grupoIds debe contener números válidos.' },
    ])('regresión: grupoIds $caso es rechazado', async ({ grupoIds, mensaje }) => {
      // Arrange
      prepararLote()

      // Act y Assert
      const error = await rechazoDe(() => generarQrsBatch(adminUser, grupoIds, null))
      expect(error, 'grupoIds')
        .to.be.instanceOf(AppError)
        .and.include({ status: 400, message: mensaje })
    })
  })

  describe('RQ16 — Distribución de QR por correo', () => {
    afterEach(() => {
      for (const [clave, valor] of Object.entries(envPrevio)) {
        if (valor === undefined) delete process.env[clave]
        else process.env[clave] = valor
      }
    })

    it('regresión: el admin envía el correo con el enlace del QR', async () => {
      // Arrange: datos locales y controlados para mantener la independencia.
      prepararCorreo()

      // Act: una sola operación principal.
      const resultado = await compartirQrsPorEmail(adminUser, CUERPO_CORREO)
      const correo = sendMail.mock.calls[0][0]

      // Assert: la prueba se valida automáticamente.
      expect(resultado, 'envío').to.deep.equal({ email: 'a@b.com', totalLinks: 1 })
      expect(correo, 'destinatario').to.include({ to: 'a@b.com', subject: 'QR grupos' })
      expect(correo.text, 'cuerpo')
        .to.match(/^Links/)
        .and.include('http://localhost:5173/qr-evaluacion?token=tok-1')
        .and.not.include('undefined')
    })

    it('regresión: los grupos repetidos se consultan una sola vez', async () => {
      // Arrange
      prepararCorreo()

      // Act
      await compartirQrsPorEmail(adminUser, CUERPO_CORREO)

      // Assert: aserciones expresivas sobre una colección.
      expect(qrRepository.listActivosParaShare.mock.calls, 'consultas').to.have.lengthOf(1)
      expect(qrRepository.listActivosParaShare.mock.calls[0][0], 'grupos').to.deep.equal([3])
    })

    it('regresión: el coordinador de la misma carrera sí envía', async () => {
      // Arrange
      prepararCorreo()
      RoleService.obtenerCoordinadorPorUsuario.mockResolvedValueOnce({ carrera_id: 1 })

      // Act
      const resultado = await compartirQrsPorEmail(coordinadorUser, CUERPO_CORREO)

      // Assert
      expect(resultado, 'envío').to.deep.equal({ email: 'a@b.com', totalLinks: 1 })
    })

    it('regresión: el coordinador de otra carrera es rechazado', async () => {
      // Arrange
      prepararCorreo()
      RoleService.obtenerCoordinadorPorUsuario.mockResolvedValueOnce({ carrera_id: 9 })

      // Act y Assert
      const error = await rechazoDe(() => compartirQrsPorEmail(coordinadorUser, CUERPO_CORREO))
      expect(error, 'otra carrera')
        .to.be.instanceOf(AppError)
        .and.include({ status: 403, message: 'Los grupos seleccionados no pertenecen a tu carrera.' })
    })

    it('regresión: un correo inválido es rechazado', async () => {
      // Arrange
      prepararCorreo()
      const cuerpo = { ...CUERPO_CORREO, to: 'no-es-correo' }

      // Act y Assert
      const error = await rechazoDe(() => compartirQrsPorEmail(adminUser, cuerpo))
      expect(error, 'correo')
        .to.be.instanceOf(AppError)
        .and.include({ status: 400, message: 'Correo de destino inválido.' })
    })

    it('regresión: un asunto vacío es rechazado', async () => {
      // Arrange
      prepararCorreo()
      const cuerpo = { ...CUERPO_CORREO, subject: '   ' }

      // Act y Assert
      const error = await rechazoDe(() => compartirQrsPorEmail(adminUser, cuerpo))
      expect(error, 'asunto')
        .to.be.instanceOf(AppError)
        .and.include({ status: 400, message: 'El asunto es requerido.' })
    })

    it('regresión: sin QRs activos responde 404', async () => {
      // Arrange
      prepararCorreo()
      qrRepository.listActivosParaShare.mockResolvedValueOnce([])

      // Act y Assert
      const error = await rechazoDe(() => compartirQrsPorEmail(adminUser, CUERPO_CORREO))
      expect(error, 'sin QR')
        .to.be.instanceOf(AppError)
        .and.include({ status: 404, message: 'No hay QRs activos para los grupos seleccionados.' })
    })

    it('regresión: sin SMTP responde 503', async () => {
      // Arrange
      prepararCorreo()
      delete process.env.SMTP_HOST

      // Act y Assert
      const error = await rechazoDe(() => compartirQrsPorEmail(adminUser, CUERPO_CORREO))
      expect(error, 'SMTP').to.be.instanceOf(AppError).and.include({ status: 503 })
    })
  })

  describe('RQ17 — Resolución de token QR', () => {
    it('regresión: un token activo devuelve profesor, curso y grupo', () => {
      // Arrange: datos locales y controlados para mantener la independencia.
      const token = 'tok-1'

      // Act: una sola operación principal.
      const resultado = resolverEvaluacionQr({ token, qr: QR_VIGENTE })

      // Assert: la prueba se valida automáticamente.
      expect(resultado, 'resolución').to.deep.equal({
        ok: true,
        status: 200,
        data: { profesorId: 'p1', cursoId: 10, grupoId: 3 },
      })
    })

    it('regresión: una fila sin el campo activo sigue vigente', () => {
      // Arrange
      const qr = { profesor_id: 'p1', curso_id: 10, grupo_id: 3 }

      // Act
      const resultado = resolverEvaluacionQr({ token: 'tok-1', qr })

      // Assert
      expect(resultado, 'resolución').to.include({ ok: true, status: 200 })
    })

    it.each([
      { caso: 'apagado', qr: { ...QR_VIGENTE, activo: false } },
      { caso: 'inexistente', qr: null },
    ])('regresión: un QR $caso deja de servir', ({ qr }) => {
      // Arrange
      const token = 'tok-1'

      // Act
      const resultado = resolverEvaluacionQr({ token, qr })

      // Assert
      expect(resultado, 'resolución').to.deep.equal({
        ok: false,
        status: 404,
        error: 'QR inválido o expirado.',
      })
    })

    it('regresión: un fallo de base responde 500', () => {
      // Arrange
      const token = 'tok-1'

      // Act
      const resultado = resolverEvaluacionQr({ token, errorBd: true, qr: QR_VIGENTE })

      // Assert
      expect(resultado, 'resolución').to.deep.equal({
        ok: false,
        status: 500,
        error: 'Error al resolver el token.',
      })
    })

    it('regresión: una petición sin token responde 400', () => {
      // Arrange
      const token = ''

      // Act
      const resultado = resolverEvaluacionQr({ token, qr: QR_VIGENTE })

      // Assert
      expect(resultado, 'resolución').to.include({ ok: false, status: 400, error: 'Token requerido.' })
    })

    it('regresión: la vista trae los datos del formulario', () => {
      // Arrange
      const fila = {
        profesor_id: 'p1',
        curso_id: 10,
        grupo_id: 3,
        periodo_id: 2026,
        profesor: { usuario: { nombre: 'Ana', apellido: 'Pérez' } },
        curso: { nombre: 'Álgebra', codigo: 'MAT-101' },
        grupo: { numero_grupo: 'A', horario: 'Lun 8-10', aula: '101' },
      }

      // Act
      const resultado = mapearRespuestaQr(fila)

      // Assert
      expect(resultado, 'vista').to.include({
        profesorNombre: 'Ana Pérez',
        cursoNombre: 'Álgebra',
        grupoNumero: 'A',
      })
    })

    it('regresión: las relaciones en arreglo arman la misma vista', () => {
      // Arrange
      const fila = {
        profesor_id: 'p1',
        curso_id: 10,
        grupo_id: 3,
        profesor: { usuario: { nombre: 'Ana', apellido: 'Pérez' } },
        curso: { nombre: 'Álgebra', codigo: 'MAT-101' },
        grupo: { numero_grupo: 'A', horario: 'Lun 8-10', aula: '101' },
      }
      const enArreglo = {
        ...fila,
        profesor: [{ usuario: [fila.profesor.usuario] }],
        curso: [fila.curso],
        grupo: [fila.grupo],
      }

      // Act
      const resultado = mapearRespuestaQr(enArreglo)

      // Assert
      expect(resultado, 'vista').to.deep.equal(mapearRespuestaQr(fila))
    })
  })

  describe('RQ27 — Relación estudiante–materia', () => {
    it('regresión: el estudiante ve su materia con curso, profesor y periodo', () => {
      // Arrange: datos locales y controlados para mantener la independencia.
      const inscripciones = [INSCRIPCION]

      // Act: una sola operación principal.
      const resultado = decidirRelacionEstudianteMateria({
        autenticado: true,
        tipoUsuario: 'estudiante',
        perfilEstudiante: true,
        inscripciones,
      })

      // Assert: la prueba se valida automáticamente.
      expect(resultado.status, 'código').to.equal(200)
      expect(resultado.data?.materiasMatriculadas[0], 'materia').to.deep.equal(MATERIA_ESPERADA)
    })

    it('regresión: la inscripción sin curso no aparece', () => {
      // Arrange
      const inscripciones = [INSCRIPCION, { id: 99, grupo: { numero_grupo: 2 } }]

      // Act
      const resultado = decidirRelacionEstudianteMateria({
        autenticado: true,
        tipoUsuario: 'estudiante',
        perfilEstudiante: true,
        inscripciones,
      })
      const ids = resultado.data?.materiasMatriculadas.map((materia) => materia.id)

      // Assert: aserciones expresivas sobre una colección.
      expect(ids, 'materias').to.have.lengthOf(1)
      expect(ids, 'ids').to.deep.equal([11])
    })

    it('regresión: las relaciones en arreglo muestran la misma materia', () => {
      // Arrange
      const enArreglo = {
        ...INSCRIPCION,
        grupo: {
          ...INSCRIPCION.grupo,
          curso: [INSCRIPCION.grupo.curso],
          asignaciones_profesor: [INSCRIPCION.grupo.asignaciones_profesor],
          periodo: [INSCRIPCION.grupo.periodo],
        },
      }

      // Act
      const resultado = decidirRelacionEstudianteMateria({
        autenticado: true,
        tipoUsuario: 'estudiante',
        perfilEstudiante: true,
        inscripciones: [enArreglo],
      })

      // Assert
      expect(resultado.data?.materiasMatriculadas, 'materias').to.deep.equal([MATERIA_ESPERADA])
    })

    it.each(['estudiante', 'Estudiante'])('regresión: el tipo %s ve la misma materia', (tipo) => {
      // Arrange
      const inscripciones = [INSCRIPCION]

      // Act
      const resultado = decidirRelacionEstudianteMateria({
        autenticado: true,
        tipoUsuario: tipo,
        perfilEstudiante: true,
        inscripciones,
      })

      // Assert
      expect(resultado.data?.total, 'total').to.equal(1)
      expect(resultado.data?.materiasMatriculadas, 'materias').to.deep.equal([MATERIA_ESPERADA])
    })

    it('regresión: un profesor no consulta las materias', () => {
      // Arrange
      const inscripciones = [INSCRIPCION]

      // Act
      const resultado = decidirRelacionEstudianteMateria({
        autenticado: true,
        tipoUsuario: 'profesor',
        perfilEstudiante: true,
        inscripciones,
      })

      // Assert
      expect(resultado.status, 'código').to.equal(403)
      expect(resultado, 'cuerpo').to.include({
        ok: false,
        error: 'Solo los estudiantes pueden acceder a esta información',
      })
    })

    it('regresión: sin sesión responde 401', () => {
      // Arrange
      const inscripciones = [INSCRIPCION]

      // Act
      const resultado = decidirRelacionEstudianteMateria({
        autenticado: false,
        tipoUsuario: 'estudiante',
        perfilEstudiante: true,
        inscripciones,
      })

      // Assert
      expect(resultado.status, 'código').to.equal(401)
      expect(resultado, 'cuerpo').to.include({ ok: false, error: 'Token de acceso requerido' })
    })

    it('regresión: un fallo de consulta devuelve la lista vacía', () => {
      // Arrange
      const inscripciones = [INSCRIPCION]

      // Act
      const resultado = decidirRelacionEstudianteMateria({
        autenticado: true,
        tipoUsuario: 'estudiante',
        perfilEstudiante: true,
        errorConsulta: true,
        inscripciones,
      })

      // Assert: aserciones expresivas sobre una colección.
      expect(resultado.status, 'código').to.equal(200)
      expect(resultado.data?.materiasMatriculadas, 'materias').to.have.lengthOf(0)
      expect(resultado.data?.materiasMatriculadas, 'lista').to.deep.equal([])
    })
  })
})
