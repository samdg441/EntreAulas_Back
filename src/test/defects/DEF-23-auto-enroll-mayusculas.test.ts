/**
 * DEF-23 — Auto-enroll exige tipo_usuario en minúsculas (RQ14)
 *
 * Severidad: Media | Estado: ABIERTO
 *
 * El handler compara `user.tipo_usuario !== 'estudiante'` sin normalizar.
 * Un estudiante con `tipo_usuario: 'Estudiante'` recibe 403 aunque el rol
 * en `roles` sea `estudiante`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { queueFrom } from '../helpers/query-builder'
import { fromMock, supabaseModuleMock } from '../helpers/supabase-mock'
import { setTestUser } from '../helpers/test-user'

vi.mock('../../config/supabase-only', () => supabaseModuleMock)
vi.mock('../../config/supabaseClient', () => supabaseModuleMock)
vi.mock('../../middleware/auth', () => import('../helpers/auth-mock'))

import { app } from '../../app'

describe('DEF-23 — Estudiante con mayúscula debe poder auto-inscribirse', () => {
  beforeEach(() => {
    fromMock.mockReset()
    setTestUser({
      id: 'est-1',
      email: 'est@test.com',
      tipo_usuario: 'Estudiante',
      roles: ['estudiante'],
      permisos: [],
    })
    fromMock.mockImplementation(
      queueFrom({
        estudiantes: [{ data: { id: 'est-1' }, error: null }],
        qr_evaluaciones: [{ data: { id: 1, token: 'tok', grupo_id: 11, activo: true }, error: null }],
        inscripciones: [
          { data: null, error: null },
          { data: { id: 200 }, error: null },
        ],
      })
    )
  })

  it("tipo_usuario 'Estudiante' debe crear la inscripción (201)", async () => {
    const res = await request(app).post('/api/qr-evaluaciones/tok/auto-enroll')
    expect(res.status).toBe(201)
    expect(res.body.created).toBe(true)
  })
})
