/**
 * Vista de auditoría del coordinador — lógica pura (TDD, fase ROJO → VERDE).
 *
 * Patrón AAA en cada caso, aserciones fluidas (`expect(...).to...` estilo chai vía vitest) y sin dobles:
 * las funciones bajo prueba no tocan la base.
 *
 * Técnicas de caja negra: partición de equivalencia y valores límite en la paginación,
 * en las fechas y en las acciones. Caja blanca: cada rama de `parsearFiltrosAuditoria` y de
 * `armarVistaAuditoria` tiene al menos un caso (ver docs/pruebas/CAJA-BLANCA-AUDITORIA.md).
 */
import { describe, expect, it } from 'vitest'
import {
  ACCIONES_AUDITORIA,
  armarVistaAuditoria,
  parsearFiltrosAuditoria,
  type EventoAuditoria,
} from '../../../modules/analytics/auditoria'
import { AppError } from '../../../shared/errors'

function evento(parcial: Partial<EventoAuditoria> & { id: number }): EventoAuditoria {
  return {
    actorId: 'u-1',
    actorNombre: 'David Coordinador',
    actorRol: 'coordinador',
    accion: 'consultar_reportes',
    entidad: 'reporte',
    entidadId: null,
    detalle: '',
    creadoEn: '2026-10-01T10:00:00.000Z',
    ...parcial,
  }
}

describe('parsearFiltrosAuditoria', () => {
  describe('paginación (partición de equivalencia y valores límite)', () => {
    it('sin parámetros usa la página 1 y 10 eventos por página', () => {
      // Arrange + Act
      const filtros = parsearFiltrosAuditoria({})

      // Assert
      expect(filtros).toMatchObject({ page: 1, pageSize: 10 })
    })

    it.each([
      ['0', 10],
      ['-5', 10],
      ['abc', 10],
      ['1', 1],
      ['50', 50],
      ['51', 50],
      ['999', 50],
    ])('pageSize=%s → %i (límites 0, 1, 50 y 51)', (entrada, esperado) => {
      const filtros = parsearFiltrosAuditoria({ pageSize: entrada })

      expect(filtros.pageSize).toBe(esperado)
    })

    it.each([
      ['0', 1],
      ['-1', 1],
      ['x', 1],
      ['2.9', 2],
      ['7', 7],
    ])('page=%s → %i', (entrada, esperado) => {
      expect(parsearFiltrosAuditoria({ page: entrada }).page).toBe(esperado)
    })
  })

  describe('acción', () => {
    it.each(ACCIONES_AUDITORIA)('acepta la acción válida %s', (accion) => {
      expect(parsearFiltrosAuditoria({ accion }).accion).toBe(accion)
    })

    it('"todas" o vacío no filtra por acción', () => {
      expect(parsearFiltrosAuditoria({ accion: 'todas' }).accion).toBeUndefined()
      expect(parsearFiltrosAuditoria({ accion: '' }).accion).toBeUndefined()
    })

    it('rechaza una acción desconocida con 400', () => {
      const intento = () => parsearFiltrosAuditoria({ accion: 'borrar_todo' })

      expect(intento).toThrow(AppError)
      expect(intento).toThrow(/acción/i)
      try {
        intento()
      } catch (e) {
        expect((e as AppError).status).toBe(400)
      }
    })
  })

  describe('fechas', () => {
    it('acepta un rango válido y lo conserva', () => {
      const filtros = parsearFiltrosAuditoria({ desde: '2026-10-01', hasta: '2026-10-31' })

      expect(filtros.desde).toBe('2026-10-01')
      expect(filtros.hasta).toBe('2026-10-31')
    })

    it('acepta un rango de un solo día (límite: desde = hasta)', () => {
      const filtros = parsearFiltrosAuditoria({ desde: '2026-10-05', hasta: '2026-10-05' })

      expect(filtros.desde).toBe(filtros.hasta)
    })

    it.each(['2026-13-01', '2026-02-30', 'ayer', '2026/10/01', '20261001'])('rechaza la fecha inválida "%s"', (valor) => {
      expect(() => parsearFiltrosAuditoria({ desde: valor })).toThrow(AppError)
    })

    it('rechaza un rango invertido (desde posterior a hasta)', () => {
      expect(() => parsearFiltrosAuditoria({ desde: '2026-11-01', hasta: '2026-10-01' })).toThrow(
        /anterior|posterior/i
      )
    })
  })

  describe('búsqueda', () => {
    it('recorta espacios y limita el texto a 80 caracteres', () => {
      const filtros = parsearFiltrosAuditoria({ search: `   ${'a'.repeat(120)}   ` })

      expect(filtros.search).toHaveLength(80)
    })

    it('un texto vacío queda como indefinido', () => {
      expect(parsearFiltrosAuditoria({ search: '   ' }).search).toBeUndefined()
    })
  })
})

