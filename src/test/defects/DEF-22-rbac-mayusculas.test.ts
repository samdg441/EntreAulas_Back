/**
 * DEF-22 — requireRole distingue mayúsculas (RQ6)
 *
 * Severidad: Media | Estado: ABIERTO
 *
 * `roles.includes(rol)` compara el string exacto. Un admin con
 * `tipo_usuario: 'Admin'` y `roles: ['Admin']` recibe 403 en
 * POST /qr-evaluaciones/batch, que exige `coordinador` | `admin`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { supabaseModuleMock } from '../helpers/supabase-mock'
import { setTestUser } from '../helpers/test-user'

vi.mock('../../config/supabase-only', () => supabaseModuleMock)
vi.mock('../../config/supabaseClient', () => supabaseModuleMock)

vi.mock('../../middleware/auth', async () => {
  const actual = await vi.importActual<typeof import('../../middleware/auth')>(
    '../../middleware/auth'
  )
  return {
    authenticateToken: (req: { user?: unknown }, _res: unknown, next: () => void) => {
      req.user = (globalThis as { __testUser?: unknown }).__testUser
      next()
    },
    requireRole: actual.requireRole,
  }
})

import { app } from '../../app'

describe('DEF-22 — El rol Admin debe autorizar POST /batch', () => {
  beforeEach(() => {
    setTestUser({
      id: 'u-admin',
      email: 'admin@test.com',
      tipo_usuario: 'Admin',
      roles: ['Admin'],
      permisos: [],
    })
  })

  it("tipo_usuario 'Admin' no debe responder 403 FORBIDDEN_ROLE", async () => {
    const res = await request(app).post('/api/qr-evaluaciones/batch').send({ grupoIds: [1] })
    expect(res.status).not.toBe(403)
    expect(res.body.code).not.toBe('FORBIDDEN_ROLE')
  })
})
