import { Router } from 'express';
import { EvaluationController } from '../controllers/evaluationController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// Aplicar autenticación a todas las rutas
router.use(authenticateToken);

/**
 * @route GET /api/evaluations/questions/career/:carreraId?
 * @desc Obtener preguntas de evaluación por carrera
 * @access Private
 */
router.get('/questions/career/:carreraId?', EvaluationController.getQuestionsByCareer);

/**
 * @route GET /api/evaluations/questions
 * @desc Obtener todas las preguntas de evaluación activas
 * @access Private
 */
router.get('/questions', EvaluationController.getAllQuestions);

/**
 * @route POST /api/evaluations/questions
 * @desc Crear una nueva pregunta de evaluación
 * @access Private (Admin/Coordinador)
 */
router.post('/questions', EvaluationController.createQuestion);

/**
 * @route PUT /api/evaluations/questions/:id
 * @desc Actualizar una pregunta de evaluación
 * @access Private (Admin/Coordinador)
 */
router.put('/questions/:id', EvaluationController.updateQuestion);

/**
 * @route DELETE /api/evaluations/questions/:id
 * @desc Desactivar una pregunta de evaluación
 * @access Private (Admin/Coordinador)
 */
router.delete('/questions/:id', EvaluationController.deactivateQuestion);

/**
 * @route GET /api/evaluations/questions/category/:categoriaId/career/:carreraId?
 * @desc Obtener preguntas por categoría y carrera
 * @access Private
 */
router.get('/questions/category/:categoriaId/career/:carreraId?', EvaluationController.getQuestionsByCategoryAndCareer);

export default router;
