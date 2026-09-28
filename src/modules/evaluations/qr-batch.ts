import { randomUUID } from 'node:crypto'
import { SupabaseDB } from '../../config/supabase-only'
import { RoleService } from '../auth/role.service'
import { academicRepository } from '../academic/academic.repository'
import { qrRepository } from './qr.repository'
import { forbidden, internal, badRequest } from '../../shared/errors'

type GrupoBatch = {
  id: number
  curso_id?: unknown
  profesor_id?: unknown
  asignacion_profesor_id?: unknown
}

type ItemCreado = { status: 'created'; grupoId: number; token: string }
type ItemOmitido = { status: 'skipped'; grupoId: number; reason: string }
type ItemBatch = ItemCreado | ItemOmitido

type ContextoGrupo = {
  grupoId: number
  grupoById: Map<number, GrupoBatch>
  allowedCursoIds: Set<number> | null
  asignacionByGrupoId: Map<number, { profesor_id?: unknown; curso_id?: unknown; grupo_id?: unknown }>
  existingByGrupoId: Map<number, { token?: string; profesor_id?: unknown }>
  periodoId: number | null
}

export async function generarQrsBatch(
  user: { id?: string; roles?: string[]; tipo_usuario?: string },
  grupoIds: unknown,
  periodoIdRaw: unknown
) {
  const ids = parseGrupoIds(grupoIds)
  const carreraId = await carreraIdSiCoordinador(user)
  const gruposList = await cargarGruposList(ids)
  const grupoById = new Map(gruposList.map((g) => [Number(g.id), g]))
  const allowedCursoIds = await allowedCursosCarrera(carreraId, gruposList)
  const asignacionByGrupoId = mapaPorGrupoId(await cargarAsignaciones(ids))
  const existentes = await cargarQrsExistentes(ids)
  const existingByGrupoId = mapaPorGrupoId(existentes)
  const periodoId = toPeriodoId(periodoIdRaw)

  const created: { grupoId: number; token: string }[] = []
  const skipped: { grupoId: number; reason: string }[] = []

  for (const grupoId of ids) {
    acumularResultado(
      created,
      skipped,
      await resultadoUnGrupo({
        grupoId,
        grupoById,
        allowedCursoIds,
        asignacionByGrupoId,
        existingByGrupoId,
        periodoId,
      })
    )
  }

  return { created, skipped }
}

export function parseGrupoIds(grupoIds: unknown): number[] {
  if (!Array.isArray(grupoIds) || grupoIds.length === 0) {
    throw badRequest('Se requiere grupoIds (array de IDs de grupo).')
  }
  const ids = grupoIds.map(Number).filter((n) => Number.isFinite(n))
  if (ids.length === 0) {
    throw badRequest('grupoIds debe contener números válidos.')
  }
  return ids
}

export async function carreraIdSiCoordinador(user: {
  id?: string
  roles?: string[]
  tipo_usuario?: string
}): Promise<number | null> {
  const esCoordinador = user?.roles?.includes('coordinador') || user?.tipo_usuario === 'coordinador'
  if (!esCoordinador) return null

  const coordinador = await RoleService.obtenerCoordinadorPorUsuario(user.id as string)
  if (!coordinador?.carrera_id) {
    throw forbidden('Coordinador sin carrera asignada o no encontrado.')
  }
  return Number(coordinador.carrera_id)
}

function esErrorDeColumna(error: { code?: string; message?: string } | null) {
  if (!error) return false
  return error.code === '42703' || String(error.message || '').includes('column')
}

async function cargarGruposFallback(ids: number[]): Promise<GrupoBatch[]> {
  const respFallback = await SupabaseDB.supabaseAdmin
    .from('grupos')
    .select('id, curso_id')
    .in('id', ids)
  if (respFallback.error) {
    throw internal('Error obteniendo grupos', respFallback.error.message)
  }
  return (respFallback.data || []) as GrupoBatch[]
}

async function cargarGruposList(ids: number[]): Promise<GrupoBatch[]> {
  const { data: grupos, error: gruposError } = await SupabaseDB.supabaseAdmin
    .from('grupos')
    .select('id, curso_id, profesor_id, asignacion_profesor_id')
    .in('id', ids)

  if (esErrorDeColumna(gruposError)) {
    return cargarGruposFallback(ids)
  }
  if (gruposError) {
    throw internal('Error obteniendo grupos', gruposError.message)
  }
  return (grupos || []) as GrupoBatch[]
}

