import { Router } from 'express'
import { authenticateToken } from '../../middleware/auth'
import { teachersAnalyticsService } from './teachers-analytics.service'
import { forbidden, sendError } from '../../shared/errors'

const router = Router()

router.get('/:profesorId/stats', authenticateToken, async (req: any, res) => {
  try {
    res.json(await teachersAnalyticsService.getStats(req.params.profesorId))
  } catch (error) {
    return sendError(res, error)
  }
})

router.get('/:profesorId/stats/historical', authenticateToken, async (req: any, res) => {
  try {
    res.json(await teachersAnalyticsService.getHistorical(req.params.profesorId, req.query.period))
  } catch (error) {
    return sendError(res, error)
  }
})

router.get('/course-rating/:professorId/:courseId', async (req, res) => {
  try {
    res.json(
      await teachersAnalyticsService.getCourseRating(req.params.professorId, req.params.courseId)
    )
  } catch (error) {
    return sendError(res, error)
  }
})

router.get('/career-results/all', authenticateToken, async (req: any, res) => {
  try {
    if (!req.user.roles?.includes('decano')) {
      throw forbidden('Acceso denegado. Solo decanos pueden acceder a estos resultados.')
    }
    res.json(await teachersAnalyticsService.getCareerResultsAll())
  } catch (error) {
    return sendError(res, error)
  }
})

router.get('/career-results/:careerId', authenticateToken, async (req: any, res) => {
  try {
    if (!req.user.roles?.includes('decano')) {
      throw forbidden('Acceso denegado. Solo decanos pueden acceder a estos resultados.')
    }
    res.json(await teachersAnalyticsService.getCareerResultsByCareer(req.params.careerId))
  } catch (error) {
    return sendError(res, error)
  }
})

router.get('/student-stats', authenticateToken, async (req: any, res) => {
  try {
    if (req.user.tipo_usuario !== 'estudiante') {
      throw forbidden('Solo los estudiantes pueden acceder a estas estadísticas')
    }
    res.json(await teachersAnalyticsService.getStudentStats(req.user.id))
  } catch (error) {
    return sendError(res, error)
  }
})

router.get('/teacher-stats/:teacherId', authenticateToken, async (req: any, res) => {
  try {
    if (req.user.tipo_usuario !== 'profesor') {
      throw forbidden('Solo los profesores pueden acceder a estas estadísticas')
    }
    res.json(await teachersAnalyticsService.getTeacherStats(req.params.teacherId))
  } catch (error) {
    return sendError(res, error)
  }
})

router.get('/period-stats', authenticateToken, async (req: any, res) => {
  try {
    if (req.user.tipo_usuario !== 'profesor') {
      throw forbidden('Solo los profesores pueden acceder a estas estadísticas')
    }
    res.json(await teachersAnalyticsService.getPeriodStats(req.user.id, req.query.period))
  } catch (error) {
    return sendError(res, error)
  }
})

router.get('/period-category-stats', authenticateToken, async (req: any, res) => {
  try {
    if (req.user.tipo_usuario !== 'profesor') {
      throw forbidden('Solo los profesores pueden acceder a estas estadísticas')
    }
    res.json(
      await teachersAnalyticsService.getPeriodCategoryStats(
        req.user.id,
        req.query.period,
        req.query.courseId
      )
    )
  } catch (error) {
    return sendError(res, error)
  }
})

export default router
