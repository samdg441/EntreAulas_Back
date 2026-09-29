import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Request, Response } from 'express'

const authRepository = vi.hoisted(() => ({
  findUserById: vi.fn(),
  findUserByEmail: vi.fn(),
}))

const roleRepository = vi.hoisted(() => ({
  listRolesActivos: vi.fn(),
  sincronizarRoles: vi.fn(),
  listRolesAgrupados: vi.fn(),
}))

const academicService = vi.hoisted(() => ({
  updateUser: vi.fn(),
  deactivateUser: vi.fn(),
  listUsersSummary: vi.fn(),
  getAcademicStructure: vi.fn(),
  getDashboardStats: vi.fn(),
  getGruposConProfesorByCareer: vi.fn(),
}))

vi.mock('../../modules/auth/auth.repository', () => ({ authRepository }))
vi.mock('../../modules/auth/role.repository', () => ({ roleRepository }))
vi.mock('../../modules/academic/academic.service', () => ({
  academicService,
  AcademicService: class {},
}))

import {
  applyRoleConstraints,
  parseRolesBody,
  resolveEffectiveRoles,
  UsersController,
} from '../../modules/academic/users.controller'

const existing = {
  id: 'user-1',
  email: 'ana@udemedellin.edu.co',
  nombre: 'Ana',
  apellido: 'Perez',
  tipo_usuario: 'profesor',
  activo: true,
}

function fakeRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code
      return this
    },
    json(payload: unknown) {
      this.body = payload
      return this
    },
  }
  return res
}

function fakeReq(over: Partial<Request> = {}): Request {
  return { params: {}, body: {}, ...over } as Request
}

class RQ10UsersControllerCobertura {
  helpersDeRoles() {
    expect(parseRolesBody(undefined)).toBeNull()
    expect(parseRolesBody('admin')).toBeNull()
    expect(() => parseRolesBody([])).toThrowError('Selecciona al menos un rol')
    expect(() => parseRolesBody(['superadmin'])).toThrowError('Rol inválido')
    expect(parseRolesBody(['profesor', 'admin'])).toEqual(['profesor', 'admin'])

    expect(resolveEffectiveRoles(['admin'], ['profesor'], 'estudiante')).toEqual(['admin'])
    expect(resolveEffectiveRoles(null, ['profesor'], 'estudiante')).toEqual(['profesor'])
    expect(resolveEffectiveRoles(null, [], 'estudiante')).toEqual(['estudiante'])

    const sinRoles: Record<string, unknown> = { nombre: 'Ana' }
    applyRoleConstraints(sinRoles, null, ['profesor'], 'profesor')
    expect(sinRoles).toEqual({ nombre: 'Ana' })

    const conCorreo: Record<string, unknown> = { email: 'Ana@udemedellin.edu.co' }
    applyRoleConstraints(conCorreo, null, ['profesor'], 'profesor')
    expect(conCorreo.email).toBe('ana@udemedellin.edu.co')

    const conservaTipo: Record<string, unknown> = { tipo_usuario: 'profesor' }
    applyRoleConstraints(conservaTipo, ['profesor', 'admin'], ['profesor', 'admin'], 'estudiante')
    expect(conservaTipo.tipo_usuario).toBe('profesor')

    const reemplazaTipo: Record<string, unknown> = {}
    applyRoleConstraints(reemplazaTipo, ['admin'], ['admin'], 'profesor')
    expect(reemplazaTipo.tipo_usuario).toBe('admin')
  }

  async actualizaSinRoles() {
    authRepository.findUserById.mockResolvedValue(existing)
    roleRepository.listRolesActivos.mockResolvedValue(['profesor'])
    academicService.updateUser.mockResolvedValue({ ...existing, nombre: 'Ana Maria' })

    const res = fakeRes()
    await UsersController.updateUser(
      fakeReq({ params: { id: 'user-1' }, body: { nombre: 'Ana Maria' } }),
      res as unknown as Response,
    )

    expect(res.statusCode).toBe(200)
    expect(res.body).toMatchObject({
      message: 'Usuario actualizado',
      user: { nombre: 'Ana Maria', roles: ['profesor'] },
    })
    expect(roleRepository.sincronizarRoles).not.toHaveBeenCalled()
    expect(authRepository.findUserByEmail).not.toHaveBeenCalled()
  }

