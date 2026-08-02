import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import swaggerUi from 'swagger-ui-express'
import { openApiSpec } from './docs/openapi'

import authRoutes from './modules/auth/auth.routes'
import passwordResetRoutes from './modules/auth/password-reset.routes'
import studentEvaluacionesRoutes from './modules/evaluations/student-evaluations.routes'
import evaluationRoutes from './modules/evaluations/evaluations.routes'
import resultadosRoutes from './modules/evaluations/resultados.routes'
import qrEvaluacionesRoutes from './modules/evaluations/qr-evaluaciones.routes'
import teachersRoutes from './modules/teachers.router'
import courseRoutes from './modules/academic/courses.routes'
import usersRoutes from './modules/academic/users.routes'
import coordinadorRoutes from './modules/analytics/coordinador.routes'
import aiRoutes from './modules/ai-summary/ai.routes'

dotenv.config()

export const app = express()

const corsOptions = {
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
  optionsSuccessStatus: 200,
}
app.use(cors(corsOptions))
app.use(express.json())

// Contrato OpenAPI (V&V)
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec))
app.get('/api/openapi.json', (_req, res) => res.json(openApiSpec))

// Módulos (URLs públicas sin cambios)
app.use('/api/auth', authRoutes)
app.use('/api/auth', passwordResetRoutes)
app.use('/api/evaluaciones', studentEvaluacionesRoutes)
app.use('/api/evaluations', evaluationRoutes)
app.use('/api/resultados', resultadosRoutes)
app.use('/api/teachers', teachersRoutes)
app.use('/api/courses', courseRoutes)
app.use('/api/coordinador', coordinadorRoutes)
app.use('/api/qr-evaluaciones', qrEvaluacionesRoutes)
app.use('/api/ai', aiRoutes)
app.use('/api/users', usersRoutes)

app.get('/health', (_req, res) => {
  res.json({ ok: true })
})
