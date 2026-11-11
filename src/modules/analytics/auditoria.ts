import { badRequest } from '../../shared/errors'

/** Acciones que el sistema deja registradas para la vista de auditoría del coordinador. */
export const ACCIONES_AUDITORIA = [
  'programar_encuesta',
  'generar_qr',
  'consultar_reportes',
  'consultar_docente',
] as const

export type AccionAuditoria = (typeof ACCIONES_AUDITORIA)[number]

export type EventoAuditoria = {
  id: number
  actorId: string
  actorNombre: string
  actorRol: string
  accion: AccionAuditoria | string
  entidad: string
  entidadId: string | null
  detalle: string
  creadoEn: string
}

export type FiltrosAuditoria = {
  page: number
  pageSize: number
  accion?: AccionAuditoria
  desde?: string
  hasta?: string
  search?: string
}

export type VistaAuditoria = {
  eventos: EventoAuditoria[]
  resumen: { total: number; porAccion: Record<string, number>; ultimoEvento: string | null }
  pagination: { page: number; pageSize: number; total: number; totalPages: number }
}

const TAM_PAGINA_POR_DEFECTO = 10
const TAM_PAGINA_MAXIMO = 50
const LARGO_MAXIMO_BUSQUEDA = 80
const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/
const MARCAS_DIACRITICAS = /\p{M}/gu

function entero(valor: unknown, porDefecto: number): number {
  const n = Number(valor)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : porDefecto
}

function fechaValida(valor: string): boolean {
  if (!FECHA_REGEX.test(valor)) return false
  const fecha = new Date(`${valor}T00:00:00.000Z`)
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().startsWith(valor)
}

function leerFecha(valor: unknown, nombre: string): string | undefined {
  if (valor === undefined || valor === null || valor === '') return undefined
  const texto = String(valor)
  if (!fechaValida(texto)) throw badRequest(`La fecha "${nombre}" debe tener el formato AAAA-MM-DD.`)
  return texto
}

function leerAccion(valor: unknown): AccionAuditoria | undefined {
  const texto = String(valor ?? '').trim()
  if (!texto || texto === 'todas') return undefined
  if (!(ACCIONES_AUDITORIA as readonly string[]).includes(texto)) {
    throw badRequest(`La acción "${texto}" no es válida.`)
  }
  return texto as AccionAuditoria
}

/** Valida y normaliza los parámetros de consulta; lanza 400 con un mensaje claro si son inválidos. */
export function parsearFiltrosAuditoria(query: Record<string, unknown>): FiltrosAuditoria {
  const desde = leerFecha(query.desde, 'desde')
  const hasta = leerFecha(query.hasta, 'hasta')
  if (desde && hasta && desde > hasta) {
    throw badRequest('La fecha "desde" no puede ser posterior a la fecha "hasta".')
  }
  const search = String(query.search ?? '').trim().slice(0, LARGO_MAXIMO_BUSQUEDA)

  return {
    page: entero(query.page, 1),
    pageSize: Math.min(TAM_PAGINA_MAXIMO, entero(query.pageSize, TAM_PAGINA_POR_DEFECTO)),
    accion: leerAccion(query.accion),
    desde,
    hasta,
    search: search || undefined,
  }
}

function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(MARCAS_DIACRITICAS, '').toLowerCase()
}

function coincideBusqueda(e: EventoAuditoria, search: string): boolean {
  return normalizar(`${e.actorNombre} ${e.detalle} ${e.entidad} ${e.entidadId ?? ''}`).includes(normalizar(search))
}

const inicioDelDia = (fecha: string) => `${fecha}T00:00:00.000Z`
const finDelDia = (fecha: string) => `${fecha}T23:59:59.999Z`

function cumpleFiltros(e: EventoAuditoria, f: FiltrosAuditoria): boolean {
  const accionOk = !f.accion || e.accion === f.accion
  const desdeOk = !f.desde || e.creadoEn >= inicioDelDia(f.desde)
  const hastaOk = !f.hasta || e.creadoEn <= finDelDia(f.hasta)
  return accionOk && desdeOk && hastaOk && (!f.search || coincideBusqueda(e, f.search))
}

/** Aplica filtros, ordena del más reciente al más antiguo, resume y pagina. No muta la entrada. */
export function armarVistaAuditoria(eventos: EventoAuditoria[], filtros: FiltrosAuditoria): VistaAuditoria {
  const filtrados = eventos
    .filter((e) => cumpleFiltros(e, filtros))
    .sort((a, b) => b.creadoEn.localeCompare(a.creadoEn))

  const porAccion: Record<string, number> = {}
  for (const e of filtrados) porAccion[e.accion] = (porAccion[e.accion] ?? 0) + 1

  const total = filtrados.length
  const inicio = (filtros.page - 1) * filtros.pageSize
  return {
    eventos: filtrados.slice(inicio, inicio + filtros.pageSize),
    resumen: { total, porAccion, ultimoEvento: filtrados[0]?.creadoEn ?? null },
    pagination: {
      page: filtros.page,
      pageSize: filtros.pageSize,
      total,
      totalPages: Math.ceil(total / filtros.pageSize),
    },
  }
}
