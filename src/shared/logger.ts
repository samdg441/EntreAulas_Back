/**
 * Logs centralizados. debug/warn no salen en producción.
 * Los handlers no deben llenarse de console.log: o logger.debug o nada.
 */
const isProd = () => process.env.NODE_ENV === 'production'

export const logger = {
  info: (...args: unknown[]) => {
    console.log(...args)
  },
  debug: (...args: unknown[]) => {
    if (!isProd()) console.log(...args)
  },
  warn: (...args: unknown[]) => {
    if (!isProd()) console.warn(...args)
  },
  error: (...args: unknown[]) => {
    console.error(...args)
  },
}
