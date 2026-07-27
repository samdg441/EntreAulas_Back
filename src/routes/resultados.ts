import { Router } from 'express'
import { SupabaseDB } from '../config/supabase-only'
import { authenticateToken, requireRole } from '../middleware/auth'

const router = Router()

// GET /resultados - Obtener resultados para profesores
router.get('/', authenticateToken, requireRole(['profesor', 'coordinador', 'admin']), async (req: any, res) => {
  try {
    const { periodo_id, grupo_id } = req.query
    
    // Construir filtros basados en el rol del usuario
    let filters: any = {}
    
    if (req.user.tipo_usuario === 'profesor') {
      // Los profesores solo pueden ver sus propias evaluaciones
      filters.profesor_id = req.user.id
    }
    
    if (periodo_id) {
      filters.periodo_id = parseInt(periodo_id as string)
    }
    
    if (grupo_id) {
      filters.grupo_id = parseInt(grupo_id as string)
    }

    // Obtener evaluaciones con relaciones
    const { data: evaluaciones, error } = await SupabaseDB.supabaseAdmin
      .from('evaluaciones')
      .select(`
        *,
        estudiante:estudiantes(
          *,
          usuario:usuarios(nombre, apellido)
        ),
        profesor:profesores(
          *,
          usuario:usuarios(nombre, apellido)
        ),
        grupo:grupos(
          *,
          curso:cursos(*),
          periodo:periodos_academicos(*)
        ),
        respuestas_evaluacion(
          *,
          pregunta:preguntas_evaluacion(*)
        )
      `)
      .match(filters)
      .eq('completada', true)
      .order('fecha_completada', { ascending: false })

    if (error) throw error

    res.json(evaluaciones)
  } catch (error) {
    console.error('Error al obtener resultados:', error)
    res.status(500).json({ error: 'Error interno del servidor' })
  }
})

// GET /resultados/estadisticas - Obtener estadísticas agregadas
router.get('/estadisticas', authenticateToken, requireRole(['profesor', 'coordinador', 'admin']), async (req: any, res) => {
  try {
    const { periodo_id, grupo_id } = req.query
    
    let filters: any = {}
    
    if (req.user.tipo_usuario === 'profesor') {
      filters.profesor_id = req.user.id
    }
    
    if (periodo_id) {
      filters.periodo_id = parseInt(periodo_id as string)
    }
    
    if (grupo_id) {
      filters.grupo_id = parseInt(grupo_id as string)
    }

    // Obtener estadísticas básicas
    const { data: evaluaciones, error } = await SupabaseDB.supabaseAdmin
      .from('evaluaciones')
      .select('calificacion_promedio, fecha_completada')
      .match(filters)
      .eq('completada', true)
      .not('calificacion_promedio', 'is', null)

    if (error) throw error

    // Calcular estadísticas
    const calificaciones = evaluaciones?.map(e => parseFloat(e.calificacion_promedio)) || []
    
    const estadisticas = {
      total_evaluaciones: evaluaciones?.length || 0,
      calificacion_promedio: calificaciones.length > 0 
        ? calificaciones.reduce((a, b) => a + b, 0) / calificaciones.length 
        : 0,
      calificacion_minima: calificaciones.length > 0 ? Math.min(...calificaciones) : 0,
      calificacion_maxima: calificaciones.length > 0 ? Math.max(...calificaciones) : 0,
      evaluaciones_por_mes: evaluaciones?.reduce((acc: any, evaluacion) => {
        const mes = new Date(evaluacion.fecha_completada).toISOString().substring(0, 7)
        acc[mes] = (acc[mes] || 0) + 1
        return acc
      }, {}) || {}
    }

    res.json(estadisticas)
  } catch (error) {
    console.error('Error al obtener estadísticas:', error)
    res.status(500).json({ error: 'Error interno del servidor' })
  }
})

export default router