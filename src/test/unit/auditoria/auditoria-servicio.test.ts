/**
 * Servicio de auditoría con test doubles (TDD).
 *
 *  - Fake: base en memoria (`fakeDb`) para insertar y listar eventos.
 *  - Stub: `RoleService.obtenerCoordinadorPorUsuario` devuelve la carrera del coordinador.
 *  - Spy: `logger.error` confirma que un fallo de escritura se registra sin romper la petición.
 *  - Mock: el servicio de auditoría de las rutas se verifica en `api/auditoria.api.test.ts`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as fake from '../../helpers/fake-supabase'

vi.mock('../../../config/supabase-only', () => fake)
vi.mock('../../../config/supabaseClient', () => fake)

import { auditoriaService } from '../../../modules/analytics/auditoria.service'
import { RoleService } from '../../../modules/auth/role.service'
import { logger } from '../../../shared/logger'

const TABLA = 'auditoria_eventos'

describe('auditoriaService', () => {
  beforeEach(() => {
    fake.fakeDb.reset()
    vi.spyOn(RoleService, 'obtenerCoordinadorPorUsuario').mockResolvedValue({ carrera_id: 1 } as never)
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('registrar', () => {
    it('guarda el evento con actor, acción, carrera y fecha', async () => {
      // Arrange
      const evento = {
        actorId: 'u-1',
        actorNombre: 'David Coordinador',
        actorRol: 'coordinador',
        accion: 'programar_encuesta' as const,
        entidad: 'periodo',
        entidadId: '2026-2',
        carreraId: 1,
        detalle: 'Del 2026-11-01 al 2026-11-15',
      }

      // Act
      await auditoriaService.registrar(evento)

      // Assert
      const [fila] = fake.fakeDb.filas(TABLA)
      expect(fila).toMatchObject({
        actor_id: 'u-1',
        actor_nombre: 'David Coordinador',
        accion: 'programar_encuesta',
        carrera_id: 1,
        entidad_id: '2026-2',
      })
      expect(typeof fila.creado_en).toBe('string')
    })

    it('un fallo de la base no rompe la operación auditada y queda en el log', async () => {
      const espia = vi.spyOn(logger, 'error').mockImplementation(() => {})
      fake.fakeDb.fail(TABLA, { message: 'caída de red' })

      const intento = auditoriaService.registrar({
        actorId: 'u-1',
        actorNombre: 'X',
        actorRol: 'coordinador',
        accion: 'generar_qr',
        entidad: 'qr',
        carreraId: 1,
      })

      await expect(intento).resolves.toBeUndefined()
      expect(espia).toHaveBeenCalledOnce()
    })

    it('recorta un detalle de más de 300 caracteres', async () => {
      await auditoriaService.registrar({
        actorId: 'u-1',
        actorNombre: 'X',
        actorRol: 'coordinador',
        accion: 'generar_qr',
        entidad: 'qr',
        carreraId: 1,
        detalle: 'x'.repeat(500),
      })

      expect(String(fake.fakeDb.filas(TABLA)[0].detalle)).toHaveLength(300)
    })
  })

  describe('listar', () => {
    const fila = (id: number, carrera: number, accion = 'consultar_reportes') => ({
      id,
      actor_id: 'u-1',
      actor_nombre: 'David',
      actor_rol: 'coordinador',
      accion,
      entidad: 'reporte',
      entidad_id: null,
      carrera_id: carrera,
      detalle: '',
      creado_en: `2026-10-0${id}T10:00:00.000Z`,
    })

    it('solo devuelve los eventos de la carrera del coordinador', async () => {
      fake.fakeDb.seed(TABLA, [fila(1, 1), fila(2, 2), fila(3, 1)])

      const vista = await auditoriaService.listar('u-1', {})

      expect(vista.disponible).toBe(true)
      expect(vista.eventos.map((e) => e.id).sort()).toEqual([1, 3])
      expect(vista.resumen.total).toBe(2)
    })

    it('aplica el filtro de acción', async () => {
      fake.fakeDb.seed(TABLA, [fila(1, 1, 'generar_qr'), fila(2, 1, 'consultar_docente')])

      const vista = await auditoriaService.listar('u-1', { accion: 'generar_qr' })

      expect(vista.eventos.map((e) => e.id)).toEqual([1])
    })

    it('si la tabla no existe (42P01) responde vacío y avisa que falta la migración', async () => {
      fake.fakeDb.fail(TABLA, { message: 'relation does not exist', code: '42P01' })

      const vista = await auditoriaService.listar('u-1', {})

      expect(vista.disponible).toBe(false)
      expect(vista.eventos).toEqual([])
      expect(vista.aviso).toMatch(/auditoria/i)
    })

    it('un error distinto de tabla inexistente se propaga como 500', async () => {
      fake.fakeDb.fail(TABLA, { message: 'boom', code: 'XX000' })

      await expect(auditoriaService.listar('u-1', {})).rejects.toMatchObject({ status: 500 })
    })

    it('un coordinador sin carrera asignada recibe 400', async () => {
      vi.spyOn(RoleService, 'obtenerCoordinadorPorUsuario').mockResolvedValue(null as never)

      await expect(auditoriaService.listar('u-1', {})).rejects.toMatchObject({ status: 400 })
    })
  })
})

describe('auditoriaService.registrarComoUsuario (Stub de usuario y carrera)', () => {
  beforeEach(() => {
    fake.fakeDb.reset()
    vi.spyOn(RoleService, 'obtenerCoordinadorPorUsuario').mockResolvedValue({ carrera_id: 4 } as never)
  })
  afterEach(() => vi.restoreAllMocks())

  it('resuelve nombre y carrera del usuario y guarda el evento', async () => {
    fake.fakeDb.seed('usuarios', [{ id: 'u-9', nombre: 'Laura', apellido: 'Ríos', activo: true }])

    await auditoriaService.registrarComoUsuario(
      { id: 'u-9', roles: ['coordinador'], tipo_usuario: 'coordinador' },
      { accion: 'consultar_docente', entidad: 'profesor', entidadId: '12', detalle: 'Docente 12' }
    )

    expect(fake.fakeDb.filas(TABLA)[0]).toMatchObject({
      actor_nombre: 'Laura Ríos',
      actor_rol: 'coordinador',
      carrera_id: 4,
      entidad_id: '12',
    })
  })

  it('sin usuario autenticado no escribe nada', async () => {
    await auditoriaService.registrarComoUsuario(undefined, { accion: 'generar_qr', entidad: 'qr' })

    expect(fake.fakeDb.filas(TABLA)).toHaveLength(0)
  })
})
