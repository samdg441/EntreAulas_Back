import { Response } from 'express'
import { academicService } from './academic.service'

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
      if (error?.code === 'FORBIDDEN' || error?.message === 'FORBIDDEN') {
        return res.status(403).json({
          error: 'Acceso denegado. Solo coordinadores pueden ver esta información.',
        })
      }
      console.error('❌ Error en /courses/by-career:', error)
      if (error?.details || error?.code) {
        return res
          .status(500)
          .json({ error: 'Error obteniendo cursos por carrera', details: error })
      }
      res.status(500).json({ error: 'Error interno del servidor' })
    }
  }
}
