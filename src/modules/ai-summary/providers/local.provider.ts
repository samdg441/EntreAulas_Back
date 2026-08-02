import type { AiSummaryProvider, AiSummaryResult, SummaryContext } from '../ai.types'

/**
 * Estrategia local: siempre disponible, sin dependencias externas.
 * La lógica detallada vive en AiService (extractTopKeywords / generateSmartSummary).
 */
export class LocalSummaryProvider implements AiSummaryProvider {
  readonly name = 'local'

  constructor(
    private readonly summarizeFn: (
      responses: string[],
      context: SummaryContext
    ) => AiSummaryResult
  ) {}

  async summarize(
    responses: string[],
    context: SummaryContext
  ): Promise<AiSummaryResult> {
    return this.summarizeFn(responses, context)
  }
}
