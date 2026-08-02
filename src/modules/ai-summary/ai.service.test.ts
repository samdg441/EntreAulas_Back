import { describe, it, expect } from 'vitest'
import { AiService } from './ai.service'

describe('AiService (Strategy)', () => {
  it('summarizeFromRatings produce fallback cuantitativo', () => {
    const result = AiService.summarizeFromRatings([5, 4, 3, 5], 'profesor')
    expect(result.analysisSource).toBe('quantitative_fallback')
    expect(result.summary.length).toBeGreaterThan(20)
    expect(result.topics.length).toBeGreaterThan(0)
  })

  it('summarizeOpenResponses usa al menos estrategia local', async () => {
    const result = await AiService.summarizeOpenResponses(
      [
        'El profesor explica con claridad y buena metodología',
        'Falta más retroalimentación en las prácticas',
      ],
      'profesor'
    )
    expect(result.summary.length).toBeGreaterThan(10)
    expect(Array.isArray(result.topics)).toBe(true)
  })
})
