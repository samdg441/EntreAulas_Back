import { describe, expect, it } from 'vitest'
import { resolverEvaluacionQr } from '../../modules/evaluations/qr-resolucion'
import qrFixture from '../fixtures/rq18-qr.json'

class RQ18ValidarQr {
  C1_sinToken() {
    const r = resolverEvaluacionQr({})
    expect(r.status).toBe(400)
    expect(r.error).toBe(qrFixture.errores.tokenRequerido.error)
  }

  C2_errorBd() {
    const r = resolverEvaluacionQr({ token: 't-err', errorBd: true })
    expect(r.status).toBe(500)
    expect(r.error).toBe(qrFixture.errores.errorResolver.error)
  }

  C3_inexistenteOInactivo() {
    const inexistente = resolverEvaluacionQr({ token: 't-invalido', qr: null })
    const inactivo = resolverEvaluacionQr({ token: 't-off', qr: { activo: false, grupo_id: 1 } })
    expect(inexistente.status).toBe(404)
    expect(inactivo.status).toBe(404)
    expect(inexistente.error).toBe(qrFixture.errores.qrInvalidoOExpirado.error)
  }

  C4_activo() {
    const r = resolverEvaluacionQr({
      token: 't-ok',
      qr: {
        activo: true,
        profesor_id: qrFixture.tokenValido.profesor_id,
        curso_id: qrFixture.tokenValido.curso_id,
        grupo_id: qrFixture.tokenValido.grupo_id,
      },
    })
    expect(r.status).toBe(200)
    expect(r.data).toMatchObject({
      profesorId: qrFixture.tokenValido.profesor_id,
      cursoId: qrFixture.tokenValido.curso_id,
      grupoId: qrFixture.tokenValido.grupo_id,
    })
  }
}

const pruebas = new RQ18ValidarQr()

describe('RQ18 — Validar QR vencido o inválido', () => {
  it('C1: sin token → 400', () => pruebas.C1_sinToken())
  it('C2: error de BD → 500', () => pruebas.C2_errorBd())
  it('C3: QR inexistente o inactivo → 404', () => pruebas.C3_inexistenteOInactivo())
  it('C4: QR activo → 200', () => pruebas.C4_activo())
})
