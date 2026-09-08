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
      reporter: ['text', 'lcov', 'html'],
      reportOnFailure: true,
      include: ['src/**/*.ts'],
      exclude: [
        'src/test/**',
        'src/scripts/**',
        'src/docs/**',
        'src/routes/**',
        '**/*.test.ts',
        '**/*.d.ts',
        'src/app.ts',
        'src/server.ts',
        'src/modules/teachers.router.ts',
        'src/modules/academic/**/*.routes.ts',
        'src/modules/analytics/**/*.routes.ts',
        'src/modules/evaluations/evaluations.routes.ts',
        'src/modules/evaluations/student-evaluations.routes.ts',
        'src/modules/evaluations/resultados.routes.ts',
      ],
    },
  },
})
