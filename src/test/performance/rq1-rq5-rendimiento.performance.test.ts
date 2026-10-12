
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { supabaseModuleMock } from '../helpers/supabase-mock'
import { iniciarSesion } from '../helpers/sesion-http'
import { guardarReporte, medirConcurrente, type Medicion } from '../helpers/medicion'
import { hashPassword, verifyStoredPassword } from '../../utils/passwordSecurity'
import { adminUser } from '../fixtures/users'
import { RoleService } from '../../modules/auth/role.service'

const { repo, fake } = vi.hoisted(() => ({
  repo: {
    findUserByEmail: vi.fn(),
    findUserById: vi.fn(),
    updateUser: vi.fn(),
    createUserWithType: vi.fn(async (d: Record<string, unknown>) => ({ id: 'nuevo', activo: true, ...d })),
    countUsers: vi.fn(),
    findActiveByEmail: vi.fn(),
    insertResetToken: vi.fn(),
    findUnusedResetToken: vi.fn(),
    markResetTokenUsed: vi.fn(),
  },
  fake: {},
}))
void fake

vi.mock('../../config/supabase-only', () => supabaseModuleMock)
vi.mock('../../config/supabaseClient', () => supabaseModuleMock)
vi.mock('../../modules/auth/auth.repository', () => ({ authRepository: repo }))

import { app } from '../../app'

const CLAVE = 'Clave-Segura2026!'
const EMAIL = 'ana@soyudemedellin.edu.co'
const mediciones: Medicion[] = []
let hash = ''
let auth = ''
let n = 0

beforeAll(async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  hash = await hashPassword(CLAVE)
  auth = iniciarSesion(adminUser)
  vi.spyOn(RoleService, 'obtenerRolesUsuario').mockResolvedValue(['estudiante'])
  vi.spyOn(RoleService, 'obtenerPermisosUsuario').mockResolvedValue([])
  vi.spyOn(RoleService, 'obtenerDashboardUsuario').mockResolvedValue('/dashboard-estudiante')
  repo.findUserByEmail.mockImplementation(async (e: string) =>
    e === EMAIL ? { id: 'u-1', email: EMAIL, nombre: 'Ana', apellido: 'G', tipo_usuario: 'estudiante', activo: true, password: hash } : null
  )
  repo.findActiveByEmail.mockResolvedValue({ id: 'u-1', email: EMAIL, nombre: 'Ana', apellido: 'G' })
  repo.findUnusedResetToken.mockResolvedValue({ id: 'k1', email: EMAIL, token: 't', used: false, expires_at: new Date(Date.now() + 3600_000).toISOString() })
  repo.markResetTokenUsed.mockResolvedValue(null)
  repo.updateUser.mockResolvedValue({})
  repo.insertResetToken.mockResolvedValue(undefined)
})
afterAll(() => {
  guardarReporte('back-rq1-rq5', mediciones)
  vi.restoreAllMocks()
})

const registrar = (m: Medicion) => {
  mediciones.push(m)
  return m
}
const iniciales = { calentamiento: 2 }

describe('RQ1–RQ5 — costo de bcrypt (base de todos los presupuestos)', () => {
  it('hashear una contraseña (12 rondas) tarda ≤ 600 ms (mediana)', async () => {
    const m = registrar(await medirConcurrente({ escenario: 'bcrypt-hash', requisito: 'RQ1/RQ5', presupuestoMs: 600, concurrencia: 1, repeticiones: 8, ...iniciales }, () => hashPassword(CLAVE)))
    expect(m.cumple, JSON.stringify(m)).toBe(true)
  })

  it('verificar una contraseña tarda ≤ 600 ms (mediana)', async () => {
    const m = registrar(await medirConcurrente({ escenario: 'bcrypt-verify', requisito: 'RQ2', presupuestoMs: 600, concurrencia: 1, repeticiones: 8, ...iniciales }, () => verifyStoredPassword(CLAVE, hash)))
    expect(m.cumple, JSON.stringify(m)).toBe(true)
  })
})

