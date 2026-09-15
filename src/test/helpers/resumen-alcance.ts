import { AiService } from '../../modules/ai-summary/ai.service'
import type { SummaryContext } from '../../modules/ai-summary/ai.types'
import {
  assertProfessorSelfAccess,
  careerQuantitativePayload,
  extractFacultyOpenTexts,
  extractValidOpenTexts,
} from '../../modules/ai-summary/ai.routes'
import { AppError } from '../../shared/errors'

/** RQ30 — el alcance decide endpoint, roles y el contexto que ve la IA. */
export type AlcanceResumen = 'profesor' | 'carrera' | 'facultad'

export const ROLES_POR_ALCANCE: Record<AlcanceResumen, readonly string[]> = {
  profesor: ['docente', 'profesor', 'coordinador', 'decano', 'admin'],
  carrera: ['coordinador', 'decano', 'admin'],
  facultad: ['decano', 'admin'],
}

export const AVISO_POR_ALCANCE: Record<AlcanceResumen, string> = {
  profesor:
    'No se encontraron respuestas abiertas para este profesor en el período seleccionado. Verifica en Supabase ejecutando el SQL que aparece en la consola del servidor.',
  carrera: 'No se encontraron respuestas abiertas válidas para esta carrera.',
  facultad:
    'No se encontraron respuestas abiertas válidas para la facultad en el período seleccionado.',
}

export function endpointPorAlcance(alcance: AlcanceResumen) {
  if (alcance === 'profesor') return '/api/ai/summarize/by-professor'
  if (alcance === 'carrera') return '/api/ai/summarize/by-career'
  return '/api/ai/summarize/by-faculty'
}

/** El rol autorizado pide el alcance que le corresponde por defecto. */
export function alcanceNaturalDelRol(tipoUsuario: string): AlcanceResumen {
  if (tipoUsuario === 'decano' || tipoUsuario === 'admin') return 'facultad'
  if (tipoUsuario === 'coordinador') return 'carrera'
  return 'profesor'
}

export function contextoIaDelAlcance(alcance: AlcanceResumen): SummaryContext {
  if (alcance === 'carrera') return 'coordinador'
  if (alcance === 'facultad') return 'decano'
  return 'profesor'
}

export function rolPuedePedirAlcance(tipoUsuario: string | undefined, alcance: AlcanceResumen) {
  return Boolean(tipoUsuario && ROLES_POR_ALCANCE[alcance].includes(tipoUsuario))
}

export function fraseDelAlcanceEnResumen(summary: string, alcance: AlcanceResumen) {
  if (alcance === 'profesor') return summary.includes('del docente')
  if (alcance === 'carrera') return summary.includes('de los docentes de la carrera')
  return summary.includes('de los docentes de la facultad')
}

function textosDelAlcance(
  alcance: AlcanceResumen,
  respuestas: Array<{ respuesta_texto?: unknown }>,
) {
  if (alcance === 'facultad') return extractFacultyOpenTexts(respuestas)
  return extractValidOpenTexts(respuestas)
}

export type ResultadoResumenAlcance =
  | { ok: false; status: number; error: string; code?: string }
  | {
      ok: true
      status: 200
      data: {
        alcance: AlcanceResumen
        endpoint: string
        textsCount: number
        ratingsCount?: number
        summary: string
        topics: string[]
        analysisSource?: 'open_text' | 'quantitative_fallback'
        lowPerformers?: unknown[]
      }
    }

/**
 * Orquesta el mismo criterio que las tres rutas de resumen agregado:
 * auth → rol del alcance → (profesor: no consulta a otro) → textos o fallback.
 * No toca repositorio: recibe las filas ya leídas.
 */
export function decidirResumenPorAlcance(params: {
  autenticado: boolean
  tipoUsuario?: string
  userId?: string
  alcance: AlcanceResumen
  profesorId?: string
  respuestas?: Array<{ respuesta_texto?: unknown }>
  ratings?: number[]
  evaluaciones?: Array<{ profesor_id?: unknown; calificacion_promedio?: unknown }>
  nombresDocentes?: Map<string, string>
}): ResultadoResumenAlcance {
  if (!params.autenticado) {
    return { ok: false, status: 401, error: 'Token de acceso requerido', code: 'NO_TOKEN' }
  }
  if (!rolPuedePedirAlcance(params.tipoUsuario, params.alcance)) {
    return { ok: false, status: 403, error: 'Permisos insuficientes', code: 'FORBIDDEN_ROLE' }
  }

  if (params.alcance === 'profesor') {
    if (!params.profesorId) {
      return { ok: false, status: 400, error: 'profesor_id es requerido' }
    }
    try {
      assertProfessorSelfAccess(
        { tipo_usuario: params.tipoUsuario, id: params.userId },
        params.profesorId,
      )
    } catch (e) {
      const err = e as AppError
      return { ok: false, status: err.status ?? 403, error: err.message, code: 'FORBIDDEN' }
    }
  }

  const texts = textosDelAlcance(params.alcance, params.respuestas ?? [])
  const contexto = contextoIaDelAlcance(params.alcance)

  if (texts.length > 0) {
    return {
      ok: true,
      status: 200,
      data: {
        alcance: params.alcance,
        endpoint: endpointPorAlcance(params.alcance),
        textsCount: texts.length,
        summary: `Resumen de ${texts.length} comentarios abiertos (${contexto}).`,
        topics: texts.slice(0, 3).map((t) => t.slice(0, 24)),
        analysisSource: 'open_text',
      },
    }
  }

  const ratings = (params.ratings ?? []).filter((n) => Number.isFinite(n) && n >= 1 && n <= 5)
  if (ratings.length > 0 && params.alcance === 'carrera') {
    const payload = careerQuantitativePayload(
      ratings,
      params.evaluaciones ?? [],
      params.nombresDocentes ?? new Map(),
      [],
    )
    return {
      ok: true,
      status: 200,
      data: {
        alcance: 'carrera',
        endpoint: endpointPorAlcance('carrera'),
        ...payload,
      },
    }
  }

  if (ratings.length > 0) {
    const quantitative = AiService.summarizeFromRatings(ratings, contexto)
    return {
      ok: true,
      status: 200,
      data: {
        alcance: params.alcance,
        endpoint: endpointPorAlcance(params.alcance),
        textsCount: 0,
        ratingsCount: ratings.length,
        ...quantitative,
      },
    }
  }

  return {
    ok: true,
    status: 200,
    data: {
      alcance: params.alcance,
      endpoint: endpointPorAlcance(params.alcance),
      textsCount: 0,
      summary: AVISO_POR_ALCANCE[params.alcance],
      topics: [],
    },
  }
}
