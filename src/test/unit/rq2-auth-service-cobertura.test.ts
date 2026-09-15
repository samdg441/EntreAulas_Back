import { beforeEach, describe, expect, it, vi } from 'vitest'

const authRepository = vi.hoisted(() => ({
  findUserByEmail: vi.fn(),
  updateUser: vi.fn(),
  createUserWithType: vi.fn(),
}))

const RoleService = vi.hoisted(() => ({
  obtenerRolesUsuario: vi.fn(),
  obtenerDashboardUsuario: vi.fn(),
  obtenerPermisosUsuario: vi.fn(),
  obtenerCoordinadorPorUsuario: vi.fn(),
  obtenerDecanoPorUsuario: vi.fn(),
}))

vi.mock('../../modules/auth/auth.repository', () => ({ authRepository }))
vi.mock('../../modules/auth/role.service', () => ({ RoleService, default: RoleService }))

import {
  autenticarCredenciales,
  armarPerfilConRoles,
  crearUsuarioConTipo,
  generarTokenSesion,
  migrarPasswordSiHaceFalta,
  resolverRolesUsuario,
  tieneRolValido,
} from '../../modules/auth/auth.service'
import { hashPassword } from '../../utils/passwordSecurity'

describe('RQ2 — auth.service (cobertura)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('tieneRolValido acepta tipo o rol del conjunto', () => {
    expect(tieneRolValido('estudiante', [])).toBe(true)
    expect(tieneRolValido('invitado', ['admin'])).toBe(true)
    expect(tieneRolValido('invitado', ['x'])).toBe(false)
  })

  it('migrarPasswordSiHaceFalta no hace nada sin hash pendiente y traga error de update', async () => {
    await migrarPasswordSiHaceFalta('u1', {})
    expect(authRepository.updateUser).not.toHaveBeenCalled()

    authRepository.updateUser.mockResolvedValueOnce(undefined)
    await migrarPasswordSiHaceFalta('u1', { migratePlaintextToHash: 'plain' })
    expect(authRepository.updateUser).toHaveBeenCalled()

    authRepository.updateUser.mockRejectedValueOnce(new Error('db'))
    await expect(migrarPasswordSiHaceFalta('u1', { migratePlaintextToHash: 'plain' })).resolves.toBeUndefined()
  })

  it('autenticarCredenciales rechaza ausente, inactivo o password mala y acepta hash', async () => {
    authRepository.findUserByEmail.mockResolvedValueOnce(null)
    await expect(autenticarCredenciales('a@a.com', 'x')).rejects.toMatchObject({ status: 401 })

    authRepository.findUserByEmail.mockResolvedValueOnce({ id: 'u1', activo: false, password: 'p' })
    await expect(autenticarCredenciales('a@a.com', 'x')).rejects.toMatchObject({ status: 401 })

    const hashed = await hashPassword('secret123')
    authRepository.findUserByEmail.mockResolvedValueOnce({ id: 'u1', activo: true, password: hashed })
    await expect(autenticarCredenciales('a@a.com', 'wrong')).rejects.toMatchObject({ status: 401 })

    authRepository.findUserByEmail.mockResolvedValueOnce({ id: 'u1', activo: true, password: hashed, email: 'a@a.com' })
    const user = await autenticarCredenciales('a@a.com', 'secret123')
    expect(user.id).toBe('u1')
  })

  it('crearUsuarioConTipo 400 si el email existe y crea si no', async () => {
    authRepository.findUserByEmail.mockResolvedValueOnce({ id: 'u1' })
    await expect(
      crearUsuarioConTipo({
        email: 'a@a.com',
        password: 'secret123',
        nombre: 'Ana',
        apellido: 'Perez',
        tipo_usuario: 'estudiante',
      })
    ).rejects.toMatchObject({ status: 400 })

    authRepository.findUserByEmail.mockResolvedValueOnce(null)
    authRepository.createUserWithType.mockResolvedValueOnce({ id: 'u2' })
    const created = await crearUsuarioConTipo({
      email: 'b@a.com',
      password: 'secret123',
      nombre: 'Ana',
      apellido: 'Perez',
      tipo_usuario: 'estudiante',
    })
    expect(created.id).toBe('u2')
  })

  it('generarTokenSesion firma JWT', () => {
    const token = generarTokenSesion({ userId: 'u1' })
    expect(token.split('.')).toHaveLength(3)
  })

  it('resolverRolesUsuario 401 si el tipo no vale y devuelve roles si vale', async () => {
    RoleService.obtenerRolesUsuario.mockResolvedValueOnce(['x'])
    await expect(resolverRolesUsuario('u1', 'invitado')).rejects.toMatchObject({ status: 401 })

    RoleService.obtenerRolesUsuario.mockResolvedValueOnce(['estudiante'])
    await expect(resolverRolesUsuario('u1', 'estudiante')).resolves.toEqual(['estudiante'])
  })

  it('armarPerfilConRoles agrega coordinador y decano y tolera fallos', async () => {
    RoleService.obtenerDashboardUsuario.mockResolvedValue('/dashboard')
    RoleService.obtenerPermisosUsuario.mockResolvedValue(['view_reports'])
    RoleService.obtenerCoordinadorPorUsuario.mockResolvedValueOnce({ carrera_id: 1 })
    RoleService.obtenerDecanoPorUsuario.mockResolvedValueOnce({
      facultad_id: 2,
      facultades: { nombre: 'Ing' },
      fecha_nombramiento: '2026-01-01',
    })
    const perfil = await armarPerfilConRoles('u1', ['coordinador', 'decano'], 'coordinador')
    expect(perfil.coordinador).toEqual({ carrera_id: 1 })
    expect(perfil.decano).toMatchObject({ facultad_id: 2, facultad_nombre: 'Ing' })

    RoleService.obtenerCoordinadorPorUsuario.mockRejectedValueOnce(new Error('c'))
    RoleService.obtenerDecanoPorUsuario.mockRejectedValueOnce(new Error('d'))
    const sinExtra = await armarPerfilConRoles('u1', ['coordinador', 'decano'], 'coordinador')
    expect(sinExtra.coordinador).toBeUndefined()
    expect(sinExtra.decano).toBeUndefined()

    RoleService.obtenerCoordinadorPorUsuario.mockResolvedValueOnce(null)
    RoleService.obtenerDecanoPorUsuario.mockResolvedValueOnce(null)
    const vacio = await armarPerfilConRoles('u1', ['estudiante'], 'estudiante')
    expect(vacio.coordinador).toBeUndefined()
  })
})
