import { badRequest } from '../../shared/errors'

export function dominioCorreoPorTipo(tipo: string): string {
  return tipo === 'estudiante' ? 'soyudemedellin.edu.co' : 'udemedellin.edu.co'
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
