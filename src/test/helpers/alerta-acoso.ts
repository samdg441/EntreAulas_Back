export const ROLES_ALERTA_ACOSO = ['coordinador', 'decano', 'admin'] as const

export function rolPuedeVerAlertaCarrera(tipoUsuario?: string): boolean {
  return Boolean(tipoUsuario && (ROLES_ALERTA_ACOSO as readonly string[]).includes(tipoUsuario))
}

export function normalizeText(text: string): string {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
}

const KEYWORDS_SERVICIO = [
  'acoso',
  'harassment',
  'hostigamiento',
  'abus',
  'maltrato',
  'intimidacion',
  'inapropiado',
  'inadecuado',
  'abusivo',
  'violencia',
  'amenaza',
  'amenaz',
  'miedo',
  'temor',
  'inseguro',
  'insegura',
  'incomodo',
  'disgusto',
  'verguenza',
  'humillacion',
  'humillar',
  'denunciar',
  'queja grave',
  'comportamiento inapropiado',
  'comentario inapropiado',
  'tocamiento',
  'tocar',
  'agresion',
  'agredir',
  'ofensa sexual',
  'insinuacion',
  'insinuar',
].map(normalizeText)

const KEYWORDS_CARRERA = [
  'acoso',
  'hostigamiento',
  'abus',
  'maltrato',
  'intimidacion',
  'inapropiado',
  'violencia',
  'amenaza',
  'miedo',
  'temor',
  'humillacion',
  'tocamiento',
  'agresion',
  'insinuacion',
].map(normalizeText)

export function textoTieneIndicioAcoso(texto: string, keywords: string[] = KEYWORDS_SERVICIO): boolean {
  const low = normalizeText(texto)
  return keywords.some((k) => low.includes(k))
}

export function detectarAcosoEnTextos(texts: string[]) {
  const textosConAcoso = texts.filter((t) => textoTieneIndicioAcoso(t, KEYWORDS_SERVICIO))
  const acosoDetectado = textosConAcoso.length > 0
  if (!acosoDetectado) {
    return { acosoDetectado: false, mensajeAcoso: undefined as string | undefined, textosConAcoso }
  }
  const ejemplos = textosConAcoso
    .slice(0, 5)
    .map((t) => String(t).trim().replace(/\s+/g, ' '))
  const ejemplosTexto = ejemplos.length > 0 ? `\nEjemplos detectados:\n- ${ejemplos.join('\n- ')}` : ''
  return {
    acosoDetectado: true,
    mensajeAcoso: `⚠️ ALERTA: Se detectaron menciones que podrían referirse a situaciones de acoso o comportamiento inapropiado en ${textosConAcoso.length} respuesta(s). Se recomienda revisar estas respuestas inmediatamente y tomar las acciones correspondientes según los protocolos institucionales.${ejemplosTexto}`,
    textosConAcoso,
  }
}

export type RespuestaCarrera = {
  evaluacion_id: string
  profesor_id: string
  profesorNombre: string
  respuesta_texto: string
}

export function construirAcosoProfesores(respuestas: RespuestaCarrera[]) {
  const porProfesor = new Map<string, { nombre: string; count: number; ejemplos: string[] }>()
  for (const r of respuestas) {
    const texto = String(r.respuesta_texto || '').trim()
    if (texto.length < 3) continue
    if (!textoTieneIndicioAcoso(texto, KEYWORDS_CARRERA)) continue
    const prev = porProfesor.get(r.profesor_id) || { nombre: r.profesorNombre, count: 0, ejemplos: [] }
    prev.count += 1
    if (prev.ejemplos.length < 2) prev.ejemplos.push(texto.slice(0, 160))
    porProfesor.set(r.profesor_id, prev)
  }
  return Array.from(porProfesor.entries())
    .map(([profesorId, data]) => ({
      profesorId,
      nombre: data.nombre,
      menciones: data.count,
      ejemplos: data.ejemplos,
    }))
    .sort((a, b) => b.menciones - a.menciones)
}

export function decidirResumenByCareer(params: {
  autenticado: boolean
  tipoUsuario?: string
  texts: string[]
  respuestas?: RespuestaCarrera[]
}): {
  ok: boolean
  status: number
  error?: string
  code?: string
  data?: {
    textsCount: number
    summary: string
    topics: string[]
    acosoDetectado: boolean
    mensajeAcoso?: string
    acosoProfesores: ReturnType<typeof construirAcosoProfesores>
  }
} {
  if (!params.autenticado) {
    return { ok: false, status: 401, error: 'Token de acceso requerido', code: 'NO_TOKEN' }
  }
  if (!rolPuedeVerAlertaCarrera(params.tipoUsuario)) {
    return { ok: false, status: 403, error: 'Permisos insuficientes', code: 'FORBIDDEN_ROLE' }
  }

  const deteccion = detectarAcosoEnTextos(params.texts)
  const acosoProfesores = construirAcosoProfesores(params.respuestas ?? [])

  return {
    ok: true,
    status: 200,
    data: {
      textsCount: params.texts.length,
      summary:
        params.texts.length === 0
          ? 'No se encontraron respuestas abiertas válidas para esta carrera.'
          : `Resumen de ${params.texts.length} comentarios de la carrera.`,
      topics: params.texts.length === 0 ? [] : ['carrera'],
      acosoDetectado: deteccion.acosoDetectado,
      mensajeAcoso: deteccion.mensajeAcoso,
      acosoProfesores,
    },
  }
}
