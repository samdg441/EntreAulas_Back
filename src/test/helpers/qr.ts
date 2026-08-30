import type { ResultadoRegla } from './auth'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function parsearGrupoIds(grupoIds: unknown): ResultadoRegla<{ ids: number[] }> {
  if (!Array.isArray(grupoIds) || grupoIds.length === 0) {
    return { ok: false, status: 400, error: 'Se requiere grupoIds (array de IDs de grupo).' }
  }
  const ids = grupoIds.map((id) => Number(id)).filter((n) => Number.isFinite(n))
  if (ids.length === 0) {
    return { ok: false, status: 400, error: 'grupoIds debe contener números válidos.' }
  }
  return { ok: true, status: 200, data: { ids } }
}

export function coordinadorPuedeOperar(carreraId: number | null | undefined): ResultadoRegla {
  if (!carreraId) {
    return { ok: false, status: 403, error: 'Coordinador sin carrera asignada o no encontrado.' }
  }
  return { ok: true, status: 200 }
}

export function decidirDestinoGrupo(params: {
  grupo: { id: number; profesor_id?: string | null } | undefined
  carreraCoordinador?: number | null
  carreraDelCurso?: number | null
  qrExistente?: { token: string } | null
}): { accion: 'skip'; grupoId: number } | { accion: 'reusar'; grupoId: number; token: string } | { accion: 'crear'; grupoId: number } {
  const grupo = params.grupo
  if (!grupo) return { accion: 'skip', grupoId: 0 }
  if (params.carreraCoordinador != null && params.carreraDelCurso !== params.carreraCoordinador) {
    return { accion: 'skip', grupoId: grupo.id }
  }
  if (!grupo.profesor_id) return { accion: 'skip', grupoId: grupo.id }
  if (params.qrExistente?.token) {
    return { accion: 'reusar', grupoId: grupo.id, token: params.qrExistente.token }
  }
  return { accion: 'crear', grupoId: grupo.id }
}

export function validarCorreoQr(body: {
  to?: string
  subject?: string
  grupoIds?: unknown
}): ResultadoRegla<{ email: string; subject: string; ids: number[] }> {
  const email = String(body.to || '').trim()
  if (!email || !EMAIL_REGEX.test(email)) {
    return { ok: false, status: 400, error: 'Correo de destino inválido.' }
  }
  const subject = String(body.subject || '').trim()
  if (!subject) {
    return { ok: false, status: 400, error: 'El asunto es requerido.' }
  }
  const grupos = parsearGrupoIds(body.grupoIds)
  if (!grupos.ok) return grupos
  return { ok: true, status: 200, data: { email, subject, ids: grupos.data!.ids } }
}

export function smtpEstaConfigurado(env: {
  SMTP_HOST?: string
  SMTP_USER?: string
  SMTP_PASS?: string
  SMTP_FROM?: string
}): boolean {
  return Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS && env.SMTP_FROM)
}

export function filtrarQrsPorCarrera<T extends { curso?: { carrera_id?: number } }>(
  rows: T[],
  carreraId: number | null
): T[] {
  if (carreraId == null) return rows
  return rows.filter((r) => Number(r.curso?.carrera_id) === carreraId)
}

export function resolverTokenQr(params: {
  token?: string
  errorBd?: boolean
  qr?: { activo?: boolean; profesor_id?: number; curso_id?: number; grupo_id?: number } | null
}): ResultadoRegla {
  if (!params.token) {
    return { ok: false, status: 400, error: 'Token requerido.' }
  }
  if (params.errorBd) {
    return { ok: false, status: 500, error: 'Error al resolver el token.' }
  }
  if (!params.qr || params.qr.activo === false) {
    return { ok: false, status: 404, error: 'QR inválido o expirado.' }
  }
  return {
    ok: true,
    status: 200,
    data: {
      profesorId: params.qr.profesor_id,
      cursoId: params.qr.curso_id,
      grupoId: params.qr.grupo_id,
    },
  }
}

export function decidirAutoInscripcion(params: {
  tipoUsuario?: string
  estudiante?: { id: string } | null
  qr?: { grupo_id?: number; activo?: boolean } | null
}): ResultadoRegla<{ grupoId: number }> {
  if (!params.tipoUsuario || params.tipoUsuario !== 'estudiante') {
    return { ok: false, status: 403, error: 'Solo los estudiantes pueden matricularse por QR.' }
  }
  if (!params.estudiante) {
    return { ok: false, status: 404, error: 'No se encontró registro de estudiante para este usuario.' }
  }
  if (!params.qr?.grupo_id || params.qr.activo === false) {
    return { ok: false, status: 404, error: 'QR inválido o expirado.' }
  }
  return { ok: true, status: 200, data: { grupoId: Number(params.qr.grupo_id) } }
}

export function decidirEstadoInscripcion(inscripcion: { id?: number; activa?: boolean } | null): {
  alreadyEnrolled?: boolean
  reactivated?: boolean
  created?: boolean
  status: number
} {
  if (inscripcion?.id && inscripcion.activa === true) {
    return { alreadyEnrolled: true, status: 200 }
  }
  if (inscripcion?.id && inscripcion.activa === false) {
    return { reactivated: true, status: 200 }
  }
  return { created: true, status: 201 }
}
