import { describe, expect, it } from 'vitest'
import {
  dashboardDesdeRolSeleccionado,
  dashboardDesdeRoles,
  dashboardDesdeTipoUsuario,
  dashboardParaUsuario,
} from '../../modules/auth/dashboard'

class RQ19RedirigirDashboard {
  C1_sinRolNiTipo() {
    expect(dashboardParaUsuario([], undefined)).toBe('/dashboard')
  }

  C2_admin() {
    expect(dashboardParaUsuario(['admin'])).toBe('/dashboard-admin')
  }

  C3_decano() {
    expect(dashboardParaUsuario(['decano'])).toBe('/dashboard-decano')
  }

  C4_coordinador() {
    expect(dashboardParaUsuario(['coordinador'])).toBe('/dashboard-coordinador')
  }

  C5_profesorODocente() {
    expect(dashboardParaUsuario(['profesor'])).toBe('/dashboard-profesor')
    expect(dashboardParaUsuario(['docente'])).toBe('/dashboard-profesor')
  }

  C6_estudiante() {
    expect(dashboardParaUsuario(['estudiante'])).toBe('/dashboard-estudiante')
  }

  C7_usaTipoUsuario() {
    expect(dashboardParaUsuario([], 'coordinador')).toBe('/dashboard-coordinador')
    expect(dashboardDesdeTipoUsuario(null)).toBe('/dashboard')
    expect(dashboardDesdeTipoUsuario(undefined)).toBe('/dashboard')
  }

  C8_tipoDesconocido() {
    expect(dashboardParaUsuario([], 'desconocido')).toBe('/dashboard')
    expect(dashboardDesdeRolSeleccionado('otro')).toBe('/dashboard')
  }

  C9_prioridadAdmin() {
    expect(dashboardDesdeRoles(['estudiante', 'admin'])).toBe('/dashboard-admin')
    expect(dashboardDesdeRoles([])).toBeNull()
  }

  C10_rolSeleccionado() {
    expect(dashboardDesdeRolSeleccionado('profesor')).toBe('/dashboard-profesor')
    expect(dashboardDesdeRolSeleccionado('docente')).toBe('/dashboard-profesor')
    expect(dashboardDesdeRolSeleccionado('estudiante')).toBe('/dashboard-estudiante')
  }
}

const pruebas = new RQ19RedirigirDashboard()

describe('RQ19 — Redirigir al dashboard según el rol', () => {
  it('C1: sin rol ni tipo → /dashboard', () => pruebas.C1_sinRolNiTipo())
  it('C2: admin → /dashboard-admin', () => pruebas.C2_admin())
  it('C3: decano → /dashboard-decano', () => pruebas.C3_decano())
  it('C4: coordinador → /dashboard-coordinador', () => pruebas.C4_coordinador())
  it('C5: profesor o docente → /dashboard-profesor', () => pruebas.C5_profesorODocente())
  it('C6: estudiante → /dashboard-estudiante', () => pruebas.C6_estudiante())
  it('C7: sin roles usa tipo_usuario', () => pruebas.C7_usaTipoUsuario())
  it('C8: tipo desconocido → /dashboard', () => pruebas.C8_tipoDesconocido())
  it('C9: admin gana si hay varios roles', () => pruebas.C9_prioridadAdmin())
  it('C10: rol seleccionado en el login', () => pruebas.C10_rolSeleccionado())
})
