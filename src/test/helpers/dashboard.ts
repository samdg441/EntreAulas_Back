export function dashboardDesdeRoles(roles: string[]): string | null {
  if (roles.includes('admin')) return '/dashboard-admin'
  if (roles.includes('decano')) return '/dashboard-decano'
  if (roles.includes('coordinador')) return '/dashboard-coordinador'
  if (roles.includes('profesor') || roles.includes('docente')) return '/dashboard-profesor'
  if (roles.includes('estudiante')) return '/dashboard-estudiante'
  return null
}

export function dashboardDesdeTipoUsuario(tipoUsuario: string | undefined | null): string {
  const t = (tipoUsuario || '').toLowerCase()
  if (t === 'admin') return '/dashboard-admin'
  if (t === 'decano') return '/dashboard-decano'
  if (t === 'coordinador') return '/dashboard-coordinador'
  if (t === 'profesor' || t === 'docente') return '/dashboard-profesor'
  if (t === 'estudiante') return '/dashboard-estudiante'
  return '/dashboard'
}

export function dashboardParaUsuario(roles: string[], tipoUsuario?: string | null): string {
  return dashboardDesdeRoles(roles) ?? dashboardDesdeTipoUsuario(tipoUsuario)
}

export function dashboardDesdeRolSeleccionado(selectedRole: string): string {
  switch (selectedRole) {
    case 'estudiante':
      return '/dashboard-estudiante'
    case 'profesor':
    case 'docente':
      return '/dashboard-profesor'
    case 'coordinador':
      return '/dashboard-coordinador'
    case 'decano':
      return '/dashboard-decano'
    case 'admin':
      return '/dashboard-admin'
    default:
      return '/dashboard'
  }
}
