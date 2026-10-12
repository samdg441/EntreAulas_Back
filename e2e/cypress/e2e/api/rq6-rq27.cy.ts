import { pedir } from '../../support/api'

/**
 * RQ6, RQ14–RQ17 y RQ27 contra el back real.
 * Solo rechazos: no crea usuarios, no genera QR y no envía correos.
 */
describe('RQ6, RQ14–RQ17 y RQ27 — API real', () => {
  before(() => {
    pedir('/health', { timeout: 120_000 })
  })

  const protegidos: Array<[string, string]> = [
    ['GET', '/api/users'],
    ['POST', '/api/qr-evaluaciones/batch'],
    ['POST', '/api/qr-evaluaciones/share-email'],
    ['POST', '/api/qr-evaluaciones/tok-inexistente/auto-enroll'],
    ['GET', '/api/teachers/student-enrolled-subjects'],
  ]

  protegidos.forEach(([metodo, ruta]) => {
    it(`${metodo} ${ruta} sin token → 401`, () => {
      pedir(ruta, { method: metodo, body: { grupoIds: [1], to: 'ana@udemedellin.edu.co', subject: 'QR' } }).then((r) => {
        expect(r.status).to.eq(401)
        expect(r.body.code).to.eq('NO_TOKEN')
      })
    })
  })

  it('RQ17: un token que no existe → 404', () => {
    pedir('/api/qr-evaluaciones/00000000-0000-4000-8000-000000000000').then((r) => {
      expect(r.status).to.eq(404)
      expect(r.body.error).to.match(/inválido|expirado/i)
    })
  })

  it('RQ16: un correo con salto de línea → 401 sin token, y no envía', () => {
    pedir('/api/qr-evaluaciones/share-email', {
      method: 'POST',
      body: { to: 'ana@udemedellin.edu.co\r\nBcc: todos@evil.example', subject: 'QR', grupoIds: [1] },
    }).then((r) => {
      expect(r.status).to.eq(401)
      expect(r.body).not.to.have.property('sentTo')
    })
  })
})
