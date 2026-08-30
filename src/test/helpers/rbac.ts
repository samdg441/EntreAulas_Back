export function extraerBearer(authorization: string | undefined): string | null {
  if (!authorization?.startsWith('Bearer ')) return null
  const token = authorization.slice(7).trim()
  return token || null
}

export function usuarioPuedeAutenticarse(user: { activo?: boolean } | null | undefined): boolean {
  return Boolean(user && user.activo)
}

export function usuarioTieneAlgunRol(
  user: { roles?: string[]; tipo_usuario?: string } | undefined,
  rolesRequeridos: string[]
): boolean {
  if (!user) return false
  return (
    Boolean(user.roles?.some((rol) => rolesRequeridos.includes(rol))) ||
    Boolean(user.tipo_usuario && rolesRequeridos.includes(user.tipo_usuario))
  )
}
