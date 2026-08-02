import { GoogleGenerativeAI } from '@google/generative-ai'
import type { AiSummaryProvider, AiSummaryResult, SummaryContext } from '../ai.types'

/**
 * Estrategia Gemini. Devuelve null si no hay API key o falla la llamada,
 * para que el servicio haga fallback a otra estrategia.
 */
export class GeminiSummaryProvider implements AiSummaryProvider {
  readonly name = 'gemini'
  private readonly genAI: GoogleGenerativeAI | null

  constructor(apiKey?: string) {
    const key = apiKey ?? process.env.GOOGLE_GEMINI_API_KEY
    this.genAI = key ? new GoogleGenerativeAI(key) : null
  }

  async summarize(
    responses: string[],
    context: SummaryContext
  ): Promise<AiSummaryResult | null> {
    if (!this.genAI) return null

    try {
      const model = this.genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 1000,
        },
      })

      const joined = responses.slice(0, 90).join('\n- ')
      const prompt = buildPrompt(context, joined)
      const result = await model.generateContent(prompt)
      const text = result.response.text()

      const resumenMatch = text.match(/Resumen:\s*([\s\S]*?)(?=\n\s*Temas:|$)/i)
      const temasMatch = text.match(/Temas:\s*([\s\S]*?)$/i)

      const summary = resumenMatch ? resumenMatch[1].trim() : text.trim()
      if (!summary) return null

      const topics = temasMatch
        ? temasMatch[1]
            .split(/[,;]/)
            .map((t) => t.trim())
            .filter((t) => t.length > 0)
            .slice(0, 10)
        : []

      return {
        summary,
        topics,
        analysisSource: 'open_text',
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      console.warn('⚠️  Error con Gemini API:', message)
      return null
    }
  }
}

function buildPrompt(context: SummaryContext, joined: string): string {
  const scope =
    context === 'coordinador'
      ? 'los profesores de una carrera completa'
      : context === 'decano'
        ? 'los profesores de una facultad completa'
        : 'su experiencia académica'

  const speakAs =
    context === 'coordinador'
      ? 'Habla en general sobre los profesores de la carrera, no sobre un profesor específico.'
      : context === 'decano'
        ? 'Habla en general sobre los profesores de la facultad, no sobre profesores específicos.'
        : 'Habla sobre el docente evaluado.'

  return `Eres un asistente experto en análisis de retroalimentación educativa. Estás analizando las opiniones de estudiantes sobre ${scope}.

Analiza las siguientes opiniones y genera:

1. Un resumen claro y útil (3-6 oraciones).
2. Una lista de 5-10 temas o palabras clave (separados por comas).

IMPORTANTE:
- ${speakAs}
- Responde SOLO en español y en este formato exacto:
Resumen: [tu resumen aquí]
Temas: [tema1, tema2, tema3, ...]

⚠️ DETECCIÓN DE ACOSO: Si detectas menciones de acoso, hostigamiento o comportamiento inapropiado, inclúyelo claramente en el resumen.

Opiniones de estudiantes:
${joined}`
}
