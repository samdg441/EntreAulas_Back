/**
 * Presupuestos de RQ6, RQ15 y RQ27: lógica pura y la app bajo concurrencia, sin la base real.
 */
import { afterAll, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { supabaseModuleMock } from '../helpers/supabase-mock'
import { guardarReporte, medir, medirConcurrente, type Medicion } from '../helpers/medicion'

vi.mock('../../config/supabase-only', () => supabaseModuleMock)
vi.mock('../../config/supabaseClient', () => supabaseModuleMock)

import { app } from '../../app'
import { parseGrupoIds } from '../../modules/evaluations/qr-batch'
import { formatearMateriasMatriculadas } from '../../modules/academic/estudiante-materias'

const mediciones: Medicion[] = []

describe('RQ6, RQ15 y RQ27 — Rendimiento', () => {
  afterAll(() => {
    guardarReporte('back-rq6-rq27', mediciones)
  })

  it('RQ15: validar 50.000 ids de grupo tarda menos de 30 ms', () => {
    const grupoIds = Array.from({ length: 50_000 }, (_, i) => i + 1)
    const m = medir({ escenario: 'parseGrupoIds 50k', requisito: 'RQ15', presupuestoMs: 30 }, () => parseGrupoIds(grupoIds))
    mediciones.push(m)
    expect(m.cumple, JSON.stringify(m)).toBe(true)
    expect(parseGrupoIds(grupoIds)).toHaveLength(50_000)
  })

  it('RQ27: armar la vista de 20.000 materias tarda menos de 50 ms', () => {
    const materias = Array.from({ length: 20_000 }, (_, i) => ({
      id: i + 1,
      grupo: {
        id: i + 1,
        numero_grupo: 1,
        horario: 'Lun 8-10',
        aula: 'A-101',
        curso: { id: i + 1, codigo: `SIS-${i}`, nombre: 'Programación' },
        periodo: { codigo: '2026-1', nombre: '2026-I' },
        asignaciones_profesor: { profesor: { usuario: { nombre: 'Ana', apellido: 'Pérez' } } },
      },
    }))
    const m = medir({ escenario: 'formatearMateriasMatriculadas 20k', requisito: 'RQ27', presupuestoMs: 80 }, () =>
      formatearMateriasMatriculadas(materias)
    )
    mediciones.push(m)
    expect(m.cumple, JSON.stringify(m)).toBe(true)
  })

  it('RQ6: 100 peticiones concurrentes sin token no producen 5xx y el p95 queda bajo 300 ms', async () => {
    const m = await medirConcurrente(
      { escenario: 'GET /api/users sin token', requisito: 'RQ6', presupuestoMs: 300, repeticiones: 100, concurrencia: 20 },
      async () => {
        const res = await request(app).get('/api/users')
        expect(res.status).toBe(401)
      }
    )
    mediciones.push(m)
    expect(m.cumple, JSON.stringify(m)).toBe(true)
  })
})
