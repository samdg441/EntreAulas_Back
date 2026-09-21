import { SupabaseDB } from '../../config/supabase-only'

type ProfessorFilters = {
  profesor_id?: string
  periodo_gte?: string
  periodo_lte?: string
  periodo_id?: number | string | null
  grupo_id?: number | string | null
}

function hasDateRange(filters: ProfessorFilters) {
  return Boolean(filters.periodo_gte && filters.periodo_lte)
}

function hasPeriodoId(filters: ProfessorFilters) {
  return filters.periodo_id !== undefined && filters.periodo_id !== null
}

function hasGrupoId(filters: ProfessorFilters) {
  return filters.grupo_id !== undefined && filters.grupo_id !== null
}

async function resolveProfesorId(usuarioId: unknown): Promise<string> {
  if (!usuarioId) {
    console.error('❌ [AI Routes] profesor_id es requerido')
    throw new Error('profesor_id es requerido')
  }

  console.log(`   🔍 Convertiendo usuario_id (${usuarioId}) a profesor.id...`)
  const { data: profesor, error: profError } = await SupabaseDB.supabaseAdmin
    .from('profesores')
    .select('id')
    .eq('usuario_id', usuarioId)
    .eq('activo', true)
    .single()

  if (profError || !profesor) {
    console.error('❌ [AI Routes] Error buscando profesor por usuario_id:', profError)
    throw new Error(`No se encontró profesor activo para usuario_id: ${usuarioId}`)
  }

  console.log(`   ✅ Profesor encontrado: id = ${profesor.id} (desde usuario_id = ${usuarioId})`)
  return profesor.id
}

function applyEvaluationFilters(query: any, filters: ProfessorFilters) {
  if (hasDateRange(filters)) {
    console.log('   ✅ Filtro por rango de fechas =', filters.periodo_gte, 'a', filters.periodo_lte)
    return query.gte('fecha_creacion', filters.periodo_gte).lte('fecha_creacion', filters.periodo_lte)
  }
  if (hasPeriodoId(filters)) {
    console.log('   ✅ Filtro periodo_id =', filters.periodo_id)
    return query.eq('periodo_id', filters.periodo_id)
  }
  console.log('   ℹ️  No se aplicó filtro de periodo_id (buscando todos los períodos)')
  return query
}

function applyGrupoFilter(query: any, filters: ProfessorFilters) {
  if (!hasGrupoId(filters)) return query
  console.log('   ✅ Filtro grupo_id =', filters.grupo_id)
  return query.eq('grupo_id', filters.grupo_id)
}

async function fetchEvaluacionIds(profesorIdReal: string, filters: ProfessorFilters): Promise<string[]> {
  console.log(`   ✅ Buscando por profesor_id = ${profesorIdReal}`)
  let query = SupabaseDB.supabaseAdmin.from('evaluaciones').select('id').eq('profesor_id', profesorIdReal)
  query = applyEvaluationFilters(query, filters)
  query = applyGrupoFilter(query, filters)

  const { data: evaluaciones, error: evalError } = await query
  if (evalError) {
    console.error('❌ [AI Routes] Error buscando evaluaciones:', evalError)
    throw evalError
  }

  const evaluacionIds = (evaluaciones || []).map((e: { id: string }) => e.id)
  console.log(`   ✅ Encontradas ${evaluacionIds.length} evaluaciones para profesor_id = ${profesorIdReal}`)
  return evaluacionIds
}

function textoAbiertoValido(respuesta: unknown): string | null {
  if (!respuesta) return null
  const texto = String(respuesta).trim()
  if (texto.length < 3) return null
  return texto
}

function extractValidTexts(respuestas: Array<{ respuesta_texto?: unknown }> | null): string[] {
  const texts: string[] = []
  for (const row of respuestas || []) {
    const texto = textoAbiertoValido(row?.respuesta_texto)
    if (!texto) continue
    texts.push(texto)
    if (texts.length <= 5) {
      const preview = texto.length > 60 ? `${texto.substring(0, 60)}...` : texto
      console.log(`   📝 Respuesta ${texts.length}: "${preview}"`)
    }
  }
  return texts
}

