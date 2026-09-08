import { describe, expect, it, vi, afterEach } from 'vitest'
import { logger } from '../../shared/logger'

describe('logger', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('C1: error usa console.error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    logger.error('fallo')
    expect(spy).toHaveBeenCalledWith('fallo')
  })

  it('C2: info usa console.log', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    logger.info('servidor')
    expect(spy).toHaveBeenCalledWith('servidor')
  })

  it('C3: debug no imprime en production', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const prev = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    logger.debug('no-debe-salir')
    process.env.NODE_ENV = prev
    expect(spy).not.toHaveBeenCalled()
  })
})
