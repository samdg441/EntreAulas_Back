import { describe, expect, it } from 'vitest'
import { coordinadorPuedeOperar, decidirDestinoGrupo, parsearGrupoIds } from '../helpers/qr'

class RQ15GenerarQr {
  C1_grupoIdsVacio() {
    const r = parsearGrupoIds([])
    expect(r.status).toBe(400)
    expect(r.error).toMatch(/grupoIds/i)
  }

  C2_idsNoNumericos() {
    const r = parsearGrupoIds(['x'])
    expect(r.status).toBe(400)
  }

  C3_coordinadorSinCarrera() {
    const r = coordinadorPuedeOperar(undefined)
    expect(r.status).toBe(403)
    expect(r.error).toMatch(/carrera/i)
  }

  C4_grupoOtraCarrera() {
    const r = decidirDestinoGrupo({
      grupo: { id: 1, profesor_id: 'p1' },
      carreraCoordinador: 10,
      carreraDelCurso: 99,
    })
    expect(r).toEqual({ accion: 'skip', grupoId: 1 })
  }

  C5_reusaToken() {
    const r = decidirDestinoGrupo({
      grupo: { id: 7, profesor_id: 'p-1' },
      qrExistente: { token: 'ya-existe' },
    })
    expect(r).toEqual({ accion: 'reusar', grupoId: 7, token: 'ya-existe' })
  }

  C6_sinProfesor() {
    const r = decidirDestinoGrupo({
      grupo: { id: 5, profesor_id: null },
    })
    expect(r).toEqual({ accion: 'skip', grupoId: 5 })
  }

  C7_creaToken() {
    const ids = parsearGrupoIds([7])
    const r = decidirDestinoGrupo({ grupo: { id: 7, profesor_id: 'p-1' } })
    expect(ids.ok).toBe(true)
    expect(r).toEqual({ accion: 'crear', grupoId: 7 })
  }

  FALLA_C1_vacioSeAcepta() {
    expect(parsearGrupoIds([]).status).toBe(201)
  }

  FALLA_C6_sinProfesorCrea() {
    const r = decidirDestinoGrupo({ grupo: { id: 5, profesor_id: null } })
    expect(r.accion).toBe('crear')
  }
}

const pruebas = new RQ15GenerarQr()

describe('RQ15 — Generación masiva de QR', () => {
  it('C1: grupoIds vacío → 400', () => pruebas.C1_grupoIdsVacio())
  it('C2: IDs no numéricos → 400', () => pruebas.C2_idsNoNumericos())
  it('C3: coordinador sin carrera → 403', () => pruebas.C3_coordinadorSinCarrera())
  it('C4: grupo de otra carrera → skip', () => pruebas.C4_grupoOtraCarrera())
  it('C5: QR existente → reusa token', () => pruebas.C5_reusaToken())
  it('C6: sin profesor → skip', () => pruebas.C6_sinProfesor())
  it('C7: crea token nuevo', () => pruebas.C7_creaToken())
  it('FALLA C1: grupoIds vacío — se espera (mal) 201', () => pruebas.FALLA_C1_vacioSeAcepta())
  it('FALLA C6: sin profesor — se espera (mal) crear', () => pruebas.FALLA_C6_sinProfesorCrea())
})