  async actualizaConRolesYCorreo() {
    authRepository.findUserById.mockResolvedValue(existing)
    authRepository.findUserByEmail.mockResolvedValue(null)
    roleRepository.listRolesActivos.mockResolvedValue(['profesor'])
    roleRepository.sincronizarRoles.mockResolvedValue(undefined)
    academicService.updateUser.mockResolvedValue({
      ...existing,
      email: 'ana@udemedellin.edu.co',
      tipo_usuario: 'profesor',
    })

    const res = fakeRes()
    await UsersController.updateUser(
      fakeReq({
        params: { id: 'user-1' },
        body: { email: 'Ana@udemedellin.edu.co', roles: ['profesor', 'admin'] },
      }),
      res as unknown as Response,
    )

    expect(res.statusCode).toBe(200)
    expect(academicService.updateUser).toHaveBeenCalledWith('user-1', {
      email: 'ana@udemedellin.edu.co',
      tipo_usuario: 'profesor',
    })
    expect(roleRepository.sincronizarRoles).toHaveBeenCalledWith('user-1', ['profesor', 'admin'])
    expect(res.body).toMatchObject({ user: { roles: ['profesor', 'admin'] } })
  }

  async rechazaActualizacionInvalida() {
    const sinId = fakeRes()
    await UsersController.updateUser(fakeReq({ body: { nombre: 'Ana' } }), sinId as unknown as Response)
    expect(sinId.statusCode).toBe(400)
    expect(sinId.body).toMatchObject({ error: 'ID de usuario requerido' })

    authRepository.findUserById.mockResolvedValue(null)
    const noExiste = fakeRes()
    await UsersController.updateUser(
      fakeReq({ params: { id: 'missing' }, body: { nombre: 'Ana' } }),
      noExiste as unknown as Response,
    )
    expect(noExiste.statusCode).toBe(404)

    authRepository.findUserById.mockResolvedValue(existing)
    roleRepository.listRolesActivos.mockResolvedValue([])
    const rolesVacios = fakeRes()
    await UsersController.updateUser(
      fakeReq({ params: { id: 'user-1' }, body: { roles: [] } }),
      rolesVacios as unknown as Response,
    )
    expect(rolesVacios.body).toMatchObject({ error: 'Selecciona al menos un rol' })

    const rolInvalido = fakeRes()
    await UsersController.updateUser(
      fakeReq({ params: { id: 'user-1' }, body: { roles: ['superadmin'] } }),
      rolInvalido as unknown as Response,
    )
    expect(rolInvalido.body).toMatchObject({ error: 'Rol inválido' })

    authRepository.findUserByEmail.mockResolvedValue({ id: 'otro' })
    const conflicto = fakeRes()
    await UsersController.updateUser(
      fakeReq({
        params: { id: 'user-1' },
        body: { email: 'otro@udemedellin.edu.co' },
      }),
      conflicto as unknown as Response,
    )
    expect(conflicto.statusCode).toBe(400)
    expect(conflicto.body).toMatchObject({ error: 'El email ya está registrado' })

    academicService.updateUser.mockRejectedValue(new Error('db'))
    roleRepository.listRolesActivos.mockResolvedValue(['profesor'])
    const fallo = fakeRes()
    await UsersController.updateUser(
      fakeReq({ params: { id: 'user-1' }, body: { nombre: 'Ana' } }),
      fallo as unknown as Response,
    )
    expect(fallo.statusCode).toBe(500)
    expect(fallo.body).toMatchObject({ error: 'Error al actualizar usuario' })
  }

