import { describe, expect, it } from 'vitest'
import { decidirAutoInscripcion, decidirEstadoInscripcion } from '../helpers/qr'

class RQ14AutoInscripcion {
  C1_noEsEstudiante() {
    const r = decidirAutoInscripcion({ tipoUsuario: 'admin' })
    expect(r.status).toBe(403)
    expect(r.error).toMatch(/estudiantes/i)
  }

  C2_sinRegistroEstudiante() {
    const r = decidirAutoInscripcion({ tipoUsuario: 'estudiante', estudiante: null })
    expect(r.status).toBe(404)
  }

  C3_qrInvalido() {
    const r = decidirAutoInscripcion({
      tipoUsuario: 'estudiante',
      estudiante: { id: 'est-1' },
      qr: null,
    })
    expect(r.status).toBe(404)
    expect(r.error).toMatch(/inválido|expirado/i)
  }

  C4_yaInscrito() {
    const r = decidirEstadoInscripcion({ id: 100, activa: true })
    expect(r.status).toBe(200)
    expect(r.alreadyEnrolled).toBe(true)
  }

  C5_reactiva() {
    const r = decidirEstadoInscripcion({ id: 100, activa: false })
    expect(r.status).toBe(200)
    expect(r.reactivated).toBe(true)
  }

  C6_crea() {
    const acceso = decidirAutoInscripcion({
      tipoUsuario: 'estudiante',
      estudiante: { id: 'est-1' },
      qr: { grupo_id: 11, activo: true },
    })
    const estado = decidirEstadoInscripcion(null)
    expect(acceso.ok).toBe(true)
    expect(acceso.data?.grupoId).toBe(11)
    expect(estado.status).toBe(201)
    expect(estado.created).toBe(true)
  }

  FALLA_C1_adminSeInscribe() {
    const r = decidirAutoInscripcion({ tipoUsuario: 'admin' })
    expect(r.status).toBe(201)
  }

  FALLA_C3_qrInvalidoSeAcepta() {
    const r = decidirAutoInscripcion({
      tipoUsuario: 'estudiante',
      estudiante: { id: 'est-1' },
      qr: null,
    })
    expect(r.status).toBe(200)
  }
}

const pruebas = new RQ14AutoInscripcion()

describe('RQ14 — Auto-inscripción por QR', () => {
  it('C1: no es estudiante → 403', () => pruebas.C1_noEsEstudiante())
  it('C2: sin registro de estudiante → 404', () => pruebas.C2_sinRegistroEstudiante())
  it('C3: QR inválido → 404', () => pruebas.C3_qrInvalido())
  it('C4: inscripción activa → alreadyEnrolled', () => pruebas.C4_yaInscrito())
  it('C5: inscripción inactiva → reactivated', () => pruebas.C5_reactiva())
  it('C6: sin inscripción → created 201', () => pruebas.C6_crea())
  it('FALLA C1: admin — se espera (mal) 201', () => pruebas.FALLA_C1_adminSeInscribe())
  it('FALLA C3: QR inválido — se espera (mal) 200', () => pruebas.FALLA_C3_qrInvalidoSeAcepta())
})
