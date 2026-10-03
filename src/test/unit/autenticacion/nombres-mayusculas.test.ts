import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createQueryBuilder } from '../../helpers/query-builder'

const fromMock = vi.hoisted(() => vi.fn())

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: (...args: unknown[]) => fromMock(...args) }),
}))

process.env.SUPABASE_URL ||= 'http://supabase.test'
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'service-role-test'

import { enMayusculas, normalizarNombres } from '../../../shared/nombres'
import { SupabaseDB } from '../../../config/supabase-only'

describe('Nombre y apellido en mayúscula', () => {
  beforeEach(() => fromMock.mockReset())

  it('pasa a mayúscula, respeta tildes y ñ y limpia espacios', () => {
    expect(enMayusculas('  maría   josé ')).toBe('MARÍA JOSÉ')
    expect(enMayusculas('peña núñez')).toBe('PEÑA NÚÑEZ')
    expect(enMayusculas(undefined)).toBe('')
  })

  it('solo toca nombre y apellido cuando vienen', () => {
    expect(normalizarNombres({ nombre: 'ana', email: 'Ana@Udem.edu.co' })).toEqual({
      nombre: 'ANA',
      email: 'Ana@Udem.edu.co',
    })
    expect(normalizarNombres({ activo: false })).toEqual({ activo: false })
  })

  it('al crear un usuario se guardan en mayúscula', async () => {
    const builder = createQueryBuilder({ data: { id: 'u1' }, error: null })
    fromMock.mockReturnValue(builder)

    await SupabaseDB.createUser({
      email: 'ana@udem.edu.co',
      password: 'hash',
      nombre: 'ana maría',
      apellido: 'gómez',
      tipo_usuario: 'estudiante',
    })

    expect(fromMock).toHaveBeenCalledWith('usuarios')
    expect(builder.insert).toHaveBeenCalledWith([
      expect.objectContaining({ nombre: 'ANA MARÍA', apellido: 'GÓMEZ', email: 'ana@udem.edu.co' }),
    ])
  })

  it('al editar también, para no volver a minúsculas', async () => {
    const builder = createQueryBuilder({ data: { id: 'u1' }, error: null })
    fromMock.mockReturnValue(builder)

    await SupabaseDB.updateUser('u1', { apellido: 'ruiz', activo: true })

    expect(builder.update).toHaveBeenCalledWith({ apellido: 'RUIZ', activo: true })
  })
})
