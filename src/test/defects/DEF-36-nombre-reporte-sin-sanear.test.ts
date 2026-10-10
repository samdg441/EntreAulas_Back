/**
 * DEF-36 — El nombre del archivo del reporte usa el periodo sin sanear (RQ25)
 *
 * Severidad: Baja (latente) | Estado: ABIERTO
 *
 * `nombreArchivoReporte` concatena el `period` recibido. Hoy ninguna ruta lo usa en un
 * `Content-Disposition`, pero el día que se use, `../` o un salto de línea permiten
 * nombres con ruta o inyección de cabeceras. Debe aceptar solo `AAAA-S` o caer a `todo`.
 */
import { describe, expect, it } from 'vitest'
import { nombreArchivoReporte } from '../../modules/analytics/reporte-exportacion'

const NOMBRE_SEGURO = /^reporte-coordinador-(\d{4}-[12]|todo)\.xlsx$/

describe('DEF-36 — Nombre de archivo del reporte', () => {
  it.each(['../../etc/passwd', '2026-1\r\nSet-Cookie: x=1', '2026-1"; filename="otro.exe', '2026-9'])(
    'period=%j produce un nombre seguro',
    (period) => {
      expect(nombreArchivoReporte(period)).toMatch(NOMBRE_SEGURO)
    }
  )

  it('un periodo válido se conserva', () => {
    expect(nombreArchivoReporte('2026-1')).toBe('reporte-coordinador-2026-1.xlsx')
  })
})
