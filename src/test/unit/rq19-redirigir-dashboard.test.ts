import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createQueryBuilder } from '../helpers/query-builder'
import { fromMock, supabaseModuleMock } from '../helpers/supabase-mock'

vi.mock('../../config/supabase-only', () => supabaseModuleMock)
vi.mock('../../config/supabaseClient', () => supabaseModuleMock)

import { RoleService } from '../../modules/auth/role.service'

/**
 * RQ19 Backend — grafo obtenerDashboardUsuario (nodos 1–18)
 * C1 no obtiene rol → /dashboard
 * C2 admin | C3 decano | C4 coord | C5 profesor | C6 estudiante
 * C7 tipo_usuario | C8 default
 */
describe('RQ19 unit — Redirigir al dashboard según el rol', () => {
  beforeEach(() => {
    fromMock.mockReset()
    vi.restoreAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('C1: no obtiene roles (falla) → /dashboard', async () => {
    vi.spyOn(RoleService, 'obtenerRolesUsuario').mockRejectedValue(new Error('conexion'))
    await expect(RoleService.obtenerDashboardUsuario('u1')).resolves.toBe('/dashboard')
  })

  it('C2: admin → /dashboard-admin', async () => {
    vi.spyOn(RoleService, 'obtenerRolesUsuario').mockResolvedValue(['admin'])
    await expect(RoleService.obtenerDashboardUsuario('u1')).resolves.toBe('/dashboard-admin')
  })

  it('C3: decano → /dashboard-decano', async () => {
    vi.spyOn(RoleService, 'obtenerRolesUsuario').mockResolvedValue(['decano'])
    await expect(RoleService.obtenerDashboardUsuario('u1')).resolves.toBe('/dashboard-decano')
  })

  it('C4: coordinador → /dashboard-coordinador', async () => {
    vi.spyOn(RoleService, 'obtenerRolesUsuario').mockResolvedValue(['coordinador'])
    await expect(RoleService.obtenerDashboardUsuario('u1')).resolves.toBe('/dashboard-coordinador')
  })

  it('C5: profesor o docente → /dashboard-profesor', async () => {
    vi.spyOn(RoleService, 'obtenerRolesUsuario').mockResolvedValue(['profesor'])
    await expect(RoleService.obtenerDashboardUsuario('u1')).resolves.toBe('/dashboard-profesor')
    vi.spyOn(RoleService, 'obtenerRolesUsuario').mockResolvedValue(['docente'])
    await expect(RoleService.obtenerDashboardUsuario('u1')).resolves.toBe('/dashboard-profesor')
  })

  it('C6: estudiante → /dashboard-estudiante', async () => {
    vi.spyOn(RoleService, 'obtenerRolesUsuario').mockResolvedValue(['estudiante'])
    await expect(RoleService.obtenerDashboardUsuario('u1')).resolves.toBe('/dashboard-estudiante')
  })

  it('C7: sin roles; usa tipo_usuario', async () => {
    vi.spyOn(RoleService, 'obtenerRolesUsuario').mockResolvedValue([])
    fromMock.mockReturnValue(
      createQueryBuilder({ data: { tipo_usuario: 'coordinador' }, error: null })
    )
    await expect(RoleService.obtenerDashboardUsuario('u1')).resolves.toBe('/dashboard-coordinador')
  })

  it('C8: sin rol ni tipo válido → /dashboard', async () => {
    vi.spyOn(RoleService, 'obtenerRolesUsuario').mockResolvedValue([])
    fromMock.mockReturnValue(
      createQueryBuilder({ data: { tipo_usuario: 'desconocido' }, error: null })
    )
    await expect(RoleService.obtenerDashboardUsuario('u1')).resolves.toBe('/dashboard')
  })
})
