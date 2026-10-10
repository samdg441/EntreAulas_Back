import { defineConfig } from 'cypress'

/**
 * Pruebas de la API como caja negra: solo cy.request, sin navegador de por medio.
 * API_URL elige el destino: el back local (por defecto, lo levanta `npm run test:e2e`)
 * o Render (`API_URL=https://entreaulas-back.onrender.com npm run cy:run`).
 */
export default defineConfig({
  e2e: {
    baseUrl: process.env.API_URL || 'http://localhost:3000',
    specPattern: ['cypress/e2e/api/**/*.cy.ts', 'cypress/e2e/regresion/**/*.cy.ts'],
    supportFile: 'cypress/support/e2e.ts',
    fixturesFolder: false,
    video: false,
    screenshotOnRunFailure: false,
    retries: { runMode: 1, openMode: 0 },
    // El token va aparte como secreto: CYPRESS_TOKEN_COORDINADOR (se lee con cy.env).
    expose: {
      periodo: process.env.PERIODO || '2026-1',
    },
  },
})