async function allowedCursosCarrera(
  carreraId: number | null,
  gruposList: GrupoBatch[]
): Promise<Set<number> | null> {
  if (carreraId == null || gruposList.length === 0) return null

  const cursoIds = Array.from(
    new Set(gruposList.map((g) => Number(g.curso_id)).filter((n) => Number.isFinite(n)))
  )
  try {
    const cursosOk = await academicRepository.listCursosActivosInCareer(carreraId, cursoIds)
    return new Set((cursosOk || []).map((c: { id?: unknown }) => Number(c.id)))
  } catch (cursosErr: unknown) {
    const msg = cursosErr instanceof Error ? cursosErr.message : String(cursosErr)
    throw internal('Error verificando cursos', msg)
  }
}

async function cargarAsignaciones(ids: number[]) {
  try {
    return await academicRepository.listAsignacionesActivasByGrupoIds(ids)
  } catch {
    try {
      return await academicRepository.listAsignacionesByGrupoIds(ids)
    } catch (asigError: unknown) {
      const msg = asigError instanceof Error ? asigError.message : String(asigError)
      throw internal('Error obteniendo asignaciones', msg)
    }
  }
}

async function cargarQrsExistentes(ids: number[]) {
  try {
    return await qrRepository.listActivosByGrupoIds(ids)
  } catch (existentesErr: unknown) {
    const msg = existentesErr instanceof Error ? existentesErr.message : String(existentesErr)
    throw internal('Error verificando QRs existentes', msg)
  }
}

function mapaPorGrupoId<T extends { grupo_id?: unknown }>(rows: T[] | null | undefined) {
  const map = new Map<number, T>()
  for (const row of rows || []) {
    map.set(Number(row.grupo_id), row)
  }
  return map
}

function toPeriodoId(periodoIdRaw: unknown): number | null {
  if (periodoIdRaw == null) return null
  const n = Number(periodoIdRaw)
  return Number.isFinite(n) ? n : null
}

async function profesorIdDeGrupo(
  grupo: GrupoBatch,
  asig: { profesor_id?: unknown } | undefined,
  grupoId: number
) {
  const directo = asig?.profesor_id ?? grupo?.profesor_id ?? null
  if (directo || !grupo?.asignacion_profesor_id) return directo

  try {
    const asgRow = await academicRepository.findAsignacionByGrupo(grupoId)
    return asgRow?.profesor_id ?? directo
  } catch {
    return directo
  }
}

function filaQr(params: {
  token: string
  profesorId: unknown
  cursoId: number
  grupoId: number
  periodoId: number | null
}) {
  const row: Record<string, unknown> = {
    token: params.token,
    profesor_id: params.profesorId,
    curso_id: params.cursoId,
    grupo_id: params.grupoId,
    activo: true,
  }
  if (params.periodoId != null) {
    row.periodo_id = params.periodoId
  }
  return row
}

async function resultadoUnGrupo(ctx: ContextoGrupo): Promise<ItemBatch | null> {
  const grupo = ctx.grupoById.get(ctx.grupoId)
  if (!grupo) return null

  if (ctx.allowedCursoIds && !ctx.allowedCursoIds.has(Number(grupo.curso_id))) {
    return { status: 'skipped', grupoId: ctx.grupoId, reason: 'El grupo no pertenece a tu carrera.' }
  }

  const existing = ctx.existingByGrupoId.get(ctx.grupoId)
  if (existing?.token && existing?.profesor_id) {
    return { status: 'created', grupoId: ctx.grupoId, token: existing.token }
  }

  const asig = ctx.asignacionByGrupoId.get(ctx.grupoId)
  const profesorId = await profesorIdDeGrupo(grupo, asig, ctx.grupoId)
  const cursoId = Number(grupo.curso_id ?? asig?.curso_id ?? 0)
  if (!cursoId) return null

  if (!profesorId) {
    return {
      status: 'skipped',
      grupoId: ctx.grupoId,
      reason: 'No se pudo resolver profesor_id para este grupo (sin asignación).',
    }
  }

  const token = randomUUID()
  try {
    await qrRepository.insert(filaQr({
      token,
      profesorId,
      cursoId,
      grupoId: ctx.grupoId,
      periodoId: ctx.periodoId,
    }))
  } catch {
    return null
  }
  return { status: 'created', grupoId: ctx.grupoId, token }
}

function acumularResultado(
  created: { grupoId: number; token: string }[],
  skipped: { grupoId: number; reason: string }[],
  item: ItemBatch | null
) {
  if (!item) return
  if (item.status === 'created') {
    created.push({ grupoId: item.grupoId, token: item.token })
    return
  }
  skipped.push({ grupoId: item.grupoId, reason: item.reason })
}
