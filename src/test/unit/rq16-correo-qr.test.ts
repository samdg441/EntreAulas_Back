import { describe, expect, it } from 'vitest'
import {
  coordinadorPuedeOperar,
  filtrarQrsPorCarrera,
  smtpEstaConfigurado,
  validarCorreoQr,
} from '../helpers/qr'

const qrRow = { curso: { carrera_id: 1 } }

class RQ16CorreoQr {
  C1_correoInvalido() {
    const r = validarCorreoQr({ to: 'no-es-correo', subject: 'Hola', grupoIds: [1] })
    expect(r.status).toBe(400)
    expect(r.error).toMatch(/Correo/)
  }

  C2_asuntoVacio() {
    const r = validarCorreoQr({ to: 'a@b.com', subject: '  ', grupoIds: [1] })
    expect(r.status).toBe(400)
    expect(r.error).toMatch(/asunto/)
  }

  C3_grupoIdsInvalido() {
    const r = validarCorreoQr({ to: 'a@b.com', subject: 'QR', grupoIds: [] })
    expect(r.status).toBe(400)
  }

  C4_coordinadorSinCarrera() {
    const r = coordinadorPuedeOperar(undefined)
    expect(r.status).toBe(403)
  }

  C5_sinQrs() {
    const filtrados = filtrarQrsPorCarrera([], null)
    expect(filtrados).toEqual([])
  }

  C6_qrsOtraCarrera() {
    const filtrados = filtrarQrsPorCarrera([qrRow], 99)
    expect(filtrados).toEqual([])
  }

  C7_smtpNoConfigurado() {
    expect(smtpEstaConfigurado({})).toBe(false)
  }

  C8_correoValidoYSmtp() {
    const r = validarCorreoQr({ to: 'a@b.com', subject: 'QR', grupoIds: [1] })
    expect(r.ok).toBe(true)
    expect(r.data?.email).toBe('a@b.com')
    expect(
      smtpEstaConfigurado({
        SMTP_HOST: 'smtp.test',
        SMTP_USER: 'u',
        SMTP_PASS: 'p',
        SMTP_FROM: 'from@test.com',
      })
    ).toBe(true)
    expect(filtrarQrsPorCarrera([qrRow], 1)).toHaveLength(1)
  }

  FALLA_C1_correoInvalidoSeAcepta() {
    expect(validarCorreoQr({ to: 'no-es-correo', subject: 'Hola', grupoIds: [1] }).status).toBe(200)
  }

  FALLA_C7_smtpVacioSeAcepta() {
    expect(smtpEstaConfigurado({})).toBe(true)
  }
}

const pruebas = new RQ16CorreoQr()

describe('RQ16 — Distribución de QR por correo', () => {
  it('C1: correo inválido → 400', () => pruebas.C1_correoInvalido())
  it('C2: asunto vacío → 400', () => pruebas.C2_asuntoVacio())
  it('C3: grupoIds inválido → 400', () => pruebas.C3_grupoIdsInvalido())
  it('C4: coordinador sin carrera → 403', () => pruebas.C4_coordinadorSinCarrera())
  it('C5: sin QRs → lista vacía', () => pruebas.C5_sinQrs())
  it('C6: QRs de otra carrera → filtrados', () => pruebas.C6_qrsOtraCarrera())
  it('C7: SMTP no configurado', () => pruebas.C7_smtpNoConfigurado())
  it('C8: datos válidos y SMTP listo', () => pruebas.C8_correoValidoYSmtp())
  it('FALLA C1: correo inválido — se espera (mal) 200', () => pruebas.FALLA_C1_correoInvalidoSeAcepta())
  it('FALLA C7: SMTP vacío — se espera (mal) configurado', () => pruebas.FALLA_C7_smtpVacioSeAcepta())
})