describe('RQ2 — login (con bcrypt) bajo concurrencia', () => {
  it.each([
    [1, 600],
    [10, 2_500],
    [50, 10_000],
  ])('login con %i peticiones simultáneas: p95 ≤ %i ms y sin errores', async (concurrencia, presupuestoMs) => {
    const estados: number[] = []
    const m = registrar(
      await medirConcurrente({ escenario: `login-${concurrencia}vu`, requisito: 'RQ2', presupuestoMs, concurrencia, repeticiones: concurrencia * 2, ...iniciales }, async () => {
        estados.push((await request(app).post('/api/auth/login').send({ email: EMAIL, password: CLAVE })).status)
      })
    )
    expect(estados.every((s) => s === 200)).toBe(true)
    expect(m.p95Ms, JSON.stringify(m)).toBeLessThanOrEqual(presupuestoMs)
  })

  it('login con correo inexistente (sin bcrypt) responde ≤ 100 ms con 50 simultáneas', async () => {
    const m = registrar(
      await medirConcurrente({ escenario: 'login-inexistente-50vu', requisito: 'RQ2', presupuestoMs: 100, concurrencia: 50, repeticiones: 100, ...iniciales }, () =>
        request(app).post('/api/auth/login').send({ email: 'nadie@soyudemedellin.edu.co', password: CLAVE })
      )
    )
    expect(m.p95Ms, JSON.stringify(m)).toBeLessThanOrEqual(100)
  })
})

describe('RQ1 — create-user (bcrypt + validación) bajo concurrencia', () => {
  it.each([
    [1, 700],
    [10, 3_000],
  ])('create-user con %i peticiones simultáneas: p95 ≤ %i ms', async (concurrencia, presupuestoMs) => {
    repo.findUserByEmail.mockImplementation(async () => null)
    const estados: number[] = []
    const m = registrar(
      await medirConcurrente({ escenario: `create-user-${concurrencia}vu`, requisito: 'RQ1', presupuestoMs, concurrencia, repeticiones: concurrencia * 2, ...iniciales }, async () => {
        n++
        const res = await request(app)
          .post('/api/auth/create-user')
          .set('Authorization', auth)
          .send({ email: `perf${n}@udemedellin.edu.co`, password: CLAVE, nombre: 'Perf', apellido: 'Test', tipo_usuario: 'profesor' })
        estados.push(res.status)
      })
    )
    expect(estados.every((s) => s === 201)).toBe(true)
    expect(m.p95Ms, JSON.stringify(m)).toBeLessThanOrEqual(presupuestoMs)
  })
})

describe('RQ3.1 / RQ3.4 / RQ5 — recuperación de contraseña', () => {
  it('forgot-password con 50 simultáneas: p95 ≤ 200 ms (sin bcrypt; el correo no está configurado)', async () => {
    const m = registrar(
      await medirConcurrente({ escenario: 'forgot-password-50vu', requisito: 'RQ3.1', presupuestoMs: 200, concurrencia: 50, repeticiones: 100, ...iniciales }, () =>
        request(app).post('/api/auth/forgot-password').send({ email: EMAIL })
      )
    )
    expect(m.p95Ms, JSON.stringify(m)).toBeLessThanOrEqual(200)
  })

  it('validate-reset-token con 50 simultáneas: p95 ≤ 100 ms', async () => {
    const m = registrar(
      await medirConcurrente({ escenario: 'validate-token-50vu', requisito: 'RQ3.4', presupuestoMs: 100, concurrencia: 50, repeticiones: 100, ...iniciales }, () =>
        request(app).get('/api/auth/validate-reset-token/t').query({ email: EMAIL })
      )
    )
    expect(m.p95Ms, JSON.stringify(m)).toBeLessThanOrEqual(100)
  })

  it.each([
    [1, 700],
    [10, 3_000],
  ])('reset-password con %i peticiones simultáneas: p95 ≤ %i ms (incluye bcrypt)', async (concurrencia, presupuestoMs) => {
    const m = registrar(
      await medirConcurrente({ escenario: `reset-password-${concurrencia}vu`, requisito: 'RQ5', presupuestoMs, concurrencia, repeticiones: concurrencia * 2, ...iniciales }, () =>
        request(app).post('/api/auth/reset-password').send({ token: 't', email: EMAIL, newPassword: CLAVE, confirmPassword: CLAVE })
      )
    )
    expect(m.p95Ms, JSON.stringify(m)).toBeLessThanOrEqual(presupuestoMs)
  })
})
