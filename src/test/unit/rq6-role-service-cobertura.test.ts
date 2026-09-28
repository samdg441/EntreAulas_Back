import { beforeEach, describe, expect, it, vi } from 'vitest'

const roleRepository = vi.hoisted(() => ({
  upsertRol: vi.fn(),
  desactivarRol: vi.fn(),
  listRolesActivos: vi.fn(),
  findRolActivo: vi.fn(),
  insertUsuarioProfesor: vi.fn(),
  insertCoordinador: vi.fn(),
  listCoordinadoresActivos: vi.fn(),
  findCoordinadorPorUsuario: vi.fn(),
  findTipoUsuario: vi.fn(),
  findDecanoPorUsuario: vi.fn(),
  findDecanoPorFacultad: vi.fn(),
}))

vi.mock('../../modules/auth/role.repository', () => ({ roleRepository }))

import { RoleService } from '../../modules/auth/role.service'

describe('RQ6 — RoleService (cobertura)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('asignar y remover rol: ok y false si la BD falla', async () => {
    roleRepository.upsertRol.mockResolvedValueOnce(undefined)
    await expect(RoleService.asignarRol('u1', 'admin')).resolves.toBe(true)
    roleRepository.upsertRol.mockRejectedValueOnce(new Error('db'))
    await expect(RoleService.asignarRol('u1', 'admin')).resolves.toBe(false)

    roleRepository.desactivarRol.mockResolvedValueOnce(undefined)
    await expect(RoleService.removerRol('u1', 'admin')).resolves.toBe(true)
    roleRepository.desactivarRol.mockRejectedValueOnce(new Error('db'))
    await expect(RoleService.removerRol('u1', 'admin')).resolves.toBe(false)
  })

  it('obtenerRolesUsuario y usuarioTieneRol', async () => {
    roleRepository.listRolesActivos.mockResolvedValueOnce(['profesor'])
    await expect(RoleService.obtenerRolesUsuario('u1')).resolves.toEqual(['profesor'])
    roleRepository.listRolesActivos.mockRejectedValueOnce(new Error('db'))
    await expect(RoleService.obtenerRolesUsuario('u1')).resolves.toEqual([])

    roleRepository.findRolActivo.mockResolvedValueOnce({ id: 1 })
    await expect(RoleService.usuarioTieneRol('u1', 'admin')).resolves.toBe(true)
    roleRepository.findRolActivo.mockResolvedValueOnce(null)
    await expect(RoleService.usuarioTieneRol('u1', 'admin')).resolves.toBe(false)
    roleRepository.findRolActivo.mockRejectedValueOnce(new Error('db'))
    await expect(RoleService.usuarioTieneRol('u1', 'admin')).resolves.toBe(false)
  })

  it('crearCoordinadorProfesor ok y error', async () => {
    roleRepository.insertUsuarioProfesor.mockResolvedValueOnce({ id: 'u-new' })
    roleRepository.upsertRol.mockResolvedValue(undefined)
    roleRepository.insertCoordinador.mockResolvedValueOnce(undefined)
    const ok = await RoleService.crearCoordinadorProfesor({
      email: 'c@a.com',
      password: 'secret123',
      nombre: 'Ana',
      apellido: 'Perez',
      carrera_id: 1,
    })
    expect(ok).toEqual({ success: true, usuario_id: 'u-new' })

    roleRepository.insertUsuarioProfesor.mockRejectedValueOnce(new Error('db'))
    const fail = await RoleService.crearCoordinadorProfesor({
      email: 'c@a.com',
      password: 'secret123',
      nombre: 'Ana',
      apellido: 'Perez',
    })
    expect(fail.success).toBe(false)
  })

  it('coordinadores, dashboard, permisos y decano', async () => {
    roleRepository.listCoordinadoresActivos.mockResolvedValueOnce([{ id: 1 }])
    await expect(RoleService.obtenerCoordinadores()).resolves.toEqual([{ id: 1 }])
    roleRepository.listCoordinadoresActivos.mockRejectedValueOnce(new Error('db'))
    await expect(RoleService.obtenerCoordinadores()).resolves.toEqual([])

    roleRepository.findCoordinadorPorUsuario.mockResolvedValueOnce({ id: 1 })
    await expect(RoleService.obtenerCoordinadorPorUsuario('u1')).resolves.toEqual({ id: 1 })
    roleRepository.findCoordinadorPorUsuario.mockRejectedValueOnce(new Error('db'))
    await expect(RoleService.obtenerCoordinadorPorUsuario('u1')).resolves.toBeNull()

    roleRepository.listRolesActivos.mockResolvedValueOnce(['admin'])
    await expect(RoleService.obtenerDashboardUsuario('u1')).resolves.toBe('/dashboard-admin')
    roleRepository.listRolesActivos.mockResolvedValueOnce([])
    roleRepository.findTipoUsuario.mockResolvedValueOnce({ tipo_usuario: 'estudiante' })
    await expect(RoleService.obtenerDashboardUsuario('u1')).resolves.toBe('/dashboard-estudiante')
    roleRepository.listRolesActivos.mockResolvedValueOnce([])
    roleRepository.findTipoUsuario.mockResolvedValueOnce(null)
    await expect(RoleService.obtenerDashboardUsuario('u1')).resolves.toBe('/dashboard')
    roleRepository.listRolesActivos.mockRejectedValueOnce(new Error('db'))
    await expect(RoleService.obtenerDashboardUsuario('u1')).resolves.toBe('/dashboard')

    roleRepository.listRolesActivos.mockResolvedValueOnce(['decano'])
    const permisosDecano = await RoleService.obtenerPermisosUsuario('u1')
    expect(permisosDecano).toContain('view_all_careers')
    roleRepository.listRolesActivos.mockResolvedValueOnce(['coordinador'])
    expect(await RoleService.obtenerPermisosUsuario('u1')).toContain('manage_department')
    roleRepository.listRolesActivos.mockResolvedValueOnce(['docente'])
    expect(await RoleService.obtenerPermisosUsuario('u1')).toContain('create_evaluations')
    roleRepository.listRolesActivos.mockResolvedValueOnce(['estudiante'])
    expect(await RoleService.obtenerPermisosUsuario('u1')).toContain('submit_evaluations')
    roleRepository.listRolesActivos.mockRejectedValueOnce(new Error('db'))
    await expect(RoleService.obtenerPermisosUsuario('u1')).resolves.toEqual([])

    roleRepository.listRolesActivos.mockResolvedValueOnce(['admin'])
    await expect(RoleService.usuarioPuedeAcceder('u1', 'x')).resolves.toBe(true)
    roleRepository.listRolesActivos.mockResolvedValueOnce(['estudiante'])
    await expect(RoleService.usuarioPuedeAcceder('u1', 'submit_evaluations')).resolves.toBe(true)
    roleRepository.listRolesActivos.mockResolvedValueOnce(['estudiante'])
    await expect(RoleService.usuarioPuedeAcceder('u1', 'manage_users')).resolves.toBe(false)
    roleRepository.listRolesActivos.mockRejectedValueOnce(new Error('db'))
    await expect(RoleService.usuarioPuedeAcceder('u1', 'x')).resolves.toBe(false)

    roleRepository.findDecanoPorUsuario.mockResolvedValueOnce({ id: 9 })
    await expect(RoleService.obtenerDecanoPorUsuario('u1')).resolves.toEqual({ id: 9 })
    roleRepository.findDecanoPorUsuario.mockRejectedValueOnce(new Error('db'))
    await expect(RoleService.obtenerDecanoPorUsuario('u1')).resolves.toBeNull()
    roleRepository.findDecanoPorFacultad.mockResolvedValueOnce({ id: 8 })
    await expect(RoleService.obtenerDecanoFacultad(1)).resolves.toEqual({ id: 8 })
    roleRepository.findDecanoPorFacultad.mockRejectedValueOnce(new Error('db'))
    await expect(RoleService.obtenerDecanoFacultad(1)).resolves.toBeNull()
  })
})
