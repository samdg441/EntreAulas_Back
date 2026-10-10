#!/usr/bin/env node
/**
 * Prueba de carga de la API de EntreAulas (RQ18, RQ19, RQ22–RQ25), sin dependencias.
 *
 * Variables de entorno:
 *   API_URL         URL del back (por defecto Render; http://localhost:3000 para local).
 *   TOKEN_FILE      Ruta de un archivo con el JWT de un coordinador. No se pasa el token
 *                   en la línea de comandos para que no quede en el historial ni en los logs.
 *   ETAPAS          Usuarios concurrentes por etapa, separados por coma (por defecto 1,5,10).
 *   DURACION_S      Segundos por etapa (por defecto 15).
 *   PERIODO         Periodo académico (por defecto 2026-1).
 *   PROFESOR_ID     Opcional: agrega profesor-stats (RQ22).
 *   QR_TOKEN        Opcional: agrega la imagen PNG del QR (RQ18).
 *   TIMEOUT_MS      Tiempo máximo por petición (por defecto 30000, igual que el front).
 *
 * Termina con código 1 si algún escenario incumple su criterio de aceptación.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { escenarios as definirEscenarios } from './escenarios.mjs'

const config = {
  apiUrl: (process.env.API_URL || 'https://entreaulas-back.onrender.com').replace(/\/$/, ''),
  etapas: (process.env.ETAPAS || '1,5,10').split(',').map(Number).filter((n) => n > 0),
  duracionS: Number(process.env.DURACION_S || 15),
  periodo: process.env.PERIODO || '2026-1',
  profesorId: process.env.PROFESOR_ID || '',
  qrToken: process.env.QR_TOKEN || '',
  timeoutMs: Number(process.env.TIMEOUT_MS || 30_000),
}
const token = process.env.TOKEN_FILE ? readFileSync(process.env.TOKEN_FILE, 'utf8').trim() : ''

const todos = definirEscenarios(config)
const escenarios = todos.filter((e) => !e.auth || token)
const omitidos = todos.filter((e) => e.auth && !token).map((e) => e.nombre)

function percentil(ordenados, p) {
  if (!ordenados.length) return 0
  const i = Math.min(ordenados.length - 1, Math.ceil((p / 100) * ordenados.length) - 1)
  return Math.round(ordenados[Math.max(0, i)])
}

const esperado = (escenario, estado) => [escenario.estado].flat().includes(estado)

async function pedir(escenario) {
  const inicio = performance.now()
  try {
    const headers = {}
    if (escenario.auth) headers.Authorization = `Bearer ${token}`
    if (escenario.cuerpo) headers['Content-Type'] = 'application/json'
    const resp = await fetch(config.apiUrl + escenario.ruta, {
      method: escenario.metodo || 'GET',
      headers,
      body: escenario.cuerpo ? JSON.stringify(escenario.cuerpo) : undefined,
      signal: AbortSignal.timeout(config.timeoutMs),
    })
    await resp.arrayBuffer()
    return { ms: performance.now() - inicio, estado: resp.status, ok: esperado(escenario, resp.status) }
  } catch (error) {
    const estado = error?.name === 'TimeoutError' ? 'timeout' : 'red'
    return { ms: performance.now() - inicio, estado, ok: false }
  }
}

/** Render duerme el servicio gratuito: sin esperar, la primera etapa mide el arranque y no la API. */
async function esperarServidor(limiteMs = 90_000) {
  const inicio = performance.now()
  let intentos = 0
  while (performance.now() - inicio < limiteMs) {
    intentos++
    const r = await pedir(escenarios[0])
    if (r.ok) return { ms: performance.now() - inicio, intentos }
    await new Promise((listo) => setTimeout(listo, 2_000))
  }
  throw new Error(`El back no respondió /health en ${limiteMs / 1000} s`)
}

/** Cada usuario virtual recorre los escenarios en orden, sin pausa, hasta que acaba la etapa. */
async function usuarioVirtual(hasta, muestras, desfase) {
  let i = desfase
  while (performance.now() < hasta) {
    const escenario = escenarios[i % escenarios.length]
    muestras[escenario.nombre].push(await pedir(escenario))
    i++
  }
}

