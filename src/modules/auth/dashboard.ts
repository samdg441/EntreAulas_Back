const MAPA: Record<string, string> = {
  estudiante: '/dashboard-estudiante',
  profesor: '/dashboard-profesor',
  docente: '/dashboard-profesor',
  coordinador: '/dashboard-coordinador',
  decano: '/dashboard-decano',
  admin: '/dashboard-admin',
}

export function dashboardDesdeRoles(roles: string[]): string | null {
  if (roles.includes('admin')) return MAPA.admin
  if (roles.includes('decano')) return MAPA.decano
  if (roles.includes('coordinador')) return MAPA.coordinador
  if (roles.includes('profesor') || roles.includes('docente')) return MAPA.profesor
  if (roles.includes('estudiante')) return MAPA.estudiante
  return null
}

export function dashboardDesdeTipoUsuario(tipoUsuario: string | undefined | null): string {
  const t = (tipoUsuario || '').toLowerCase()
  return MAPA[t] || '/dashboard'
}

export function dashboardParaUsuario(roles: string[], tipoUsuario?: string | null): string {
  return dashboardDesdeRoles(roles) ?? dashboardDesdeTipoUsuario(tipoUsuario)
}

export function dashboardDesdeRolSeleccionado(selectedRole: string): string {
  return MAPA[selectedRole] || '/dashboard'
}
