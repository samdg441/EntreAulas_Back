import { badRequest } from '../../shared/errors'

export function dominioCorreoPorTipo(tipo: string): string {
  return tipo === 'estudiante' ? 'soyudemedellin.edu.co' : 'udemedellin.edu.co'
}

export function dominioCorreoPorRoles(roles: string[]): string {
  return roles.includes('estudiante') ? 'soyudemedellin.edu.co' : 'udemedellin.edu.co'
}

export function normalizarCorreoInstitucional(email: unknown, tipo: unknown): string {
  if (typeof email !== 'string' || typeof tipo !== 'string' || !tipo.trim()) {
    throw badRequest('El correo institucional no es válido')
  }

  const normalizado = email.trim().toLowerCase()
  const dominio = dominioCorreoPorTipo(tipo)
  const partes = normalizado.split('@')
  const local = partes[0] || ''
  if (partes.length !== 2 || !/^[a-z0-9._+-]+$/.test(local) || partes[1] !== dominio) {
    throw badRequest(
      tipo === 'estudiante'
        ? 'El correo del estudiante debe terminar en @soyudemedellin.edu.co'
        : 'El correo debe terminar en @udemedellin.edu.co'
    )
  }

  return normalizado
}

export function normalizarCorreoPorRoles(email: unknown, roles: string[]): string {
  if (!Array.isArray(roles) || roles.length === 0) {
    throw badRequest('Selecciona al menos un rol')
  }
  if (typeof email !== 'string') {
    throw badRequest('El correo institucional no es válido')
  }

  const normalizado = email.trim().toLowerCase()
  const dominio = dominioCorreoPorRoles(roles)
  const partes = normalizado.split('@')
  const local = partes[0] || ''
  if (partes.length !== 2 || !/^[a-z0-9._+-]+$/.test(local) || partes[1] !== dominio) {
    throw badRequest(
      roles.includes('estudiante')
        ? 'Si el usuario tiene rol estudiante, el correo debe terminar en @soyudemedellin.edu.co'
        : 'El correo debe terminar en @udemedellin.edu.co'
    )
  }

  return normalizado
}
