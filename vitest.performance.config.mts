import { defineConfig } from 'vitest/config'

/**
 * Presupuestos de tiempo. Fuera de `npm test` y de Jenkins: los tiempos dependen del equipo
 * y una suite que falla por un pico de CPU ajeno enseña a ignorar los fallos.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/test/performance/**/*.test.ts'],
    setupFiles: ['src/test/setup.ts'],
    globals: false,
    fileParallelism: false,
    testTimeout: 60_000,
  },
})
