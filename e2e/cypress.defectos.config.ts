import { defineConfig } from 'cypress'
import base from './cypress.config'

/** Defectos abiertos: fallan a propósito, por eso no entran en `cy:run` ni en CI. */
export default defineConfig({
  ...base,
  e2e: {
    ...base.e2e,
    specPattern: ['cypress/e2e/defectos/**/*.cy.ts'],
    retries: 0,
  },
})
