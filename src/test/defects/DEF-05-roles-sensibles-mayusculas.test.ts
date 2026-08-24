/**
 * DEF-05 — La resolución de dashboard distingue mayúsculas en los roles (RQ19)
 *
 * Severidad: Media | Estado: ABIERTO
 *
 * `roles.includes('admin')` compara de forma exacta, mientras que el fallback
 * por `tipo_usuario` sí normaliza con `.toLowerCase()`. Un usuario con el rol
 * guardado como 'Admin' termina en el dashboard genérico.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createQueryBuilder } from '../helpers/query-builder'
import { fromMock, supabaseModuleMock } from '../helpers/supabase-mock'

vi.mock('../../config/supabase-only', () => supabaseModuleMock)
vi.mock('../../config/supabaseClient', () => supabaseModuleMock)

import { RoleService } from '../../modules/auth/role.service'

describe('DEF-05 — El rol debe resolverse sin distinguir mayúsculas', () => {
  beforeEach(() => {
    fromMock.mockReset()
    vi.restoreAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it("el rol 'Admin' debe llevar al dashboard de administrador", async () => {
    vi.spyOn(RoleService, 'obtenerRolesUsuario').mockResolvedValue(['Admin'])
    fromMock.mockReturnValue(createQueryBuilder({ data: null, error: { message: 'x' } }))
    await expect(RoleService.obtenerDashboardUsuario('u1')).resolves.toBe('/dashboard-admin')
  })
})