function buildDebugSql(profesorIdReal: string, filters: ProfessorFilters): string {
  let sqlWhere = `WHERE 
  e.profesor_id = '${profesorIdReal}'`
  if (hasDateRange(filters)) {
    sqlWhere += `\n  AND e.fecha_creacion BETWEEN '${filters.periodo_gte}' AND '${filters.periodo_lte}'`
  } else if (filters.periodo_id) {
    sqlWhere += `\n  AND e.periodo_id = ${filters.periodo_id}`
  }

  return `SELECT 
  e.id AS evaluacion_id,
  e.carrera_id,
  e.profesor_id,
  re.id AS respuesta_id,
  re.respuesta_texto,
  re.respuesta_rating
FROM evaluaciones e
INNER JOIN respuestas_evaluacion re 
  ON re.evaluacion_id = e.id
${sqlWhere}
  AND re.respuesta_texto IS NOT NULL
  AND TRIM(re.respuesta_texto) != ''
  AND LENGTH(TRIM(re.respuesta_texto)) >= 3
ORDER BY e.id, re.id;`
}

function logSinEvaluaciones(periodoId: ProfessorFilters['periodo_id']) {
  const sufijo = periodoId ? ` en el período ${periodoId}` : ''
  console.log(`   ⚠️ No hay evaluaciones para este profesor${sufijo}`)
}

function logOpenTextsResult(texts: string[], profesorIdReal: string, filters: ProfessorFilters) {
  console.log(`✅ [AI Routes] Respuestas válidas encontradas: ${texts.length}`)
  const sqlCommand = buildDebugSql(profesorIdReal, filters)
  if (texts.length === 0) {
    console.log('\n⚠️  NO SE ENCONTRARON RESPUESTAS ABIERTAS VÁLIDAS')
    console.log('📋 SQL para verificar en Supabase:')
    console.log(sqlCommand)
  } else {
    console.log('✅ Respuestas encontradas correctamente')
  }
  console.log('🔍 [AI Routes] ========================================\n')
}

export async function fetchOpenTextsByFilters(filters: ProfessorFilters): Promise<string[]> {
  console.log('\n🔍 [AI Routes] ========================================')
  console.log('🔍 [AI Routes] Buscando respuestas abiertas con filtros:', JSON.stringify(filters, null, 2))

  const profesorIdReal = await resolveProfesorId(filters.profesor_id)
  const evaluacionIds = await fetchEvaluacionIds(profesorIdReal, filters)
  if (evaluacionIds.length === 0) {
    logSinEvaluaciones(filters.periodo_id)
    return []
  }

  console.log(`   ✅ Total de ${evaluacionIds.length} evaluaciones a procesar`)
  const { data: respuestas, error: respError } = await SupabaseDB.supabaseAdmin
    .from('respuestas_evaluacion')
    .select('id, evaluacion_id, respuesta_texto, respuesta_rating')
    .in('evaluacion_id', evaluacionIds)
    .not('respuesta_texto', 'is', null)

  if (respError) {
    console.error('❌ [AI Routes] Error buscando respuestas:', respError)
    throw respError
  }

  console.log(`📊 [AI Routes] Encontradas ${respuestas?.length || 0} respuestas con texto (antes de filtrar)`)
  const texts = extractValidTexts(respuestas)
  logOpenTextsResult(texts, profesorIdReal, filters)
  return texts
}

export async function fetchRatingsByFilters(filters: ProfessorFilters): Promise<number[]> {
  const profesorIdReal = await resolveProfesorId(filters.profesor_id)
  const evaluacionIds = await fetchEvaluacionIds(profesorIdReal, filters)
  if (evaluacionIds.length === 0) return []

  const { data: respuestas, error: respError } = await SupabaseDB.supabaseAdmin
    .from('respuestas_evaluacion')
    .select('respuesta_rating')
    .in('evaluacion_id', evaluacionIds)
    .not('respuesta_rating', 'is', null)

  if (respError) throw respError

  return (respuestas || [])
    .map((r: { respuesta_rating?: unknown }) => Number(r.respuesta_rating))
    .filter((n: number) => Number.isFinite(n) && n >= 1 && n <= 5)
}
