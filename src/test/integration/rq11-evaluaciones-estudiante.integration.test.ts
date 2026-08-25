/**
 * Integración RQ11: el grafo completo vive en `src/test/unit/rq11-*.test.ts`.
 * Aquí el contrato HTTP del camino feliz (C5) y del fallo de auth (C1).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { queueFrom } from '../helpers/query-builder'
import { fromMock, supabaseModuleMock } from '../helpers/supabase-mock'
import { estudianteUser } from '../fixtures/users'

vi.mock('../../config/supabase-only', () => supabaseModuleMock)
vi.mock('../../config/supabaseClient', () => supabaseModuleMock)

import { app } from '../../app'
import { RoleService } from '../../modules/auth/role.service'

const findUserById = supabaseModuleMock.SupabaseDB.findUserById as ReturnType<typeof vi.fn>

describe('RQ11 integration — smoke student-stats', () => {
  beforeEach(() => {
    fromMock.mockReset()
    findUserById.mockReset()
    vi.restoreAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('C1 HTTP: sin token → 401', async () => {
    const res = await request(app).get('/api/teachers/student-stats')
    expect(res.status).toBe(401)
    expect(res.body.code).toBe('NO_TOKEN')
  })

  it('C5 HTTP: 200 con pendientes y completadas', async () => {
    findUserById.mockResolvedValue({
      id: estudianteUser.id,
      email: estudianteUser.email,
      tipo_usuario: estudianteUser.tipo_usuario,
      activo: true,
    })
    vi.spyOn(RoleService, 'obtenerRolesUsuario').mockResolvedValue(['estudiante'])
    vi.spyOn(RoleService, 'obtenerPermisosUsuario').mockResolvedValue([])

    fromMock.mockImplementation(
      queueFrom({
        estudiantes: [{ data: { id: 'est-1' }, error: null }],
        evaluaciones: [
          {
            data: [
              { id: 1, calificacion_promedio: 4 },
              { id: 2, calificacion_promedio: 5 },
            ],
            error: null,
          },
        ],
        inscripciones: [{ data: [{ id: 'i1' }, { id: 'i2' }, { id: 'i3' }], error: null }],
      })
    )

    const token = jwt.sign({ userId: estudianteUser.id }, process.env.JWT_SECRET as string)
    const res = await request(app)
      .get('/api/teachers/student-stats')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.evaluacionesCompletadas).toBe(2)
    expect(res.body.evaluacionesPendientes).toBe(1)
    expect(res.body.materiasMatriculadas).toBe(3)
  })
})
