import { Router } from 'express'
import { authenticateToken } from '../../middleware/auth'
import { TeachersController } from './teachers.controller'

const router = Router()

router.get('/', authenticateToken, TeachersController.listTeachers)
router.get(
  '/:profesorId/courses/:courseId/groups',
  authenticateToken,
  TeachersController.listGroups
)
router.post('/evaluations', authenticateToken, TeachersController.createEvaluation)
router.get(
  '/evaluation-questions/:courseId',
  authenticateToken,
  TeachersController.getEvaluationQuestions
)
router.get('/student-info', authenticateToken, TeachersController.getStudentInfo)
router.get('/teacher-info', authenticateToken, TeachersController.getTeacherInfo)
router.get('/survey-by-career/:careerId', authenticateToken, TeachersController.getSurveyByCareer)
router.get('/test', TeachersController.test)
router.get('/debug-user', authenticateToken, TeachersController.debugUser)
router.get('/debug-auth', TeachersController.debugAuth)
router.get('/by-career/:careerId', authenticateToken, TeachersController.listByCareer)
router.get('/professor-subjects', authenticateToken, TeachersController.getProfessorSubjects)
router.get('/career-subjects', authenticateToken, TeachersController.getCareerSubjects)
router.get('/detailed-faculty', authenticateToken, TeachersController.getDetailedFaculty)
router.get('/faculty', authenticateToken, TeachersController.getFaculty)
router.get('/all', authenticateToken, TeachersController.getAllFaculty)
router.get(
  '/debug-groups/:profesorId/:courseId',
  authenticateToken,
  TeachersController.debugGroups
)
router.get('/debug-assignments/:careerId', authenticateToken, TeachersController.debugAssignments)
router.get('/careers', authenticateToken, TeachersController.listCareers)
router.get('/:teacherId/courses', authenticateToken, TeachersController.listCoursesByTeacher)
router.get(
  '/student-enrolled-subjects',
  authenticateToken,
  TeachersController.getStudentEnrolledSubjects
)
router.get('/teacher-courses/:teacherId', authenticateToken, TeachersController.getTeacherCourses)
router.get('/teacher-id', authenticateToken, TeachersController.getTeacherId)
router.get('/debug-professors', authenticateToken, TeachersController.debugProfessors)

export default router
