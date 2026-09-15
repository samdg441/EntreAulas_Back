import { describe, expect, it } from 'vitest'
import { mapearRespuestaQr, resolverEvaluacionQr } from '../../modules/evaluations/qr-resolucion'
import qrFixture from '../fixtures/rq18-qr.json'

class RQ17ResolucionToken {
  C1_sinToken() {
    const r = resolverEvaluacionQr({ token: undefined })
    expect(r.status).toBe(400)
    expect(r.error).toBe(qrFixture.errores.tokenRequerido.error)
  }

  C2_errorBd() {
    const r = resolverEvaluacionQr({ token: 't-err', errorBd: true })
    expect(r.status).toBe(500)
    expect(r.error).toBe(qrFixture.errores.errorResolver.error)
  }

  C3_inexistente() {
    const r = resolverEvaluacionQr({ token: 't-invalido', qr: null })
    expect(r.status).toBe(404)
    expect(r.error).toBe(qrFixture.errores.qrInvalidoOExpirado.error)
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
    expect(r.ok).toBe(true)
    expect(r.status).toBe(200)
    expect(r.data).toEqual({
      profesorId: qrFixture.tokenValido.profesor_id,
      cursoId: qrFixture.tokenValido.curso_id,
      grupoId: qrFixture.tokenValido.grupo_id,
    })
  }

  C5_qrInactivo() {
    const r = resolverEvaluacionQr({
      token: 't-off',
      qr: { activo: false, profesor_id: 1, curso_id: 2, grupo_id: 3 },
    })
    expect(r.status).toBe(404)
  }

  C6_mapearRespuesta() {
    const mapped = mapearRespuestaQr({
      profesor_id: 'p1',
      curso_id: 10,
      grupo_id: 3,
      periodo_id: 2026,
      profesor: { usuario: { nombre: 'Ana', apellido: 'Pérez' } },
      curso: { nombre: 'Álgebra', codigo: 'MAT-1' },
      grupo: { numero_grupo: 'A', horario: 'Lun 8-10', aula: '101' },
    })
    expect(mapped).toMatchObject({
      profesorId: 'p1',
      materiaId: 10,
      profesorNombre: 'Ana Pérez',
      cursoNombre: 'Álgebra',
      grupoNumero: 'A',
    })
  }

  C7_mapearRelacionesAnidadas() {
    const mapped = mapearRespuestaQr({
      profesor_id: 'p2',
      curso_id: 4,
      grupo_id: 8,
      profesor: [{ usuario: [{ nombre: 1, apellido: null }] }],
      curso: [{ nombre: 'Cálculo' }],
      grupo: [{ numero_grupo: 2 }],
    })
    expect(mapped.periodoId).toBeNull()
    expect(mapped.profesorNombre).toBeNull()
    expect(mapped.cursoNombre).toBe('Cálculo')
    expect(mapped.grupoNumero).toBe(2)
  }
}

const pruebas = new RQ17ResolucionToken()

describe('RQ17 — Resolución de token QR', () => {
  it('C1: sin token → 400', () => pruebas.C1_sinToken())
  it('C2: error de BD → 500', () => pruebas.C2_errorBd())
  it('C3: QR inexistente → 404', () => pruebas.C3_inexistente())
  it('C4: QR activo → 200', () => pruebas.C4_activo())
  it('C5: QR inactivo → 404', () => pruebas.C5_qrInactivo())
  it('C6: mapea profesor, curso y grupo', () => pruebas.C6_mapearRespuesta())
  it('C7: relaciones en array y campos vacíos', () => pruebas.C7_mapearRelacionesAnidadas())
})
