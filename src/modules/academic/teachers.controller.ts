import { Request, Response } from 'express'
import { z } from 'zod'
import { teachersService } from './teachers.service'
import {
  AppError,
  badRequest,
  forbidden,
  sendError,
} from '../../shared/errors'

const teacherIdSchema = z.union([
  z.string().uuid('ID de profesor inválido'),
  z
    .string()
    .regex(/^\d+$/, 'ID de profesor inválido')
    .refine((s) => Number.parseInt(s, 10) > 0, 'ID de profesor inválido'),
])

const evaluationSchema = z.object({
  teacherId: teacherIdSchema,
  courseId: z.union([
    z.string().uuid('ID de curso inválido (UUID)'),
    z
      .string()
      .transform((val) => Number.parseInt(val, 10))
      .pipe(z.number().int().positive('ID de curso inválido (número)')),
  ]),
  groupId: z.string().optional(),
  answers: z
    .array(
      z.object({
        questionId: z.number().int().positive('ID de pregunta inválido'),
        rating: z.number().int().min(1).max(5).nullable().optional(),
        textAnswer: z.string().nullable().optional(),
        selectedOption: z.string().nullable().optional(),
      })
    )
    .min(1, 'Debe haber al menos una respuesta'),
  overallRating: z.number().min(1).max(5, 'Calificación promedio debe estar entre 1 y 5'),
  comments: z.string().optional(),
})

function esDecano(user: { roles?: string[] } | undefined) {
  return Boolean(user?.roles?.includes('decano'))
}

function puedeComoProfesor(user: { tipo_usuario?: string } | undefined) {
  return (
    user?.tipo_usuario === 'profesor' ||
    user?.tipo_usuario === 'docente' ||
    user?.tipo_usuario === 'coordinador'
  )
}

export class TeachersController {
  static async listTeachers(req: Request, res: Response) {
    try {
      res.json(await teachersService.listTeachers(req.user as any))
    } catch (error) {
      return sendError(res, error)
    }
  }

  static async listGroups(req: Request, res: Response) {
    try {
      res.json(await teachersService.listGroups(req.params.profesorId, req.params.courseId))
    } catch (error) {
      return sendError(res, error)
    }
  }

  static async createEvaluation(req: Request, res: Response) {
    try {
      const validatedData = evaluationSchema.parse(req.body)
      res.json(await teachersService.createEvaluation(req.user as any, validatedData))
    } catch (error) {
      if (error instanceof z.ZodError) {
        return sendError(
          res,
          badRequest(
            'Datos de evaluación inválidos',
            error.errors.map((err) => ({ field: err.path.join('.'), message: err.message }))
          )
        )
      }
      return sendError(res, error)
    }
  }

  static async getEvaluationQuestions(req: Request, res: Response) {
    try {
      res.json(await teachersService.getEvaluationQuestions(req.user as any, req.params.courseId))
    } catch (error) {
      return sendError(res, error)
    }
  }

  static async getStudentInfo(req: Request, res: Response) {
    try {
      if (req.user?.tipo_usuario !== 'estudiante') {
        throw forbidden('Solo los estudiantes pueden acceder a esta información')
      }
      res.json(await teachersService.getStudentInfo(req.user.id))
    } catch (error) {
      return sendError(res, error)
    }
  }

  static async getTeacherInfo(req: Request, res: Response) {
    try {
      if (!puedeComoProfesor(req.user)) {
        throw forbidden('Solo los profesores y coordinadores pueden acceder a esta información')
      }
      res.json(await teachersService.getTeacherInfo(req.user!.id))
    } catch (error) {
      return sendError(res, error)
    }
  }

  static async getSurveyByCareer(req: Request, res: Response) {
    try {
      if (!puedeComoProfesor(req.user)) {
        throw forbidden('Solo los profesores y coordinadores pueden acceder a esta información')
      }
      res.json(await teachersService.getSurveyByCareer(req.params.careerId))
    } catch (error) {
      return sendError(res, error)
    }
  }

  static test(_req: Request, res: Response) {
    res.json({ message: 'Teachers endpoint working', timestamp: new Date().toISOString() })
  }

  static async debugUser(req: Request, res: Response) {
    try {
      res.json(await teachersService.debugUser(req.user))
    } catch (error) {
      return sendError(res, error)
    }
  }

  static async debugAuth(req: Request, res: Response) {
    try {
      const result = await teachersService.debugAuth(req.headers['authorization'])
      return res.status(result.status).json(result.body)
    } catch (error) {
      return sendError(res, error)
    }
  }

