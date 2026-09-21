import { app } from './app'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { logger } from './shared/logger'

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000

// Verificar conexión de IA al iniciar (opcional)
async function checkAIConnection() {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY
  if (!apiKey || apiKey === 'your_gemini_api_key_here') {
    logger.info('GOOGLE_GEMINI_API_KEY no configurada - usando resumen local inteligente')
    logger.info('Obtén tu API key en: https://makersuite.google.com/app/apikey')
    return false
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
    await model.generateContent('test')
    logger.info('IA conectada correctamente (Google Gemini)')
    return true
  } catch (error: any) {
    logger.info('IA no disponible - usando resumen local inteligente')
    if (error.message?.includes('API_KEY')) {
      logger.warn('Verifica que GOOGLE_GEMINI_API_KEY sea válida')
    }
    return false
  }
}

app.listen(PORT, async () => {
  logger.info(`Server listening on http://localhost:${PORT}`)
  logger.info(`Health check: http://localhost:${PORT}/health`)
  await checkAIConnection()
})


