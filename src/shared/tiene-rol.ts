type UsuarioConRol = {
  tipo_usuario?: string
  roles?: string[]
}

export function tieneRol(user: UsuarioConRol | null | undefined, rol: string): boolean {
  if (!user) return false
  const roles = new Set((user.roles || []).map((item) => item.toLowerCase()))
  const tipo = (user.tipo_usuario || '').toLowerCase()
  if (tipo) roles.add(tipo)
  if (rol === 'profesor' || rol === 'docente') {
    return roles.has('profesor') || roles.has('docente')
  }
  return roles.has(rol.toLowerCase())
}