  static async listByCareer(req: Request, res: Response) {
    try {
      const user = req.user as any
      if (
        !user.roles?.includes('coordinador') &&
        !user.roles?.includes('decano') &&
        user.tipo_usuario !== 'coordinador'
      ) {
        throw forbidden('Acceso denegado. Solo coordinadores y decanos pueden ver esta información.')
      }
      res.json(await teachersService.listByCareer(req.params.careerId))
    } catch (error) {
      return sendError(res, error)
    }
  }

  static async getProfessorSubjects(req: Request, res: Response) {
    try {
      if (!esDecano(req.user)) {
        throw forbidden('Acceso denegado. Solo el decano puede ver las materias de los profesores.')
      }
      res.json(await teachersService.getProfessorSubjects())
    } catch (error) {
      return sendError(res, error)
    }
  }

  static async getCareerSubjects(req: Request, res: Response) {
    try {
      if (!esDecano(req.user)) {
        throw forbidden('Acceso denegado. Solo el decano puede ver las materias de las carreras.')
      }
      res.json(await teachersService.getCareerSubjects())
    } catch (error) {
      return sendError(res, error)
    }
  }

  static async getDetailedFaculty(req: Request, res: Response) {
    try {
      if (!esDecano(req.user)) {
        throw forbidden('Acceso denegado. Solo el decano puede ver todos los profesores de la facultad.')
      }
      res.json(await teachersService.getDetailedFaculty())
    } catch (error) {
      return sendError(res, error)
    }
  }

  static async getFaculty(req: Request, res: Response) {
    try {
      if (!esDecano(req.user)) {
        throw forbidden('Acceso denegado. Solo el decano puede ver todos los profesores de la facultad.')
      }
      res.json(await teachersService.getFaculty())
    } catch (error) {
      return sendError(res, error)
    }
  }

  static async getAllFaculty(req: Request, res: Response) {
    try {
      if (!esDecano(req.user)) {
        throw forbidden('Acceso denegado. Solo el decano puede ver todos los profesores de la facultad.')
      }
      res.json(await teachersService.getAllFaculty())
    } catch (error) {
      return sendError(res, error)
    }
  }

  static async debugGroups(req: Request, res: Response) {
    try {
      res.json(await teachersService.debugGroups(req.params.profesorId, req.params.courseId))
    } catch (error) {
      return sendError(res, error)
    }
  }

  static async debugAssignments(req: Request, res: Response) {
    try {
      res.json(await teachersService.debugAssignments(req.params.careerId))
    } catch (error) {
      return sendError(res, error)
    }
  }

  static async listCareers(req: Request, res: Response) {
    try {
      const user = req.user as any
      const isCoordinador = user.roles?.includes('coordinador') || user.tipo_usuario === 'coordinador'
      const isAdmin = user.roles?.includes('admin') || user.tipo_usuario === 'admin'
      if (!isCoordinador && !isAdmin) {
        throw forbidden('Acceso denegado. Solo coordinadores o administradores pueden ver esta información.')
      }
      res.json(await teachersService.listCareers())
    } catch (error) {
      return sendError(res, error)
    }
  }

  static async listCoursesByTeacher(req: Request, res: Response) {
    try {
      res.json(await teachersService.listCoursesByTeacher(req.user as any, req.params.teacherId))
    } catch (error) {
      return sendError(res, error)
    }
  }

  static async getStudentEnrolledSubjects(req: Request, res: Response) {
    try {
      if (req.user?.tipo_usuario !== 'estudiante') {
        throw forbidden('Solo los estudiantes pueden acceder a esta información')
      }
      res.json(await teachersService.getStudentEnrolledSubjects(req.user.id))
    } catch (error) {
      if (error instanceof AppError) return sendError(res, error)
      return res.json({ materiasMatriculadas: [], total: 0 })
    }
  }

  static async getTeacherCourses(req: Request, res: Response) {
    try {
      if (req.user?.tipo_usuario !== 'profesor') {
        throw forbidden('Solo los profesores pueden acceder a estos datos')
      }
      res.json(await teachersService.getTeacherCourses(req.params.teacherId))
    } catch (error) {
      return sendError(res, error)
    }
  }

  static async getTeacherId(req: Request, res: Response) {
    try {
      if (req.user?.tipo_usuario !== 'profesor') {
        throw forbidden('Solo los profesores pueden acceder a este endpoint')
      }
      res.json(await teachersService.getTeacherId(req.user!.id))
    } catch (error) {
      return sendError(res, error)
    }
  }

  static async debugProfessors(req: Request, res: Response) {
    try {
      res.json(await teachersService.debugProfessors(req.user as any))
    } catch (error) {
      return sendError(res, error)
    }
  }
}
