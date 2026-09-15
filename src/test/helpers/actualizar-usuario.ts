import { expect } from 'vitest'
import { AppError } from '../../shared/errors'
import { isBcryptHash } from '../../utils/passwordSecurity'
import {
  applyPassword,
  applyUserType,
  assertHasUpdates,
  collectUserUpdates,
  ensureEmailIsAvailable,
} from '../../modules/academic/users.controller'

function expectAppError(error: unknown, message: string, status: number) {
  expect(error).toBeInstanceOf(AppError)
  expect((error as AppError).message).toBe(message)
  expect((error as AppError).status).toBe(status)
}

export class RQ10UpdateUserHelpers {
  async bodyVacioOUndefined() {
    expect(await collectUserUpdates(undefined)).toEqual({})
    expect(await collectUserUpdates({})).toEqual({})
    expect(await collectUserUpdates({ nombre: '   ', apellido: '', email: '  ' })).toEqual({})
    try {
      assertHasUpdates({})
      expect.fail('debería lanzar')
    } catch (error) {
      expectAppError(error, 'No hay campos para actualizar', 400)
    }
  }

  ignoraCamposNoString() {
    const updates: Record<string, unknown> = {}
    applyUserType(updates, 1)
    applyUserType(updates, undefined)
    expect(updates).toEqual({})
  }

  tipoUsuarioInvalido() {
    expect(() => applyUserType({}, 'superadmin')).toThrowError('tipo_usuario inválido')
  }

  tipoUsuarioValido() {
    const updates: Record<string, unknown> = {}
    applyUserType(updates, 'docente')
    expect(updates).toEqual({ tipo_usuario: 'docente' })
  }

  async passwordCortaOVacia() {
    const updates: Record<string, unknown> = {}
    await applyPassword(updates, 123)
    await applyPassword(updates, '')
    expect(updates).toEqual({})
    await expect(applyPassword({}, 'short1')).rejects.toThrowError(
      'La contraseña debe tener al menos 8 caracteres',
    )
  }

  async passwordValidaSeHashea() {
    const updates: Record<string, unknown> = {}
    await applyPassword(updates, 'password123')
    expect(typeof updates.password).toBe('string')
    expect(isBcryptHash(updates.password as string)).toBe(true)
  }

  async armaPayloadDeActualizacion() {
    const updates = await collectUserUpdates({
      email: '  Nuevo@test.com ',
      apellido: ' Gomez ',
      tipo_usuario: 'docente',
      activo: false,
      nombre: 99,
      password: '',
    })
    expect(updates).toEqual({
      email: 'nuevo@test.com',
      apellido: 'Gomez',
      tipo_usuario: 'docente',
      activo: false,
    })
  }

  emailDisponibleOConflicto() {
    expect(() =>
      ensureEmailIsAvailable('u-1', 'ana@test.com', undefined, { id: 'otro' }),
    ).not.toThrow()
    expect(() =>
      ensureEmailIsAvailable('u-1', 'ana@test.com', 'ana@test.com', { id: 'otro' }),
    ).not.toThrow()
    expect(() =>
      ensureEmailIsAvailable('u-1', 'ana@test.com', 'mio@test.com', { id: 'u-1' }),
    ).not.toThrow()
    expect(() =>
      ensureEmailIsAvailable('u-1', 'ana@test.com', 'libre@test.com', null),
    ).not.toThrow()
    expect(() =>
      ensureEmailIsAvailable('u-1', 'ana@test.com', 'taken@test.com', { id: 'otro' }),
    ).toThrowError('El email ya está registrado')
  }
}
