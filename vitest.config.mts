import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/test/unit/**/*.test.ts'],
    // Integración, defects y *.test.ts colocalizados usan vi.mock: no van en npm test.
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
      reporter: ['text', 'html', 'lcov'],
      reportOnFailure: true,
      // Alineado con sonar.inclusions (menos *.routes.ts, excluidos de coverage en Sonar).
      include: [
        'src/middleware/auth.ts',
        'src/modules/evaluations/qr-evaluaciones.routes.ts',
        'src/modules/evaluations/qr-batch.ts',
        'src/modules/evaluations/qr-auto-enroll.ts',
        'src/modules/evaluations/qr-share-email.ts',
        'src/modules/evaluations/qr-resolucion.ts',
        'src/modules/academic/estudiante-materias.ts',
      ],
      exclude: [
        'src/test/**',
        'src/scripts/**',
        'src/docs/**',
        'src/routes/**',
        '**/*.test.ts',
        '**/*.d.ts',
      ],
    },
  },
})
