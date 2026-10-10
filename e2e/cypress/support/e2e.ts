// Render apaga el servicio gratuito sin tráfico: la primera petición de cada spec lo despierta.
before(() => {
  cy.request({ url: '/health', timeout: 120_000, retryOnNetworkFailure: true })
})
