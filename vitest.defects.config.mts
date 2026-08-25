import { defineConfig } from 'vitest/config'

/**
 * Configuración del registro de defectos.
 * Estas pruebas expresan el comportamiento correcto esperado y fallan
 * mientras el defecto siga abierto. No forman parte de la suite de requisitos.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/test/defects/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/coverage/**'],
    setupFiles: ['src/test/setup.ts'],
    globals: false,
  },
})
