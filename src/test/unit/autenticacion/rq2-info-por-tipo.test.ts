/**
 * RQ2 — Reglas de sesión de auth.service.ts que ahora usan las rutas (refactorización): panel, permisos y descripción por tipo.
 */
import { describe, expect, it } from 'vitest'
import { describirRolPrincipal, infoPorTipoDeUsuario, normalizarTipoUsuario, tieneRolValido } from '../../../modules/auth/auth.service'

describe('RQ2 — auth.service: panel y roles', () => {
  it.each([
    ['estudiante', '/dashboard-estudiante'],
    ['profesor', '/dashboard-profesor'],
    ['docente', '/dashboard-profesor'],
    ['coordinador', '/dashboard-coordinador'],
    ['admin', '/dashboard-admin'],
  ])('infoPorTipoDeUsuario(%s) → %s', (tipo, panel) => {
    expect(infoPorTipoDeUsuario(tipo)).toMatchObject({ dashboard: panel })
  })

  it('un tipo sin panel en GET /me no agrega información', () => {
    expect(infoPorTipoDeUsuario('decano')).toEqual({})
  })

  it('normaliza docente a profesor y valida los roles', () => {
    expect(normalizarTipoUsuario('docente')).toBe('profesor')
    expect(tieneRolValido('superadmin', ['estudiante'])).toBe(true)
    expect(tieneRolValido('superadmin', [])).toBe(false)
  })

  it('describe el rol principal por prioridad', () => {
    expect(describirRolPrincipal(['estudiante', 'admin'], 'estudiante')).toBe('Administrador del sistema')
    expect(describirRolPrincipal(['invitado', 'otro'], 'x')).toBe('Usuario con múltiples roles: invitado, otro')
    expect(describirRolPrincipal([], 'x')).toBe('Usuario con rol: x')
  })
})
