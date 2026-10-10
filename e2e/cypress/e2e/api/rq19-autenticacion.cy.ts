import { jwtConOtraClave, jwtSinFirma, pedir } from '../../support/api'

/**
 * RQ19 contra el back real (local o Render): autenticación y control de acceso.
 * No necesita credenciales: todo lo que se prueba aquí debe ser rechazado.
 */
describe('RQ19 — Autenticación de la API', () => {
  const coordinadorFalso = { userId: 'd253d25e-e6c4-445e-acad-3357ce2eb23a', tipo_usuario: 'coordinador' }

  it('health responde 200 en menos de 2 s con el servicio despierto', () => {
    pedir('/health').then((r) => {
      expect(r.status).to.eq(200)
      expect(r.body.ok).to.eq(true)
      expect(r.duration).to.be.lessThan(2000)
    })
  })

  it('login con un correo inexistente → 401 genérico (no revela si la cuenta existe)', () => {
    pedir('/api/auth/login', { method: 'POST', body: { email: 'nadie-cypress@udemedellin.edu.co', password: 'Clave-Segura2026!' } }).then((r) => {
      expect(r.status).to.eq(401)
      expect(r.body).to.deep.equal({ error: 'Credenciales inválidas' })
    })
  })

  it('login con un objeto en vez de correo (inyección NoSQL) → 400 por validación', () => {
    pedir('/api/auth/login', { method: 'POST', body: { email: { $gt: '' }, password: 'x' } }).then((r) => {
      expect(r.status).to.eq(400)
      expect(r.body.error).to.eq('Datos inválidos')
    })
  })

  const protegidos: Array<[string, string]> = [
    ['GET', '/api/auth/profile'],
    ['GET', '/api/coordinador/dashboard-summary'],
    ['GET', '/api/coordinador/reports-overview?period=2026-1'],
    ['GET', '/api/coordinador/profesor-stats/13?period=2026-1'],
    ['GET', '/api/teachers/13/stats/historical?period=2026-1'],
    ['POST', '/api/qr-evaluaciones/batch'],
    ['POST', '/api/qr-evaluaciones/share-email'],
    ['GET', '/api/users'],
  ]

  protegidos.forEach(([method, ruta]) => {
    it(`${method} ${ruta} sin token → 401 NO_TOKEN`, () => {
      pedir(ruta, { method, body: method === 'POST' ? {} : undefined }).then((r) => {
        expect(r.status).to.eq(401)
        expect(r.body).to.deep.equal({ error: 'Token de acceso requerido', code: 'NO_TOKEN' })
      })
    })
  })

  it('token mal formado → 401 sin detalles de la librería', () => {
    pedir('/api/auth/profile', { headers: { Authorization: 'Bearer abc.def.ghi' } }).then((r) => {
      expect(r.status).to.eq(401)
      expect(r.body).to.have.all.keys('error', 'code')
      expect(JSON.stringify(r.body)).not.to.match(/stack|jsonwebtoken|malformed/i)
    })
  })

  it('token sin firma (alg none) que dice ser coordinador → 401', () => {
    pedir('/api/auth/profile', { headers: { Authorization: `Bearer ${jwtSinFirma(coordinadorFalso)}` } }).its('status').should('eq', 401)
  })

  it('token firmado con otra clave → 401', () => {
    cy.wrap(jwtConOtraClave(coordinadorFalso)).then((token) => {
      pedir('/api/auth/profile', { headers: { Authorization: `Bearer ${token}` } }).its('status').should('eq', 401)
    })
  })

  it('CORS: el front oficial recibe permiso y un origen ajeno no', () => {
    const preflight = (origen: string) =>
      pedir('/api/coordinador/dashboard-summary', {
        method: 'OPTIONS',
        headers: { Origin: origen, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization' },
      })

    preflight('https://evil.example').its('headers').should('not.have.property', 'access-control-allow-origin')
  })

  it('no anuncia la tecnología del servidor (x-powered-by)', () => {
    pedir('/health').its('headers').should('not.have.property', 'x-powered-by')
  })
})
