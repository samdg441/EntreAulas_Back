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
    // DEF-47: bcrypt 12 en DEF-34/DEF-41 necesita margen con la máquina cargada.
    testTimeout: 15_000,
    globals: false,
  },
})