describe('armarVistaAuditoria', () => {
  const base = parsearFiltrosAuditoria({})

  it('ordena del evento más reciente al más antiguo', () => {
    const eventos = [
      evento({ id: 1, creadoEn: '2026-10-01T08:00:00.000Z' }),
      evento({ id: 2, creadoEn: '2026-10-03T08:00:00.000Z' }),
      evento({ id: 3, creadoEn: '2026-10-02T08:00:00.000Z' }),
    ]

    const vista = armarVistaAuditoria(eventos, base)

    expect(vista.eventos.map((e) => e.id)).toEqual([2, 3, 1])
  })

  it('pagina y calcula el total de páginas (valor límite: 11 eventos con 10 por página → 2 páginas)', () => {
    const eventos = Array.from({ length: 11 }, (_, i) => evento({ id: i + 1 }))

    const pagina2 = armarVistaAuditoria(eventos, { ...base, page: 2 })

    expect(pagina2.pagination).toEqual({ page: 2, pageSize: 10, total: 11, totalPages: 2 })
    expect(pagina2.eventos).toHaveLength(1)
  })

  it('una página fuera de rango devuelve lista vacía sin romper', () => {
    const vista = armarVistaAuditoria([evento({ id: 1 })], { ...base, page: 9 })

    expect(vista.eventos).toEqual([])
    expect(vista.pagination.total).toBe(1)
  })

  it('sin eventos: totales en cero y último evento nulo', () => {
    const vista = armarVistaAuditoria([], base)

    expect(vista.resumen).toEqual({ total: 0, porAccion: {}, ultimoEvento: null })
    expect(vista.pagination.totalPages).toBe(0)
  })

  it('cuenta los eventos por acción sobre todo el conjunto filtrado, no solo la página', () => {
    const eventos = [
      ...Array.from({ length: 12 }, (_, i) => evento({ id: i + 1, accion: 'consultar_docente' })),
      evento({ id: 99, accion: 'programar_encuesta' }),
    ]

    const vista = armarVistaAuditoria(eventos, base)

    expect(vista.resumen.total).toBe(13)
    expect(vista.resumen.porAccion).toEqual({ consultar_docente: 12, programar_encuesta: 1 })
  })

  it('filtra por acción', () => {
    const eventos = [evento({ id: 1, accion: 'generar_qr' }), evento({ id: 2, accion: 'consultar_reportes' })]

    const vista = armarVistaAuditoria(eventos, { ...base, accion: 'generar_qr' })

    expect(vista.eventos.map((e) => e.id)).toEqual([1])
  })

  it('filtra por rango de fechas incluyendo el día final completo', () => {
    const eventos = [
      evento({ id: 1, creadoEn: '2026-09-30T23:59:59.000Z' }),
      evento({ id: 2, creadoEn: '2026-10-01T00:00:00.000Z' }),
      evento({ id: 3, creadoEn: '2026-10-31T23:59:59.000Z' }),
      evento({ id: 4, creadoEn: '2026-11-01T00:00:00.000Z' }),
    ]

    const vista = armarVistaAuditoria(eventos, { ...base, desde: '2026-10-01', hasta: '2026-10-31' })

    expect(vista.eventos.map((e) => e.id).sort()).toEqual([2, 3])
  })

  it('busca por actor o detalle sin distinguir mayúsculas ni tildes', () => {
    const eventos = [
      evento({ id: 1, actorNombre: 'María Gómez', detalle: 'Periodo 2026-2' }),
      evento({ id: 2, actorNombre: 'Pedro', detalle: 'QR de Cálculo' }),
    ]

    expect(armarVistaAuditoria(eventos, { ...base, search: 'maria' }).eventos.map((e) => e.id)).toEqual([1])
    expect(armarVistaAuditoria(eventos, { ...base, search: 'CALCULO' }).eventos.map((e) => e.id)).toEqual([2])
  })

  it('el último evento del resumen es el más reciente del conjunto filtrado', () => {
    const eventos = [
      evento({ id: 1, creadoEn: '2026-10-01T08:00:00.000Z' }),
      evento({ id: 2, creadoEn: '2026-10-09T08:00:00.000Z' }),
    ]

    expect(armarVistaAuditoria(eventos, base).resumen.ultimoEvento).toBe('2026-10-09T08:00:00.000Z')
  })

  it('no modifica el arreglo recibido (sin efectos colaterales)', () => {
    const eventos = [
      evento({ id: 1, creadoEn: '2026-10-01T08:00:00.000Z' }),
      evento({ id: 2, creadoEn: '2026-10-02T08:00:00.000Z' }),
    ]
    const copia = [...eventos]

    armarVistaAuditoria(eventos, base)

    expect(eventos).toEqual(copia)
  })
})
