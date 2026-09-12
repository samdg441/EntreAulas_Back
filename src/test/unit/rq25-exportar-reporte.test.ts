import { describe, expect, it } from 'vitest'
import {
  armarFilasReporte,
  decidirExportacionReporte,
  MIME_EXCEL,
  nombreArchivoReporte,
  puedeExportarReporte,
} from '../../modules/analytics/reporte-exportacion'
import { estudianteUser, profesorUser, adminUser, coordinadorUser } from '../fixtures/users'

class RFREP25ExportarReporte {
  C1_noAutorizado() {
    expect(puedeExportarReporte(undefined)).toBe(false)
    expect(puedeExportarReporte(estudianteUser)).toBe(false)
    const r = decidirExportacionReporte({ user: estudianteUser, filas: [{ DOCENTE: 'Ana' }] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('No autorizado para exportar reportes.')
  }

  C2_autorizado() {
    expect(puedeExportarReporte(coordinadorUser)).toBe(true)
    expect(puedeExportarReporte(adminUser)).toBe(true)
    expect(puedeExportarReporte(profesorUser)).toBe(true)
    expect(puedeExportarReporte({ tipo_usuario: 'decano' })).toBe(true)
  }

  C3_generaArchivoConInformacion() {
    const rowAgg = new Map([
      [
        '7::21',
        {
          profesorId: '7',
          cursoNombre: 'Cálculo',
          grupo: '1',
          estudiantes: 30,
          evaluadoresSet: new Set(['e1', 'e2']),
          sumPromedio: 8.4,
          countPromedio: 2,
        },
      ],
    ])
    const catAgg = new Map([
      [
        '7::21',
        new Map([
          ['c1', { sum: 9, count: 2 }],
          ['c2', { sum: 0, count: 0 }],
        ]),
      ],
    ])
    const filas = armarFilasReporte(
      rowAgg,
      catAgg,
      new Map([
        ['c1', 'Saber especifico'],
        ['c2', 'Metodologia'],
      ]),
      new Map([['7', 'Ana Pérez']])
    )

    expect(filas).toHaveLength(1)
    expect(filas[0]).toMatchObject({
      DOCENTE: 'Ana Pérez',
      ASIGNATURA: 'Cálculo',
      GRUPO: '1',
      ESTUDIANTES: 30,
      ESTUDIANTES_EVALUADORES: 2,
      SABER_ESPECIFICO: 4.5,
      METODOLOGIA: null,
      PROMEDIO: 4.2,
    })

    const r = decidirExportacionReporte({
      user: coordinadorUser,
      filas,
      period: '2026-1',
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.descargable).toBe(true)
      expect(r.mimeType).toBe(MIME_EXCEL)
      expect(r.filename).toBe('reporte-coordinador-2026-1.xlsx')
      expect(r.filas).toEqual(filas)
    }
  }

  C4_sinFilasSigueSiendoDescargable() {
    const r = decidirExportacionReporte({
      user: coordinadorUser,
      filas: [],
      period: '2026-2',
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.filas).toEqual([])
      expect(r.filename).toBe(nombreArchivoReporte('2026-2'))
    }
  }

  C5_ordenaYUsaFallbackDocente() {
    const rowAgg = new Map([
      [
        '2::2',
        {
          profesorId: '2',
          cursoNombre: 'Física',
          grupo: '2',
          estudiantes: 10,
          evaluadoresSet: new Set<string>(),
          sumPromedio: 0,
          countPromedio: 0,
        },
      ],
      [
        '1::1',
        {
          profesorId: '1',
          cursoNombre: 'Álgebra',
          grupo: '1',
          estudiantes: 12,
          evaluadoresSet: new Set(['e1']),
          sumPromedio: 5,
          countPromedio: 1,
        },
      ],
    ])
    const filas = armarFilasReporte(rowAgg, new Map(), new Map(), new Map([['1', 'Zoe Z']]))
    expect(filas.map((f) => f.DOCENTE)).toEqual(['Docente 2', 'Zoe Z'])
    expect(filas[0].PROMEDIO).toBeNull()
    expect(filas[1].PROMEDIO).toBe(5)
  }
}

const pruebas = new RFREP25ExportarReporte()

describe('RF-REP-25 — Exportación de reportes', () => {
  it('C1: usuario no autorizado no exporta', () => pruebas.C1_noAutorizado())
  it('C2: coordinador, decano, admin y profesor sí pueden', () => pruebas.C2_autorizado())
  it('C3: autorizado + datos → archivo xlsx con la información', () => pruebas.C3_generaArchivoConInformacion())
  it('C4: sin filas igual genera descarga', () => pruebas.C4_sinFilasSigueSiendoDescargable())
  it('C5: ordena filas y nombra docente si falta el usuario', () => pruebas.C5_ordenaYUsaFallbackDocente())
})