function resumir(escenario, muestras, segundos) {
  const tiempos = muestras.map((m) => m.ms).sort((a, b) => a - b)
  const errores = muestras.filter((m) => !m.ok)
  const erroresPct = muestras.length ? (errores.length / muestras.length) * 100 : 100
  const estados = {}
  for (const m of muestras) estados[m.estado] = (estados[m.estado] || 0) + 1
  const p95 = percentil(tiempos, 95)
  return {
    escenario: escenario.nombre,
    requisito: escenario.requisito,
    peticiones: muestras.length,
    rps: Math.round((muestras.length / segundos) * 100) / 100,
    p50: percentil(tiempos, 50),
    p90: percentil(tiempos, 90),
    p95,
    p99: percentil(tiempos, 99),
    max: Math.round(tiempos.at(-1) ?? 0),
    erroresPct: Math.round(erroresPct * 100) / 100,
    estados,
    criterio: { p95Ms: escenario.p95Ms, maxErroresPct: escenario.maxErroresPct },
    cumple: muestras.length > 0 && p95 <= escenario.p95Ms && erroresPct <= escenario.maxErroresPct,
  }
}

async function correrEtapa(usuarios) {
  const muestras = Object.fromEntries(escenarios.map((e) => [e.nombre, []]))
  const inicio = performance.now()
  const hasta = inicio + config.duracionS * 1000
  await Promise.all(Array.from({ length: usuarios }, (_, i) => usuarioVirtual(hasta, muestras, i)))
  const segundos = (performance.now() - inicio) / 1000
  return { usuarios, segundos: Math.round(segundos), resultados: escenarios.map((e) => resumir(e, muestras[e.nombre], segundos)) }
}

function tablaMarkdown(etapas) {
  const filas = ['| Usuarios | Escenario | Req. | Peticiones | RPS | p50 | p95 | p99 | Máx | Errores | Criterio p95 | Resultado |', '|---|---|---|---|---|---|---|---|---|---|---|---|']
  for (const etapa of etapas) {
    for (const r of etapa.resultados) {
      filas.push(
        `| ${etapa.usuarios} | ${r.escenario} | ${r.requisito} | ${r.peticiones} | ${r.rps} | ${r.p50} ms | ${r.p95} ms | ${r.p99} ms | ${r.max} ms | ${r.erroresPct} % | ≤ ${r.criterio.p95Ms} ms | ${r.cumple ? 'CUMPLE' : 'NO CUMPLE'} |`
      )
    }
  }
  return filas.join('\n')
}

async function main() {
  console.log(`Back: ${config.apiUrl} | etapas: ${config.etapas.join(', ')} usuarios | ${config.duracionS} s por etapa`)
  if (omitidos.length) console.log(`Sin TOKEN_FILE: se omiten ${omitidos.join(', ')}`)

  const frio = await esperarServidor()
  console.log(`Servidor listo tras ${Math.round(frio.ms)} ms (${frio.intentos} intento(s); en Render incluye el arranque en frío)`)

  const etapas = []
  for (const usuarios of config.etapas) {
    console.log(`\nEtapa: ${usuarios} usuario(s) concurrente(s), ${config.duracionS} s...`)
    const etapa = await correrEtapa(usuarios)
    etapas.push(etapa)
    for (const r of etapa.resultados) {
      console.log(
        `  ${r.cumple ? 'OK ' : 'MAL'} ${r.escenario.padEnd(18)} p50 ${r.p50} ms | p95 ${r.p95} ms (≤ ${r.criterio.p95Ms}) | ${r.rps} rps | errores ${r.erroresPct} % ${JSON.stringify(r.estados)}`
      )
    }
  }

  const fecha = new Date().toISOString()
  const carpeta = path.resolve('reports', 'carga')
  mkdirSync(carpeta, { recursive: true })
  const base = path.join(carpeta, `carga-${fecha.replace(/[:.]/g, '-')}`)
  const destino = new URL(config.apiUrl).host
  const { qrToken, ...configPublica } = config
  writeFileSync(`${base}.json`, JSON.stringify({ fecha, destino, config: { ...configPublica, token: Boolean(token), qrToken: Boolean(qrToken) }, arranqueFrioMs: Math.round(frio.ms), etapas }, null, 2))
  writeFileSync(`${base}.md`, `# Prueba de carga — ${destino}\n\nFecha: ${fecha}\n\nServidor listo tras: ${Math.round(frio.ms)} ms\n\n${tablaMarkdown(etapas)}\n`)
  console.log(`\nReporte: ${base}.json y .md`)

  const fallos = etapas.flatMap((e) => e.resultados.filter((r) => !r.cumple).map((r) => `${r.escenario}@${e.usuarios}`))
  if (fallos.length) {
    console.log(`Incumplen el criterio: ${fallos.join(', ')}`)
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
