import { supabaseAdmin } from '../../config/supabase-only'
import { many } from '../../shared/supabase-result'
import { sinVencer } from './qr-resolucion'

const QR_RESOLVE_SELECT = `
  id,
  token,
  profesor_id,
  curso_id,
  grupo_id,
  periodo_id,
  expires_at,
  profesor:profesores(
    id,
    usuario:usuarios(
      nombre,
      apellido
    )
  ),
  curso:cursos(
    id,
    nombre,
    codigo
  ),
  grupo:grupos(
    id,
    numero_grupo,
    horario,
    aula
  )
`

export class QrRepository {
  async listActivosByGrupoIds(grupoIds: number[]) {
    const { data, error } = await supabaseAdmin
      .from('qr_evaluaciones')
      .select('grupo_id, token, profesor_id, expires_at')
      .eq('activo', true)
      .in('grupo_id', grupoIds)
    return sinVencer(many(data, error))
  }

  async listActivosParaShare(grupoIds: number[]) {
    const { data, error } = await supabaseAdmin
      .from('qr_evaluaciones')
      .select(`
        grupo_id,
        token,
        curso_id,
        expires_at,
        curso:cursos(id, nombre, codigo, carrera_id),
        grupo:grupos(id, numero_grupo),
        profesor:profesores(id, usuario:usuarios(nombre, apellido))
      `)
      .eq('activo', true)
      .in('grupo_id', grupoIds)
    return sinVencer(many(data, error))
  }

  async findActivoByToken(token: string) {
    const { data, error } = await supabaseAdmin
      .from('qr_evaluaciones')
      .select(QR_RESOLVE_SELECT)
      .eq('token', token)
      .eq('activo', true)
      .maybeSingle()
    if (error) throw error
    return data
  }

  async findActivoGrupoByToken(token: string) {
    const { data, error } = await supabaseAdmin
      .from('qr_evaluaciones')
      .select('id, token, grupo_id, activo, expires_at')
      .eq('token', token)
      .eq('activo', true)
      .maybeSingle()
    if (error) throw error
    return data
  }

  async insert(row: Record<string, unknown>) {
    const { error } = await supabaseAdmin.from('qr_evaluaciones').insert(row)
    if (error) throw error
  }
}

export const qrRepository = new QrRepository()
