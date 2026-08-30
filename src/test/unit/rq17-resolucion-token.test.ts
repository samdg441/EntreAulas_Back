import { describe, expect, it } from 'vitest'
import { resolverTokenQr } from '../helpers/qr'
import qrFixture from '../fixtures/rq18-qr.json'

class RQ17ResolucionToken {
  C1_sinToken() {
    const r = resolverTokenQr({ token: undefined })
    expect(r.status).toBe(400)
    expect(r.error).toBe(qrFixture.errores.tokenRequerido.error)
  }

  C2_errorBd() {
    const r = resolverTokenQr({ token: 't-err', errorBd: true })
    expect(r.status).toBe(500)
    expect(r.error).toBe(qrFixture.errores.errorResolver.error)
  }

  C3_inexistente() {
    const r = resolverTokenQr({ token: 't-invalido', qr: null })
    expect(r.status).toBe(404)
    expect(r.error).toBe(qrFixture.errores.qrInvalidoOExpirado.error)
  }

  C4_activo() {
    const r = resolverTokenQr({
      token: 't-ok',
      qr: {
        activo: true,
        profesor_id: qrFixture.tokenValido.profesor_id,
        curso_id: qrFixture.tokenValido.curso_id,
        grupo_id: qrFixture.tokenValido.grupo_id,
      },
    })
    expect(r.ok).toBe(true)
    expect(r.status).toBe(200)
    expect(r.data).toEqual({
      profesorId: qrFixture.tokenValido.profesor_id,
      cursoId: qrFixture.tokenValido.curso_id,
      grupoId: qrFixture.tokenValido.grupo_id,
    })
  }

  FALLA_C1_sinTokenSeAcepta() {
    expect(resolverTokenQr({ token: undefined }).status).toBe(200)
  }

  FALLA_C3_inexistenteSeAcepta() {
    expect(resolverTokenQr({ token: 't-invalido', qr: null }).status).toBe(200)
  }
}

const pruebas = new RQ17ResolucionToken()

describe('RQ17 — Resolución de token QR', () => {
  it('C1: sin token → 400', () => pruebas.C1_sinToken())
  it('C2: error de BD → 500', () => pruebas.C2_errorBd())
  it('C3: QR inexistente → 404', () => pruebas.C3_inexistente())
  it('C4: QR activo → 200', () => pruebas.C4_activo())
  it('FALLA C1: sin token — se espera (mal) 200', () => pruebas.FALLA_C1_sinTokenSeAcepta())
  it('FALLA C3: inexistente — se espera (mal) 200', () => pruebas.FALLA_C3_inexistenteSeAcepta())
})
