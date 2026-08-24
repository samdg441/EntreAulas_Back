/**
 * DEF-06 — Un usuario con tipo 'docente' no puede ver sus propias métricas (RQ22)
 *
 * Severidad: Media | Estado: ABIERTO
 *
 * `RoleService.obtenerDashboardUsuario` trata 'profesor' y 'docente' como
 * equivalentes y envía a ambos a /dashboard-profesor, pero el endpoint de
 * métricas exige `tipo_usuario === 'profesor'` exacto. Un docente llega a su
 * dashboard y recibe 403 al cargarlo.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { queueFrom } from '../helpers/query-builder'
import { fromMock, supabaseModuleMock } from '../helpers/supabase-mock'
import { setTestUser } from '../helpers/test-user'
import { profesorUser } from '../fixtures/users'

vi.mock('../../config/supabase-only', () => supabaseModuleMock)
vi.mock('../../config/supabaseClient', () => supabaseModuleMock)
vi.mock('../../middleware/auth', () => import('../helpers/auth-mock'))

import { app } from '../../app'

describe('DEF-06 — "docente" debe tener el mismo acceso que "profesor"', () => {
  beforeEach(() => {
    fromMock.mockReset()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('un docente debe poder consultar sus métricas', async () => {
    setTestUser({ ...profesorUser, tipo_usuario: 'docente', roles: ['docente'] })
    fromMock.mockImplementation(
      queueFrom({
        profesores: [{ data: { id: 7 }, error: null }],
        evaluaciones: [{ data: [], error: null }],
        grupos: [{ data: [], error: null }],
        asignaciones_profesor: [{ data: [], error: null }],
        cursos: [{ data: [], error: null }],
      })
    )
    const res = await request(app).get('/api/teachers/teacher-stats/7')
    expect(res.status).toBe(200)
  })
})
