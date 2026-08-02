import { Router } from 'express'
import { EvaluationsController } from './evaluations.controller'
import { authenticateToken } from '../../middleware/auth'

const router = Router()

router.use(authenticateToken)

router.get('/questions/career/:carreraId?', EvaluationsController.getQuestionsByCareer)
router.get('/questions', EvaluationsController.getAllQuestions)
router.post('/questions', EvaluationsController.createQuestion)
router.put('/questions/:id', EvaluationsController.updateQuestion)
router.delete('/questions/:id', EvaluationsController.deactivateQuestion)
router.get(
  '/questions/category/:categoriaId/career/:carreraId?',
  EvaluationsController.getQuestionsByCategoryAndCareer
)

export default router
