import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

export type Medicion = {
  escenario: string
  requisito: string
  repeticiones: number
  minMs: number
  medianaMs: number
  p95Ms: number
  maxMs: number
  presupuestoMs: number
  cumple: boolean
}

function percentil(ordenados: number[], p: number) {
  const indice = Math.min(ordenados.length - 1, Math.ceil((p / 100) * ordenados.length) - 1)
  return ordenados[Math.max(0, indice)]
}

const redondear = (n: number) => Math.round(n * 1000) / 1000

function resumir(datos: { escenario: string; requisito: string; presupuestoMs: number }, tiempos: number[]): Medicion {
  const ordenados = [...tiempos].sort((a, b) => a - b)
  const medianaMs = percentil(ordenados, 50)
  return {
    escenario: datos.escenario,
    requisito: datos.requisito,
    repeticiones: ordenados.length,
    minMs: redondear(ordenados[0]),
    medianaMs: redondear(medianaMs),
    p95Ms: redondear(percentil(ordenados, 95)),
    maxMs: redondear(ordenados.at(-1)!),
    presupuestoMs: datos.presupuestoMs,
    cumple: medianaMs <= datos.presupuestoMs,
  }
}

type Datos = { escenario: string; requisito: string; presupuestoMs: number; repeticiones?: number; calentamiento?: number }

/**
 * Mide `fn` varias veces tras un calentamiento (el JIT optimiza las primeras corridas)
 * y compara la mediana contra el presupuesto: la mediana tolera picos aislados del equipo.
 */
export function medir(datos: Datos, fn: () => unknown): Medicion {
  for (let i = 0; i < (datos.calentamiento ?? 5); i++) fn()
  const tiempos: number[] = []
  for (let i = 0; i < (datos.repeticiones ?? 30); i++) {
    const inicio = performance.now()
    fn()
    tiempos.push(performance.now() - inicio)
  }
  return resumir(datos, tiempos)
}

/** Igual que `medir`, pero lanza `concurrencia` llamadas a la vez y mide cada una. */
export async function medirConcurrente(
  datos: Datos & { concurrencia: number },
  fn: () => Promise<unknown>
): Promise<Medicion & { concurrencia: number }> {
  for (let i = 0; i < (datos.calentamiento ?? 5); i++) await fn()
  const tiempos: number[] = []
  const rondas = Math.ceil((datos.repeticiones ?? 200) / datos.concurrencia)
  for (let r = 0; r < rondas; r++) {
    await Promise.all(
      Array.from({ length: datos.concurrencia }, async () => {
        const inicio = performance.now()
        await fn()
        tiempos.push(performance.now() - inicio)
      })
    )
  }
  return { ...resumir(datos, tiempos), concurrencia: datos.concurrencia }
}

export function guardarReporte(nombre: string, mediciones: Medicion[]) {
  const carpeta = path.resolve('reports', 'rendimiento')
  mkdirSync(carpeta, { recursive: true })
  const archivo = path.join(carpeta, `${nombre}.json`)
  writeFileSync(archivo, JSON.stringify({ fecha: new Date().toISOString(), node: process.version, mediciones }, null, 2))
  return archivo
}
