/**
 * Presupuestos de tiempo del back para RQ18 y RQ22–RQ25 con volúmenes de producción.
 *
 * Dos niveles:
 * - Lógica pura: detecta cambios de complejidad (O(n) → O(n²)).
 * - HTTP con la base simulada: mide lo que cuesta la app en sí (Express, JWT, roles, JSON)
 *   bajo concurrencia. Comparado con la prueba de carga real (`npm run test:carga`), separa
 *   el costo propio del back del costo de las consultas a Supabase.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { supabaseModuleMock } from '../helpers/supabase-mock'
import { iniciarSesion } from '../helpers/sesion-http'
import { guardarReporte, medir, medirConcurrente, type Medicion } from '../helpers/medicion'
import { coordinadorUser } from '../fixtures/users'

vi.mock('../../config/supabase-only', () => supabaseModuleMock)
vi.mock('../../config/supabaseClient', () => supabaseModuleMock)

import { app } from '../../app'
import { coordinadorService } from '../../modules/analytics/coordinador.service'
import { calcularPromedio, resumenHistorico } from '../../modules/analytics/calificaciones'
import { armarResumenCoordinador } from '../../modules/analytics/coordinador-resumen'
import { armarFilasReporte, type AgregadoReporte } from '../../modules/analytics/reporte-exportacion'
import { pngQrConLogo } from '../../modules/evaluations/qr-imagen'

const mediciones: Medicion[] = []

function plantel(docentes: number, evaluaciones: number) {
  return {
    profesores: Array.from({ length: docentes }, (_, i) => ({ id: i + 1, usuario_id: `u${i + 1}` })),
    usuarios: Array.from({ length: docentes }, (_, i) => ({
      id: `u${i + 1}`,
      nombre: i % 7 === 0 ? 'Ana' : 'Luis',
      apellido: `Docente ${i}`,
      email: `docente${i}@udemedellin.edu.co`,
    })),
    evaluaciones: Array.from({ length: evaluaciones }, (_, i) => ({
      profesor_id: (i % docentes) + 1,
      calificacion_promedio: 1 + (i % 5),
    })),
    totalCursos: 200,
  }
}

function agregadosReporte(filas: number) {
  const rowAgg = new Map<string, AgregadoReporte>()
  const catAggByRow = new Map<string, Map<string, { sum: number; count: number }>>()
  const teacherNameById = new Map<string, string>()
  for (let i = 0; i < filas; i++) {
    const profesorId = String(i % 400)
    teacherNameById.set(profesorId, `Docente ${profesorId}`)
    rowAgg.set(`r${i}`, {
      profesorId,
      cursoNombre: `Asignatura ${i % 120}`,
      grupo: String(i % 9),
      estudiantes: 30,
      evaluadoresSet: new Set(['a', 'b', 'c']),
      sumPromedio: 4.2 * 25,
      countPromedio: 25,
    })
    catAggByRow.set(`r${i}`, new Map(['1', '2', '3', '4', '5'].map((c) => [c, { sum: 100, count: 25 }])))
  }
  const categoryNameById = new Map([['1', 'Metodología'], ['2', 'Conocimiento del tema'], ['3', 'Evaluación'], ['4', 'Comunicación'], ['5', 'Disponibilidad']])
  return [rowAgg, catAggByRow, categoryNameById, teacherNameById] as const
}

describe('RQ18, RQ22–RQ25 — Rendimiento de la lógica', () => {
  afterAll(() => {
    guardarReporte('back-logica-rq18-rq25', mediciones)
  })

  it('RQ18: generar el PNG de un QR con logo tarda menos de 150 ms', () => {
    const m = medir({ escenario: 'pngQrConLogo', requisito: 'RQ18', presupuestoMs: 150, repeticiones: 20 }, () =>
      pngQrConLogo('https://entre-aulas-front.vercel.app/qr-evaluacion?token=tok-63')
    )
    mediciones.push(m)
    expect(m.cumple, JSON.stringify(m)).toBe(true)
  })

  it('RQ22: promediar 100.000 calificaciones tarda menos de 30 ms', () => {
    const notas = Array.from({ length: 100_000 }, (_, i) => (i % 6) + (i % 11 === 0 ? 99 : 0))
    const m = medir({ escenario: 'calcularPromedio 100k', requisito: 'RQ22', presupuestoMs: 30 }, () => calcularPromedio(notas))
    mediciones.push(m)
    expect(m.cumple, JSON.stringify(m)).toBe(true)
  })

  it('RQ23: el histórico de 100.000 evaluaciones tarda menos de 150 ms', () => {
    const evaluaciones = Array.from({ length: 100_000 }, (_, i) => ({
      calificacion_promedio: 1 + (i % 5),
      fecha_creacion: `2026-${String((i % 12) + 1).padStart(2, '0')}-15`,
    }))
    const m = medir({ escenario: 'resumenHistorico 100k', requisito: 'RQ23', presupuestoMs: 150, repeticiones: 15 }, () =>
      resumenHistorico(evaluaciones, '2026-1')
    )
    mediciones.push(m)
    expect(m.cumple, JSON.stringify(m)).toBe(true)
  })

  it('RQ24: el resumen de 500 docentes y 50.000 evaluaciones tarda menos de 100 ms', () => {
    const datos = plantel(500, 50_000)
    const m = medir({ escenario: 'armarResumenCoordinador 500/50k', requisito: 'RQ24', presupuestoMs: 100, repeticiones: 15 }, () =>
      armarResumenCoordinador({ ...datos, search: 'ana', page: 2, pageSize: 8 })
    )
    mediciones.push(m)
    expect(m.cumple, JSON.stringify(m)).toBe(true)
  })

  it('RQ24: el resumen escala lineal (10x evaluaciones ≈ 10x tiempo, nunca 100x)', () => {
    const chico = plantel(500, 5_000)
    const grande = plantel(500, 50_000)
    const a = medir({ escenario: 'armarResumenCoordinador 500/5k', requisito: 'RQ24', presupuestoMs: 20, repeticiones: 20 }, () =>
      armarResumenCoordinador(chico)
    )
    const b = medir({ escenario: 'armarResumenCoordinador 500/50k (escala)', requisito: 'RQ24', presupuestoMs: 100, repeticiones: 20 }, () =>
      armarResumenCoordinador(grande)
    )
    mediciones.push(a, b)
    expect(b.medianaMs / Math.max(a.medianaMs, 0.01)).toBeLessThan(30)
  })

  it('RQ25: armar 5.000 filas del reporte con 5 categorías tarda menos de 150 ms', () => {
    const args = agregadosReporte(5_000)
    const m = medir({ escenario: 'armarFilasReporte 5k', requisito: 'RQ25', presupuestoMs: 150, repeticiones: 15 }, () =>
      armarFilasReporte(...args)
    )
    mediciones.push(m)
    expect(m.cumple, JSON.stringify(m)).toBe(true)
  })
})

describe('RQ19/RQ24 — Costo propio de la API bajo concurrencia (base simulada)', () => {
  const resultados: Medicion[] = []
  let auth = ''

  beforeAll(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    auth = iniciarSesion(coordinadorUser)
    const respuesta = armarResumenCoordinador({ ...plantel(500, 50_000), pageSize: 8 })
    vi.spyOn(coordinadorService, 'getDashboardSummary').mockResolvedValue(respuesta as never)
  })
  afterAll(() => {
    guardarReporte('back-http-rq19-rq24', resultados)
    vi.restoreAllMocks()
  })

  it.each([1, 10, 50])('%i peticiones simultáneas a dashboard-summary: p95 menor a 100 ms y sin errores', async (concurrencia) => {
    const estados: number[] = []
    const m = await medirConcurrente(
      { escenario: `GET dashboard-summary x${concurrencia}`, requisito: 'RQ19/RQ24', presupuestoMs: 100, concurrencia, repeticiones: 200 },
      async () => {
        const res = await request(app).get('/api/coordinador/dashboard-summary').set('Authorization', auth)
        estados.push(res.status)
      }
    )
    resultados.push(m)
    expect(estados.every((s) => s === 200)).toBe(true)
    expect(m.p95Ms, JSON.stringify(m)).toBeLessThan(100)
  })

  it('un 401 bajo 50 peticiones simultáneas sigue siendo rápido (sin consultar la base)', async () => {
    const m = await medirConcurrente(
      { escenario: 'GET dashboard-summary sin token x50', requisito: 'RQ19', presupuestoMs: 50, concurrencia: 50, repeticiones: 200 },
      () => request(app).get('/api/coordinador/dashboard-summary')
    )
    resultados.push(m)
    expect(m.p95Ms, JSON.stringify(m)).toBeLessThan(100)
  })
})
