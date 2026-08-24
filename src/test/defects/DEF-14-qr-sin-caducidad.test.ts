/**
 * DEF-14 — El QR nunca caduca (RQ18, unitaria)
 *
 * Severidad: Alta | Estado: ABIERTO
 *
 * RQ18 se llama "Validar QR vencido o inválido", pero en el producto no
 * existe el concepto de vencimiento: `GET /qr-evaluaciones/:token` solo
 * filtra por `.eq('activo', true)`. No hay ninguna comparación de fechas
 * en todo el módulo.
 *
 * Las pantallas de generación (AdminQrPage, ScheduleSurveys) obligan al
 * coordinador a escribir fecha de inicio y fecha de cierre, pero esa
 * ventana se descarta antes de salir del navegador.
 *
 * Consecuencia: un QR impreso sigue aceptando evaluaciones indefinidamente,
 * incluso semestres después, salvo que alguien desactive la fila a mano.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { createQueryBuilder } from '../helpers/query-builder'
import { fromMock, supabaseModuleMock } from '../helpers/supabase-mock'
import qrFixture from '../fixtures/rq18-qr.json'

vi.mock('../../config/supabase-only', () => supabaseModuleMock)
vi.mock('../../config/supabaseClient', () => supabaseModuleMock)

import { app } from '../../app'

describe('DEF-14 — Un QR debe dejar de servir al pasar su fecha de cierre', () => {
  let builder: Record<string, any>

  beforeEach(async () => {
    fromMock.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})

    builder = createQueryBuilder({ data: qrFixture.tokenValido, error: null })
    fromMock.mockImplementation(() => builder)

    await request(app).get('/api/qr-evaluaciones/token-del-semestre-pasado')
  })

  it('la consulta debe leer la fecha de vigencia del QR', () => {
    const proyeccion = String(builder.select.mock.calls[0]?.[0] ?? '')
    expect(proyeccion).toMatch(/fecha|expira|vigencia/i)
  })

  it('la consulta debe acotar el QR por fecha, no solo por el campo activo', () => {
    expect(builder.lte).toHaveBeenCalled()
  })
})
