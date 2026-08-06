import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import swaggerUi from 'swagger-ui-express'
import { openApiSpec } from './docs/openapi'

// Fachada pública (`src/routes/*`) → implementación en `src/modules/*`
import authRoutes from './routes/auth-supabase'
import passwordResetRoutes from './routes/passwordReset'
import studentEvaluacionesRoutes from './routes/evaluaciones'
import evaluationRoutes from './routes/evaluationRoutes'
import resultadosRoutes from './routes/resultados'
import qrEvaluacionesRoutes from './routes/qrEvaluaciones'
import teachersRoutes from './routes/teachers'
import courseRoutes from './routes/courseRoutes'
import usersRoutes from './routes/usersRoutes'
import coordinadorRoutes from './routes/coordinador'
import aiRoutes from './routes/aiRoutes'

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
