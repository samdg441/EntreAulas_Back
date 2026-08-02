export type AiSummaryResult = {
  summary: string
  topics: string[]
  acosoDetectado?: boolean
  mensajeAcoso?: string
  analysisSource?: 'open_text' | 'quantitative_fallback'
}

export type SummaryContext = 'profesor' | 'coordinador' | 'decano'

/** Strategy: proveedor de resumen IA intercambiable */
export interface AiSummaryProvider {
  readonly name: string
  summarize(
    responses: string[],
    context: SummaryContext
  ): Promise<AiSummaryResult | null>
}
