export function proyectarUsuarioPublico<T extends Record<string, unknown>>(
  user: { id: string; email: string; nombre: string; apellido: string; tipo_usuario: string },
  extra?: T
) {
  return {
    id: user.id,
    email: user.email,
    nombre: user.nombre,
    apellido: user.apellido,
    tipo_usuario: user.tipo_usuario,
    ...extra
  }
}
