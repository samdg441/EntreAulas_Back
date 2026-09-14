import { academicRepository } from '../academic/academic.repository'
import { qrRepository } from './qr.repository'
import { AppError, badRequest, forbidden, internal, notFound } from '../../shared/errors'

export type ResultadoAutoEnroll = {
  status: 200 | 201
  body: {
    enrolled: boolean
    alreadyEnrolled?: boolean
    reactivated?: boolean
    created?: boolean
    estudianteId: unknown
    grupoId: number
  }
}

export async function autoEnrollPorQr(
  token: unknown,
  user: { id?: string; tipo_usuario?: string } | null | undefined
): Promise<ResultadoAutoEnroll> {
  if (!token) throw badRequest('Token requerido.')
  if (!esEstudiante(user)) {
    throw forbidden('Solo los estudiantes pueden matricularse por QR.')
  }

  const estudiante = await academicRepository.findEstudianteByUsuarioId(user.id)
  if (!estudiante) {
    throw notFound('No se encontró registro de estudiante para este usuario.')
  }

  const grupoId = await grupoIdDesdeQr(String(token))
  return aplicarInscripcion(estudiante.id, grupoId)
}

function esEstudiante(
  user: { id?: string; tipo_usuario?: string } | null | undefined
): user is { id: string; tipo_usuario: string } {
  return Boolean(user?.id) && user.tipo_usuario === 'estudiante'
}

async function grupoIdDesdeQr(token: string): Promise<number> {
  try {
    const qrRow = await qrRepository.findActivoGrupoByToken(token)
    if (!qrRow?.grupo_id) throw notFound('QR inválido o expirado.')
    return Number(qrRow.grupo_id)
  } catch (error) {
    if (error instanceof AppError) throw error
    throw internal('Error resolviendo el QR.')
  }
}

async function buscarInscripcion(estudianteId: string, grupoId: number) {
  try {
    return await academicRepository.findInscripcion(estudianteId, grupoId)
  } catch {
    throw internal('Error validando inscripción existente.')
  }
}

async function inscripcionPrevia(
  estudianteId: string,
  grupoId: number,
  insc: { id: string | number; activa?: boolean }
): Promise<ResultadoAutoEnroll> {
  if (insc.activa === true) {
    return {
      status: 200,
      body: { enrolled: false, alreadyEnrolled: true, estudianteId, grupoId },
    }
  }

  try {
    await academicRepository.reactivateInscripcion(insc.id)
  } catch {
    throw internal('No se pudo reactivar la inscripción existente.')
  }

  return {
    status: 200,
    body: { enrolled: true, reactivated: true, estudianteId, grupoId },
  }
}

async function crearInscripcion(estudianteId: string, grupoId: number): Promise<ResultadoAutoEnroll> {
  try {
    await academicRepository.insertInscripcion(estudianteId, grupoId)
  } catch {
    throw internal('No se pudo crear la inscripción automática.')
  }
  return {
    status: 201,
    body: { enrolled: true, created: true, estudianteId, grupoId },
  }
}

async function aplicarInscripcion(estudianteId: string, grupoId: number): Promise<ResultadoAutoEnroll> {
  const insc = await buscarInscripcion(estudianteId, grupoId)
  if (insc?.id) return inscripcionPrevia(estudianteId, grupoId, insc)
  return crearInscripcion(estudianteId, grupoId)
}
