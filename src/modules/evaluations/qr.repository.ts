import { supabaseAdmin } from '../../config/supabase-only'
import { many } from '../../shared/supabase-result'

const QR_RESOLVE_SELECT = `
  id,
  token,
  profesor_id,
  curso_id,
  grupo_id,
  periodo_id,
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
      .select('grupo_id, token, profesor_id')
      .eq('activo', true)
      .in('grupo_id', grupoIds)
    return many(data, error)
  }

  async listActivosParaShare(grupoIds: number[]) {
    const { data, error } = await supabaseAdmin
      .from('qr_evaluaciones')
      .select(`
        grupo_id,
        token,
        curso_id,
        curso:cursos(id, nombre, codigo, carrera_id),
        grupo:grupos(id, numero_grupo),
        profesor:profesores(id, usuario:usuarios(nombre, apellido))
      `)
      .eq('activo', true)
      .in('grupo_id', grupoIds)
    return many(data, error)
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
      .select('id, token, grupo_id, activo')
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
