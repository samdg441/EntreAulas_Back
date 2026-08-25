/**
 * DEF-20 — dashboard-summary distingue mayúsculas en el rol (RQ24)
 *
 * Severidad: Media | Estado: ABIERTO
 *
 * Espejo de DEF-05 en este endpoint: `roles.includes('coordinador')` es exacto.
 * Un usuario con rol `Coordinador` y `tipo_usuario: 'profesor'` (doble rol
 * mal capitalizado) recibe 403, aunque el dashboard de RQ19 también falla
 * en el mismo dato.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { supabaseModuleMock } from '../helpers/supabase-mock'
import { coordinadorUser } from '../fixtures/users'

vi.mock('../../config/supabase-only', () => supabaseModuleMock)
vi.mock('../../config/supabaseClient', () => supabaseModuleMock)

vi.mock('../../middleware/auth', () => ({
  authenticateToken: (req: { user?: unknown }, _res: unknown, next: () => void) => {
    req.user = (globalThis as { __testUser?: unknown }).__testUser
    next()
  },
  requireRole: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}))

import { app } from '../../app'

describe('DEF-20 — El rol Coordinador debe acceder al resumen', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it("roles: ['Coordinador'] debe responder distinto de 403", async () => {
    ;(globalThis as { __testUser?: unknown }).__testUser = {
      ...coordinadorUser,
      tipo_usuario: 'profesor',
      roles: ['Coordinador'],
    }
    const res = await request(app).get('/api/coordinador/dashboard-summary')
    expect(res.status).not.toBe(403)
  })
})
