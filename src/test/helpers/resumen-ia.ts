import { AiService } from '../../modules/ai-summary/ai.service'

export const ROLES_RESUMEN_IA = ['docente', 'profesor', 'coordinador', 'decano', 'admin'] as const

export function rolPuedeResumir(tipoUsuario?: string): boolean {
  return Boolean(tipoUsuario && (ROLES_RESUMEN_IA as readonly string[]).includes(tipoUsuario))
}

export function resumenLocal(texts: string[]) {
  if (texts.length === 0) {
    return {
      summary: 'No hay respuestas para resumir.',
      topics: [] as string[],
      analysisSource: 'open_text' as const,
    }
  }
  const joined = texts.join(' ').toLowerCase()
  const topics = ['claridad', 'metodologia', 'retroalimentacion'].filter((t) =>
    joined.normalize('NFD').replace(/\p{Diacritic}/gu, '').includes(t)
  )
  return {
    summary: `Resumen local a partir de ${texts.length} respuestas abiertas. ${
      joined.includes('claro') || joined.includes('excelente')
        ? 'Estado general favorable en la percepción estudiantil.'
        : 'Estado general regular con oportunidades de mejora.'
    }`,
    topics: topics.length > 0 ? topics : ['comentarios abiertos'],
    analysisSource: 'open_text' as const,
  }
}

export const AVISO_SIN_DATOS =
  'No se encontraron respuestas abiertas para este profesor en el período seleccionado. Verifica en Supabase ejecutando el SQL que aparece en la consola del servidor.'

export function decidirResumenByProfessor(params: {
  autenticado: boolean
  tipoUsuario?: string
  userId?: string
  profesorId?: string
  texts?: string[]
  ratings?: number[]
  geminiOk?: boolean
  geminiSummary?: string
  geminiTopics?: string[]
}): {
  ok: boolean
  status: number
  error?: string
  code?: string
  data?: {
    textsCount: number
    ratingsCount?: number
    summary: string
    topics: string[]
    analysisSource?: 'open_text' | 'quantitative_fallback'
  }
} {
  if (!params.autenticado) {
    return { ok: false, status: 401, error: 'Token de acceso requerido', code: 'NO_TOKEN' }
  }
  if (!rolPuedeResumir(params.tipoUsuario)) {
    return { ok: false, status: 403, error: 'Permisos insuficientes', code: 'FORBIDDEN_ROLE' }
  }
  if (!params.profesorId) {
    return { ok: false, status: 400, error: 'profesor_id es requerido' }
  }
  if (params.tipoUsuario === 'profesor' && params.userId && params.userId !== String(params.profesorId)) {
    return { ok: false, status: 403, error: 'No autorizado' }
  }

  const texts = params.texts ?? []
  const ratings = params.ratings ?? []

  if (texts.length === 0) {
    if (ratings.length > 0) {
      const quantitative = AiService.summarizeFromRatings(ratings, 'profesor')
      return {
        ok: true,
        status: 200,
        data: {
          textsCount: 0,
          ratingsCount: ratings.length,
          ...quantitative,
        },
      }
    }
    return {
      ok: true,
      status: 200,
      data: { textsCount: 0, summary: AVISO_SIN_DATOS, topics: [] },
    }
  }

  if (params.geminiOk && params.geminiSummary) {
    return {
      ok: true,
      status: 200,
      data: {
        textsCount: texts.length,
        summary: params.geminiSummary,
        topics: params.geminiTopics ?? [],
        analysisSource: 'open_text',
      },
    }
  }

  return {
    ok: true,
    status: 200,
    data: { textsCount: texts.length, ...resumenLocal(texts) },
  }
}
