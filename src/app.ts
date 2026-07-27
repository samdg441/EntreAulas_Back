import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import authRoutes from './routes/auth-supabase'
import evaluacionesRoutes from './routes/evaluaciones'
import evaluationRoutes from './routes/evaluationRoutes'
import resultadosRoutes from './routes/resultados'
import teachersRoutes from './routes/teachers'
import courseRoutes from './routes/courseRoutes'
import coordinadorRoutes from './routes/coordinador'
import qrEvaluacionesRoutes from './routes/qrEvaluaciones'
import passwordResetRoutes from './routes/passwordReset'
import aiRoutes from './routes/aiRoutes'
import usersRoutes from './routes/usersRoutes'

dotenv.config()

export const app = express()

// Configurar CORS para producción
const corsOptions = {
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
  optionsSuccessStatus: 200
}
app.use(cors(corsOptions))
app.use(express.json())

// Rutas
app.use('/api/auth', authRoutes)
app.use('/api/evaluaciones', evaluacionesRoutes)
app.use('/api/evaluations', evaluationRoutes)
app.use('/api/resultados', resultadosRoutes)
app.use('/api/teachers', teachersRoutes)
app.use('/api/courses', courseRoutes)
app.use('/api/coordinador', coordinadorRoutes)
app.use('/api/qr-evaluaciones', qrEvaluacionesRoutes)
app.use('/api/auth', passwordResetRoutes)
app.use('/api/ai', aiRoutes)
app.use('/api/users', usersRoutes)

app.get('/health', (_req, res) => {
  res.json({ ok: true })
})


