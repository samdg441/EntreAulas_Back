import { Router } from 'express'
import academicTeachers from './academic/teachers.routes'
import analyticsTeachers from './analytics/teachers-analytics.routes'

/**
 * Composer: monta analytics y academic bajo /api/teachers.
 * Analytics primero para rutas de stats/reportes; academic para dominio.
 * Nota: Express evalúa en orden de registro; se preserva compatibilidad de paths.
 */
const router = Router()
router.use(analyticsTeachers)
router.use(academicTeachers)
export default router
