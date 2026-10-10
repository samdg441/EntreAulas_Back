import { cargarTokenCoordinadorOSaltar, pedir, pedirComoCoordinador } from '../../support/api'

/**
 * RQ18 contra el back real. Solo se prueban rechazos: ninguna petición crea QR
 * ni envía correos, así que se puede correr contra producción.
 */
describe('RQ18 — QR público', () => {
  it('un UUID que no existe → 404 "QR inválido o expirado."', () => {
    pedir('/api/qr-evaluaciones/00000000-0000-4000-8000-000000000000').then((r) => {
      expect(r.status).to.eq(404)
      expect(r.body).to.deep.equal({ error: 'QR inválido o expirado.' })
    })
  })

  it('la imagen del QR es un PNG cacheable y con ?descargar=1 se descarga', () => {
    const ruta = '/api/qr-evaluaciones/00000000-0000-4000-8000-000000000000/imagen.png'
    pedir(ruta, { encoding: 'binary' }).then((r) => {
      expect(r.status).to.eq(200)
      expect(r.headers['content-type']).to.match(/image\/png/)
      expect(r.headers['cache-control']).to.match(/max-age=\d+/)
      expect(r.body.slice(1, 4)).to.eq('PNG')
    })
    pedir(`${ruta}?descargar=1`).its('headers.content-disposition').should('match', /attachment; filename="qr-evaluacion\.png"/)
  })
})

describe('RQ18 — Generar y compartir QR (validaciones con sesión)', function () {
  before(function () {
    cargarTokenCoordinadorOSaltar(this)
  })

  it('batch sin grupos → 400 antes de tocar la base', () => {
    pedirComoCoordinador('/api/qr-evaluaciones/batch', { method: 'POST', body: { grupoIds: [] } }).then((r) => {
      expect(r.status).to.eq(400)
      expect(r.body.error).to.match(/grupoIds/)
    })
  })

  const correosInvalidos = ['no-es-correo', 'ana@udemedellin.edu.co\r\nBcc: todos@evil.example', 'a@x.co, b@x.co']
  correosInvalidos.forEach((to) => {
    it(`share-email a ${JSON.stringify(to)} → 400 sin enviar nada`, () => {
      pedirComoCoordinador('/api/qr-evaluaciones/share-email', {
        method: 'POST',
        body: { to, subject: 'QR', message: 'Hola', tokens: ['00000000-0000-4000-8000-000000000000'] },
      }).then((r) => {
        expect(r.status).to.eq(400)
        expect(r.body.error).to.eq('Correo de destino inválido.')
      })
    })
  })
})
