import { Router } from 'express'
import { authenticateToken, requireRole } from '../middleware/auth'
import { SupabaseDB } from '../config/supabase-only'

const router = Router()

/**
 * GET /api/users
 * Solo administradores. Ejemplo de ruta sensible.
 */
router.get('/', authenticateToken, requireRole(['admin']), async (_req, res) => {
  try {
    const users = await SupabaseDB.listUsersSummary()
    res.json({ users })
  } catch (e) {
    console.error('GET /api/users:', e)
    res.status(500).json({ error: 'Error al listar usuarios' })
  }
})

export default router
