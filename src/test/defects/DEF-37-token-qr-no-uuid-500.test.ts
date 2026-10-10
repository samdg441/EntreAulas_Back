/**
 * DEF-37 — Un token de QR que no es UUID responde 500 en vez de 404 (RQ18)
 *
 * Severidad: Media | Estado: ABIERTO | Encontrado con Cypress contra Render
 *
 * En producción, GET /api/qr-evaluaciones/token-que-no-existe → 500 "Error al resolver el
 * token.", mientras que un UUID inexistente → 404 "QR inválido o expirado.". La columna
 * `token` es uuid: PostgreSQL rechaza el texto (22P02) y el error sube como 500.
 * Las pruebas con la base simulada no lo veían porque el doble no conoce los tipos.
 * Un QR mal escaneado o una URL truncada muestran "error del servidor" al estudiante.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { supabaseModuleMock } from '../helpers/supabase-mock'

vi.mock('../../config/supabase-only', () => supabaseModuleMock)
vi.mock('../../config/supabaseClient', () => supabaseModuleMock)

import { app } from '../../app'
import { qrRepository } from '../../modules/evaluations/qr.repository'

describe('DEF-37 — Token con formato inválido', () => {
  afterEach(() => vi.restoreAllMocks())

  it.each(['token-que-no-existe', 'abc', '63', "' OR 1=1 --"])('GET /api/qr-evaluaciones/%s → 404 sin consultar la base', async (token) => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const consulta = vi
      .spyOn(qrRepository, 'findActivoByToken')
      .mockRejectedValue(Object.assign(new Error('invalid input syntax for type uuid'), { code: '22P02' }))

    const res = await request(app).get(`/api/qr-evaluaciones/${encodeURIComponent(token)}`)

    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'QR inválido o expirado.' })
    expect(consulta).not.toHaveBeenCalled()
  })
})
