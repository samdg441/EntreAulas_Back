/**
 * DEF-32 — El batch de QR acepta IDs de grupo negativos, cero y decimales (RQ18)
 *
 * Severidad: Baja | Estado: ABIERTO
 *
 * `parseGrupoIds` (qr-batch.ts, el que usa la ruta) solo filtra `Number.isFinite`.
 * `parsearGrupoIds` (helpers/qr.ts) sí exige enteros positivos, pero ninguna ruta lo usa:
 * las pruebas unitarias de RQ18 validan una copia de la regla, no la de producción.
 */
import { describe, expect, it } from 'vitest'
import { parseGrupoIds } from '../../modules/evaluations/qr-batch'

describe('DEF-32 — grupoIds debe exigir enteros positivos', () => {
  it.each([[[-1]], [[0]], [[1.5]], [['-7']]])('%j se rechaza con 400', (grupoIds) => {
    expect(() => parseGrupoIds(grupoIds)).toThrow(/grupoIds/)
  })

  it('una mezcla válida/inválida conserva solo los válidos', () => {
    expect(parseGrupoIds([63, -1, 0, 2.5, 64])).toEqual([63, 64])
  })
})
