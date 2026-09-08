import { Response } from 'express'
import { academicService } from './academic.service'
import {
  AppError,
  forbidden,
  internal,
  sendError,
} from '../../shared/errors'


export class CoursesController {
  static async getByCareer(req: any, res: Response) {
    try {
      const user = req.user
      const { careerId } = req.params

      console.log('🔍 [/courses/by-career] Request received', {
        userId: user?.id,
        careerId,
      })

      const cursos = await academicService.getCoursesByCareerForCoordinator(
        careerId,
        user
      )

      console.log(`✅ Cursos encontrados para carrera ${careerId}:`, cursos?.length || 0)
      res.json(cursos || [])
    } catch (error: any) {
      if (error instanceof AppError) return sendError(res, error)
      if (error?.code === 'FORBIDDEN' || error?.message === 'FORBIDDEN') {
        return sendError(
          res,
          forbidden('Acceso denegado. Solo coordinadores pueden ver esta información.')
        )
      }
      if (error?.details || error?.code) {
        return sendError(res, internal('Error obteniendo cursos por carrera', error))
      }
      return sendError(res, error)
    }
  }
}
