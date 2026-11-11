import { SupabaseDB, supabaseAdmin } from '../../config/supabase-only'
import { RoleService } from '../auth/role.service'
import { badRequest, internal } from '../../shared/errors'
import { logger } from '../../shared/logger'
import {
  armarVistaAuditoria,
  parsearFiltrosAuditoria,
  type AccionAuditoria,
  type EventoAuditoria,
  type VistaAuditoria,
} from './auditoria'

const TABLA = 'auditoria_eventos'
const TABLA_INEXISTENTE = '42P01'
const LARGO_MAXIMO_DETALLE = 300
/** Tope de filas que se traen de la base antes de filtrar y paginar en memoria. */
const LIMITE_FILAS = 2000

export type NuevoEventoAuditoria = {
  actorId: string
  actorNombre: string
  actorRol: string
  accion: AccionAuditoria
  entidad: string
  entidadId?: string | null
  carreraId: number | null
  detalle?: string
}

export type RespuestaAuditoria = VistaAuditoria & { disponible: boolean; aviso?: string }

function aEvento(fila: Record<string, unknown>): EventoAuditoria {
  return {
    id: Number(fila.id),
    actorId: String(fila.actor_id ?? ''),
    actorNombre: String(fila.actor_nombre ?? ''),
    actorRol: String(fila.actor_rol ?? ''),
    accion: String(fila.accion ?? ''),
    entidad: String(fila.entidad ?? ''),
    entidadId: fila.entidad_id == null ? null : String(fila.entidad_id),
    detalle: String(fila.detalle ?? ''),
    creadoEn: String(fila.creado_en ?? ''),
  }
}

export const auditoriaService = {
  /** Guarda un evento. Nunca lanza: auditar no debe tumbar la operación auditada. */
  async registrar(evento: NuevoEventoAuditoria): Promise<void> {
    try {
      const { error } = await supabaseAdmin.from(TABLA).insert({
        actor_id: evento.actorId,
        actor_nombre: evento.actorNombre,
        actor_rol: evento.actorRol,
        accion: evento.accion,
        entidad: evento.entidad,
        entidad_id: evento.entidadId ?? null,
        carrera_id: evento.carreraId,
        detalle: (evento.detalle ?? '').slice(0, LARGO_MAXIMO_DETALLE),
        creado_en: new Date().toISOString(),
      })
      if (error) logger.error('No se pudo registrar el evento de auditoría:', error.message)
    } catch (error) {
      logger.error('No se pudo registrar el evento de auditoría:', error)
    }
  },

  /**
   * Registra una acción de un usuario autenticado: resuelve su nombre y su carrera.
   * Es de «disparar y olvidar»; cualquier fallo se traga para no afectar la petición.
   */
  async registrarComoUsuario(
    user: { id?: string; roles?: string[]; tipo_usuario?: string } | undefined,
    evento: Pick<NuevoEventoAuditoria, 'accion' | 'entidad' | 'entidadId' | 'detalle'>
  ): Promise<void> {
    try {
      if (!user?.id) return
      const [usuario, coordinador] = await Promise.all([
        SupabaseDB.findUserById(user.id),
        RoleService.obtenerCoordinadorPorUsuario(user.id),
      ])
      await this.registrar({
        ...evento,
        actorId: user.id,
        actorNombre: `${usuario?.nombre ?? ''} ${usuario?.apellido ?? ''}`.trim() || 'Sin nombre',
        actorRol: user.roles?.includes('coordinador') ? 'coordinador' : String(user.tipo_usuario ?? ''),
        carreraId: coordinador?.carrera_id == null ? null : Number(coordinador.carrera_id),
      })
    } catch (error) {
      logger.error('No se pudo auditar la acción:', error)
    }
  },

  /** Eventos de la carrera del coordinador, filtrados y paginados. */
  async listar(usuarioId: string, query: Record<string, unknown>): Promise<RespuestaAuditoria> {
    const filtros = parsearFiltrosAuditoria(query)
    const coordinador = await RoleService.obtenerCoordinadorPorUsuario(usuarioId)
    if (!coordinador?.carrera_id) throw badRequest('No se encontró carrera asociada al coordinador')

    const { data, error } = await supabaseAdmin
      .from(TABLA)
      .select('id, actor_id, actor_nombre, actor_rol, accion, entidad, entidad_id, detalle, creado_en')
      .eq('carrera_id', Number(coordinador.carrera_id))
      .order('creado_en', { ascending: false })
      .range(0, LIMITE_FILAS - 1)

    if (error) {
      if ((error as { code?: string }).code === TABLA_INEXISTENTE) {
        return {
          ...armarVistaAuditoria([], filtros),
          disponible: false,
          aviso: 'Falta crear la tabla de auditoria: ejecuta scripts/create-auditoria-eventos.sql en Supabase.',
        }
      }
      throw internal('Error consultando la auditoría', error)
    }

    const eventos = ((data || []) as Record<string, unknown>[]).map(aEvento)
    return { ...armarVistaAuditoria(eventos, filtros), disponible: true }
  },
}
