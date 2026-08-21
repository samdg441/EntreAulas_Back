import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createQueryBuilder } from '../helpers/query-builder'

const fromMock = vi.fn()

vi.mock('../../config/supabase-only', () => ({
  SupabaseDB: {
    supabaseAdmin: { from: (...args: unknown[]) => fromMock(...args) },
    findUserById: vi.fn(),
    findUserByEmail: vi.fn(),
  },
  supabaseAdmin: { from: (...args: unknown[]) => fromMock(...args) },
  default: {},
}))

vi.mock('../../config/supabaseClient', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => fromMock(...args) },
  SupabaseDB: {
    supabaseAdmin: { from: (...args: unknown[]) => fromMock(...args) },
  },
  default: {},
}))

import { RoleService } from '../../modules/auth/role.service'

describe('RQ2 unitarias — Redirigir al dashboard según el rol (backend)', () => {
  beforeEach(() => {
    fromMock.mockReset()
    vi.restoreAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('Camino 1: rol admin → /dashboard-admin', async () => {
    vi.spyOn(RoleService, 'obtenerRolesUsuario').mockResolvedValue(['admin'])
    await expect(RoleService.obtenerDashboardUsuario('u1')).resolves.toBe('/dashboard-admin')
  })

  it('Camino 2: rol decano → /dashboard-decano', async () => {
    vi.spyOn(RoleService, 'obtenerRolesUsuario').mockResolvedValue(['decano'])
    await expect(RoleService.obtenerDashboardUsuario('u1')).resolves.toBe('/dashboard-decano')
  })

  it('Camino 3: rol coordinador → /dashboard-coordinador', async () => {
    vi.spyOn(RoleService, 'obtenerRolesUsuario').mockResolvedValue(['coordinador'])
    await expect(RoleService.obtenerDashboardUsuario('u1')).resolves.toBe('/dashboard-coordinador')
  })

  it('Camino 4: rol profesor/docente → /dashboard-profesor', async () => {
    vi.spyOn(RoleService, 'obtenerRolesUsuario').mockResolvedValue(['profesor'])
    await expect(RoleService.obtenerDashboardUsuario('u1')).resolves.toBe('/dashboard-profesor')

    vi.spyOn(RoleService, 'obtenerRolesUsuario').mockResolvedValue(['docente'])
    await expect(RoleService.obtenerDashboardUsuario('u1')).resolves.toBe('/dashboard-profesor')
  })

  it('Camino 5: rol estudiante → /dashboard-estudiante', async () => {
    vi.spyOn(RoleService, 'obtenerRolesUsuario').mockResolvedValue(['estudiante'])
    await expect(RoleService.obtenerDashboardUsuario('u1')).resolves.toBe('/dashboard-estudiante')
  })

  it('Camino 6: sin roles en tabla; usa tipo_usuario', async () => {
    vi.spyOn(RoleService, 'obtenerRolesUsuario').mockResolvedValue([])
    fromMock.mockReturnValue(createQueryBuilder({ data: { tipo_usuario: 'coordinador' }, error: null }))

    await expect(RoleService.obtenerDashboardUsuario('u1')).resolves.toBe('/dashboard-coordinador')
  })

  it('Camino 7: sin rol válido → /dashboard por defecto', async () => {
    vi.spyOn(RoleService, 'obtenerRolesUsuario').mockResolvedValue([])
    fromMock.mockReturnValue(createQueryBuilder({ data: { tipo_usuario: 'desconocido' }, error: null }))

    await expect(RoleService.obtenerDashboardUsuario('u1')).resolves.toBe('/dashboard')
  })
})
