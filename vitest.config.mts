import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'src/test/unit/**/*.test.ts',
      'src/test/integration/**/*.test.ts',
      // Legacy colocalizados (se mantienen hasta migrar)
      'src/**/*.test.ts',
      'src/**/__tests__/**/*.test.ts',
    ],
    // `defects/` se ejecuta aparte (npm run test:defects): son pruebas que
    // fallan a propósito para dejar registro de defectos abiertos.
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      'src/test/defects/**',
    ],
    setupFiles: ['src/test/setup.ts'],
    globals: false,
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      exclude: [
        'coverage/**',
        'dist/**',
        'node_modules/**',
        'src/test/**',
        '**/*.test.ts',
      ],
    },
  },
})
