/**
 * DEF-03 — Paginación con valores no numéricos devuelve null (RQ24)
 *
 * Severidad: Media | Estado: ABIERTO
 *
 * `Math.max(1, Number('abc'))` es NaN, y NaN se serializa como null en JSON.
 * `?page=abc` devuelve `pagination.page = null`; `?pageSize=abc` además rompe
 * `pageSize` y `totalPages`. Debería rechazarse con 400 o caer al valor por defecto.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { queueFrom } from '../helpers/query-builder'
import { fromMock, supabaseModuleMock } from '../helpers/supabase-mock'
import { setTestUser } from '../helpers/test-user'
import { coordinadorUser } from '../fixtures/users'

vi.mock('../../config/supabase-only', () => supabaseModuleMock)
vi.mock('../../config/supabaseClient', () => supabaseModuleMock)
vi.mock('../../middleware/auth', () => import('../helpers/auth-mock'))

import { app } from '../../app'
import { RoleService } from '../../modules/auth/role.service'

describe('DEF-03 — La paginación debe ser numérica siempre', () => {
  beforeEach(() => {
    fromMock.mockReset()
    vi.restoreAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    setTestUser({ ...coordinadorUser })
    vi.spyOn(RoleService, 'obtenerCoordinadorPorUsuario').mockResolvedValue({
      carrera_id: 1,
    } as never)
    fromMock.mockImplementation(
      queueFrom({
        cursos: [{ data: [{ id: 1 }], error: null }],
        profesores: [{ data: [{ id: 7, usuario_id: 'u1', activo: true }], error: null }],
        usuarios: [
          { data: [{ id: 'u1', nombre: 'A', apellido: 'B', email: 'a@t.com' }], error: null },
        ],
        evaluaciones: [
          { data: [{ profesor_id: 7, calificacion_promedio: 4, completada: true }], error: null },
        ],
      })
    )
  })

  it('?page=abc no debe producir page null', async () => {
    const res = await request(app).get('/api/coordinador/dashboard-summary?page=abc')
    expect(res.body.pagination.page).toBe(1)
  })

  it('?pageSize=abc no debe producir pageSize ni totalPages null', async () => {
    const res = await request(app).get('/api/coordinador/dashboard-summary?pageSize=abc')
    expect(res.body.pagination.pageSize).toBe(8)
    expect(res.body.pagination.totalPages).toBe(1)
  })
})