  async listaYDesactiva() {
    academicService.listUsersSummary.mockResolvedValue([
      { id: 'u1', tipo_usuario: 'profesor' },
      { id: 'u2', tipo_usuario: 'estudiante' },
      { id: 'u3' },
    ])
    roleRepository.listRolesAgrupados.mockResolvedValue(new Map([['u1', ['admin']]]))
    const lista = fakeRes()
    await UsersController.listUsers(fakeReq(), lista as unknown as Response)
    expect(lista.body).toEqual({
      users: [
        { id: 'u1', tipo_usuario: 'profesor', roles: ['admin'] },
        { id: 'u2', tipo_usuario: 'estudiante', roles: ['estudiante'] },
        { id: 'u3', roles: [] },
      ],
    })

    academicService.listUsersSummary.mockResolvedValue(null)
    roleRepository.listRolesAgrupados.mockResolvedValue(new Map())
    const vacia = fakeRes()
    await UsersController.listUsers(fakeReq(), vacia as unknown as Response)
    expect(vacia.body).toEqual({ users: [] })

    academicService.listUsersSummary.mockRejectedValue(new Error('db'))
    const falla = fakeRes()
    await UsersController.listUsers(fakeReq(), falla as unknown as Response)
    expect(falla.body).toMatchObject({ error: 'Error al listar usuarios' })

    const sinId = fakeRes()
    await UsersController.deactivateUser(fakeReq(), sinId as unknown as Response)
    expect(sinId.body).toMatchObject({ error: 'ID de usuario requerido' })

    authRepository.findUserById.mockResolvedValue(null)
    const noExiste = fakeRes()
    await UsersController.deactivateUser(
      fakeReq({ params: { id: 'missing' } }),
      noExiste as unknown as Response,
    )
    expect(noExiste.statusCode).toBe(404)

    authRepository.findUserById.mockResolvedValue(existing)
    const propio = fakeRes()
    await UsersController.deactivateUser(
      fakeReq({ params: { id: 'user-1' }, user: { id: 'user-1' } } as Partial<Request>),
      propio as unknown as Response,
    )
    expect(propio.body).toMatchObject({ error: 'No puedes desactivar tu propia cuenta' })

    academicService.deactivateUser.mockResolvedValue({ ...existing, activo: false })
    const ok = fakeRes()
    await UsersController.deactivateUser(
      fakeReq({ params: { id: 'user-1' }, user: { id: 'admin-2' } } as Partial<Request>),
      ok as unknown as Response,
    )
    expect(ok.body).toMatchObject({ message: 'Usuario desactivado', user: { activo: false } })

    academicService.deactivateUser.mockRejectedValue(new Error('db'))
    const error = fakeRes()
    await UsersController.deactivateUser(
      fakeReq({ params: { id: 'user-1' }, user: { id: 'admin-2' } } as Partial<Request>),
      error as unknown as Response,
    )
    expect(error.body).toMatchObject({ error: 'Error al desactivar usuario' })
  }

  async consultasAcademicas() {
    academicService.getAcademicStructure.mockResolvedValue([{ id: 1 }])
    const estructura = fakeRes()
    await UsersController.getAcademicStructure(fakeReq(), estructura as unknown as Response)
    expect(estructura.body).toEqual({ facultades: [{ id: 1 }] })

    academicService.getAcademicStructure.mockRejectedValue(new Error('db'))
    const estructuraFalla = fakeRes()
    await UsersController.getAcademicStructure(fakeReq(), estructuraFalla as unknown as Response)
    expect(estructuraFalla.body).toMatchObject({ error: 'Error al obtener estructura académica' })

    academicService.getDashboardStats.mockResolvedValue({ total: 4 })
    const stats = fakeRes()
    await UsersController.getDashboardStats(fakeReq(), stats as unknown as Response)
    expect(stats.body).toEqual({ total: 4 })

    academicService.getDashboardStats.mockRejectedValue(new Error('db'))
    const statsFalla = fakeRes()
    await UsersController.getDashboardStats(fakeReq(), statsFalla as unknown as Response)
    expect(statsFalla.body).toMatchObject({ error: 'Error al obtener estadísticas' })

    const careerInvalida = fakeRes()
    await UsersController.getGruposByCareer(
      fakeReq({ params: { careerId: 'no-num' } }),
      careerInvalida as unknown as Response,
    )
    expect(careerInvalida.body).toMatchObject({ error: 'careerId inválido' })

    academicService.getGruposConProfesorByCareer.mockResolvedValue([{ id: 9 }])
    const grupos = fakeRes()
    await UsersController.getGruposByCareer(
      fakeReq({ params: { careerId: '3' } }),
      grupos as unknown as Response,
    )
    expect(academicService.getGruposConProfesorByCareer).toHaveBeenCalledWith(3)
    expect(grupos.body).toEqual([{ id: 9 }])

    academicService.getGruposConProfesorByCareer.mockRejectedValue(new Error('db'))
    const gruposFalla = fakeRes()
    await UsersController.getGruposByCareer(
      fakeReq({ params: { careerId: '3' } }),
      gruposFalla as unknown as Response,
    )
    expect(gruposFalla.body).toMatchObject({ error: 'Error al obtener grupos' })
  }
}

const pruebas = new RQ10UsersControllerCobertura()

describe('RQ10 — cobertura de users.controller', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('helpers de roles cubren vacío, inválido y tipo efectivo', () => pruebas.helpersDeRoles())
  it('PUT sin roles usa los roles actuales', () => pruebas.actualizaSinRoles())
  it('PUT con roles y correo sincroniza y normaliza', () => pruebas.actualizaConRolesYCorreo())
  it('PUT rechaza id, usuario, roles y correo en conflicto', () => pruebas.rechazaActualizacionInvalida())
  it('lista usuarios y desactiva cubriendo roles y errores', () => pruebas.listaYDesactiva())
  it('estructura, estadísticas y grupos cubren éxito y error', () => pruebas.consultasAcademicas())
})
