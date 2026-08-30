import { describe, expect, it } from 'vitest'
import { dashboardDesdeRolSeleccionado, dashboardParaUsuario } from '../helpers/dashboard'

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
  }

  C8_tipoDesconocido() {
    expect(dashboardParaUsuario([], 'desconocido')).toBe('/dashboard')
    expect(dashboardDesdeRolSeleccionado('otro')).toBe('/dashboard')
  }

  FALLA_C6_estudianteVaAAdmin() {
    expect(dashboardParaUsuario(['estudiante'])).toBe('/dashboard-admin')
  }

  FALLA_C8_desconocidoVaAProfesor() {
    expect(dashboardParaUsuario([], 'desconocido')).toBe('/dashboard-profesor')
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
  it('FALLA C6: estudiante — se espera (mal) /dashboard-admin', () =>
    pruebas.FALLA_C6_estudianteVaAAdmin())
  it('FALLA C8: desconocido — se espera (mal) /dashboard-profesor', () =>
    pruebas.FALLA_C8_desconocidoVaAProfesor())
})
