/**
 * DEF-13 — El endpoint de QR no exige autenticación (RQ18, integración)
 *
 * Severidad: Media | Estado: ABIERTO
 *
 * `GET /qr-evaluaciones/:token` es la única ruta del módulo sin
 * `authenticateToken`. El frontend sí exige sesión antes de llamarla
 * (camino C2 del grafo), de modo que las dos capas aplican reglas de
 * seguridad distintas para la misma operación.
 *
 * Cualquiera con el token, sin cuenta en el sistema, obtiene el nombre del
 * docente, el curso y el grupo.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { queueFrom } from '../helpers/query-builder'
import { fromMock, supabaseModuleMock } from '../helpers/supabase-mock'
import qrFixture from '../fixtures/rq18-qr.json'

vi.mock('../../config/supabase-only', () => supabaseModuleMock)
vi.mock('../../config/supabaseClient', () => supabaseModuleMock)

import { app } from '../../app'

describe('DEF-13 — Resolver un QR debe requerir sesión', () => {
  beforeEach(() => {
    fromMock.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('sin cabecera Authorization debe responder 401', async () => {
    fromMock.mockImplementation(
      queueFrom({ qr_evaluaciones: [{ data: qrFixture.tokenValido, error: null }] })
    )

    const res = await request(app).get('/api/qr-evaluaciones/token-cualquiera')

    expect(res.status).toBe(401)
  })
})
