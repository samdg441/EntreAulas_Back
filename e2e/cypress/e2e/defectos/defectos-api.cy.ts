import { cargarTokenCoordinadorOSaltar, pedir, pedirComoCoordinador } from '../../support/api'

/**
 * Defectos abiertos vistos desde fuera (mismos IDs que src/test/HALLAZGOS.md).
 * Cada prueba describe el comportamiento CORRECTO y falla mientras el defecto siga abierto.
 */
describe('Defectos abiertos de la API — sin sesión', () => {
  it('DEF-37 (RQ18): un token que no es UUID → 404, no 500', () => {
    pedir('/api/qr-evaluaciones/token-que-no-existe').then((r) => {
      expect(r.status).to.eq(404)
      expect(r.body).to.deep.equal({ error: 'QR inválido o expirado.' })
    })
  })

  it('DEF-38: JSON malformado → 400 en JSON, no la página HTML de Express', () => {
    pedir('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{mal' }).then((r) => {
      expect(r.status).to.eq(400)
      expect(r.headers['content-type']).to.match(/application\/json/)
    })
  })

  it('DEF-35: el back envía cabeceras de seguridad básicas (helmet)', () => {
    pedir('/health').then((r) => {
      expect(r.headers).to.have.property('x-content-type-options', 'nosniff')
      expect(r.headers).to.have.property('strict-transport-security')
      expect(r.headers).to.have.property('x-frame-options')
    })
  })
})

describe('Defectos abiertos de la API — con sesión de coordinador', function () {
  before(function () {
    cargarTokenCoordinadorOSaltar(this)
  })

  it('DEF-31: un id de docente no numérico → 400 sin filtrar el error de PostgreSQL', () => {
    pedirComoCoordinador('/api/coordinador/profesor-stats/abc?period=2026-1').then((r) => {
      expect(r.status).to.eq(400)
      expect(JSON.stringify(r.body)).not.to.match(/bigint|syntax|postgres/i)
    })
  })

  const periodosInvalidos = ['2026-9', "2026-1' OR '1'='1"]
  periodosInvalidos.forEach((period) => {
    it(`DEF-33 (RQ23): reports-overview?period=${period} → 400, no datos de todos los periodos`, () => {
      pedirComoCoordinador(`/api/coordinador/reports-overview?period=${encodeURIComponent(period)}`).its('status').should('eq', 400)
    })
  })
})
