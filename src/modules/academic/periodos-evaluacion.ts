import { Router } from 'express'
import { supabaseAdmin } from '../../config/supabase-only'
import { authenticateToken, requireRole } from '../../middleware/auth'
import { badRequest, internal, notFound, sendError, unavailable } from '../../shared/errors'
import { logger } from '../../shared/logger'

export type VentanaEvaluacion = {
  periodoId: number
  ano: number
  semestre: number
  fechaInicio: string
  fechaFin: string
}

const COLUMNA_INEXISTENTE = '42703'

/** Ventanas de evaluación de los periodos activos que ya tienen fechas definidas. */
export async function listarVentanasEvaluacion(): Promise<VentanaEvaluacion[]> {
  const { data, error } = await supabaseAdmin
    .from('periodos_academicos')
    .select('id, ano, semestre, fecha_inicio_evaluacion, fecha_fin_evaluacion')
    .eq('activo', true)
    .not('fecha_inicio_evaluacion', 'is', null)
    .not('fecha_fin_evaluacion', 'is', null)
    .order('fecha_inicio_evaluacion')

  if (error) {
    if ((error as { code?: string }).code === COLUMNA_INEXISTENTE) {
      logger.error('Faltan las columnas de ventana de evaluación: ejecuta scripts/add-evaluation-window.sql')
      return []
    }
    throw internal('Error consultando los periodos de evaluación', error)
  }

  return ((data || []) as Record<string, unknown>[]).map((row) => ({
    periodoId: Number(row.id),
    ano: Number(row.ano),
    semestre: Number(row.semestre),
    fechaInicio: String(row.fecha_inicio_evaluacion),
    fechaFin: String(row.fecha_fin_evaluacion),
  }))
}

const PERIODO_REGEX = /^(\d{4})-([12])$/
const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/

function fechaValida(valor: unknown): valor is string {
  return typeof valor === 'string' && FECHA_REGEX.test(valor) && !Number.isNaN(Date.parse(valor))
}

/** Guarda la ventana de evaluación de un periodo existente ("2026-1"). */
export async function guardarVentanaEvaluacion(body: {
  periodo?: unknown
  fechaInicio?: unknown
  fechaFin?: unknown
}): Promise<VentanaEvaluacion> {
  const match = PERIODO_REGEX.exec(String(body?.periodo ?? '').trim())
  if (!match) throw badRequest('El período debe tener el formato AAAA-S, por ejemplo 2026-1.')
  if (!fechaValida(body.fechaInicio) || !fechaValida(body.fechaFin)) {
    throw badRequest('Las fechas de inicio y cierre son obligatorias (AAAA-MM-DD).')
  }
  if (body.fechaFin < body.fechaInicio) {
    throw badRequest('La fecha de cierre no puede ser anterior a la de inicio.')
  }

  const ano = Number(match[1])
  const semestre = Number(match[2])
  const { data, error } = await supabaseAdmin
    .from('periodos_academicos')
    .update({ fecha_inicio_evaluacion: body.fechaInicio, fecha_fin_evaluacion: body.fechaFin })
    .eq('ano', ano)
    .eq('semestre', semestre)
    .select('id')

  if (error) {
    if ((error as { code?: string }).code === COLUMNA_INEXISTENTE) {
      throw unavailable('Falta configurar las fechas de evaluación en la base de datos (scripts/add-evaluation-window.sql).')
    }
    throw internal('Error guardando las fechas de evaluación', error)
  }
  const fila = (data as { id: number }[] | null)?.[0]
  if (!fila) throw notFound(`El período ${ano}-${semestre} no existe.`)

  return { periodoId: Number(fila.id), ano, semestre, fechaInicio: body.fechaInicio, fechaFin: body.fechaFin }
}

const router = Router()

/** GET /api/periodos/evaluacion → [{ periodoId, ano, semestre, fechaInicio, fechaFin }] */
router.get('/evaluacion', authenticateToken, async (_req, res) => {
  try {
    res.json(await listarVentanasEvaluacion())
  } catch (error) {
    return sendError(res, error)
  }
})

/** PUT /api/periodos/evaluacion  Body: { periodo: "2026-1", fechaInicio, fechaFin } */
router.put('/evaluacion', authenticateToken, requireRole(['coordinador', 'admin']), async (req, res) => {
  try {
    res.json(await guardarVentanaEvaluacion(req.body))
  } catch (error) {
    return sendError(res, error)
  }
})

export default router
