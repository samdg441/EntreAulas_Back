
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { hashPassword } from '../../utils/passwordSecurity'
import { supabaseModuleMock } from '../helpers/supabase-mock'
import { firmarToken, iniciarSesion, reiniciarSesion } from '../helpers/sesion-http'
import { huellaDeClaves } from '../helpers/contrato'
import { adminUser } from '../fixtures/users'

const { repo, fake } = vi.hoisted(() => ({
  repo: {
    findUserByEmail: vi.fn(), findUserById: vi.fn(), updateUser: vi.fn(), createUserWithType: vi.fn(), countUsers: vi.fn(),
    findActiveByEmail: vi.fn(), insertResetToken: vi.fn(), invalidateResetTokens: vi.fn().mockResolvedValue(null), findUnusedResetToken: vi.fn(), markResetTokenUsed: vi.fn(),
  },
  fake: {},
}))
void fake
vi.mock('../../config/supabase-only', () => supabaseModuleMock)
vi.mock('../../config/supabaseClient', () => supabaseModuleMock)
vi.mock('../../modules/auth/auth.repository', () => ({ authRepository: repo }))

import { app } from '../../app'
import { RoleService } from '../../modules/auth/role.service'

const LINEA_BASE = path.resolve(__dirname, '../fixtures/contrato-auth-rq1-rq5.json')
const CLAVE = 'Clave-Segura2026!'
const EMAIL = 'ana@udemedellin.edu.co'
let hash = ''

beforeEach(async () => {
  hash ||= await hashPassword(CLAVE)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(RoleService, 'obtenerPermisosUsuario').mockResolvedValue(['ver_evaluaciones'])
  vi.spyOn(RoleService, 'obtenerRolesUsuario').mockResolvedValue(['profesor'])
  vi.spyOn(RoleService, 'obtenerDashboardUsuario').mockResolvedValue('/dashboard-profesor')
  const cuenta = { id: 'u-1', email: EMAIL, nombre: 'ANA', apellido: 'PÉREZ', tipo_usuario: 'profesor', activo: true, password: hash, created_at: '2026-01-01T00:00:00Z' }
  repo.findUserByEmail.mockImplementation(async (e: string) => (e === EMAIL ? cuenta : null))
  repo.createUserWithType.mockImplementation(async (d: Record<string, unknown>) => ({ id: 'nuevo-1', activo: true, ...d }))
  repo.findActiveByEmail.mockResolvedValue({ id: 'u-1', email: EMAIL, nombre: 'Ana', apellido: 'G' })
  repo.findUnusedResetToken.mockResolvedValue({ id: 'k1', email: EMAIL, token: 't', used: false, expires_at: new Date(Date.now() + 3600_000).toISOString() })
  repo.markResetTokenUsed.mockResolvedValue(null)
  repo.updateUser.mockResolvedValue({})
  repo.insertResetToken.mockResolvedValue(undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
  reiniciarSesion()
})

const rutas: [string, () => Promise<{ status: number; body: unknown }>][] = [
  ['POST /api/auth/create-user 201 (RQ1)', async () =>
    request(app).post('/api/auth/create-user').set('Authorization', iniciarSesion(adminUser)).send({ email: 'nuevo@udemedellin.edu.co', password: CLAVE, nombre: 'Nuevo', apellido: 'Docente', tipo_usuario: 'profesor' })],
  ['POST /api/auth/login 200 (RQ2)', async () => request(app).post('/api/auth/login').send({ email: EMAIL, password: CLAVE })],
  ['POST /api/auth/login 401 (RQ2)', async () => request(app).post('/api/auth/login').send({ email: EMAIL, password: 'Mala-Clave2026!' })],
  ['POST /api/auth/login-with-role 200 (RQ2)', async () => request(app).post('/api/auth/login-with-role').send({ email: EMAIL, password: CLAVE, selectedRole: 'profesor' })],
  ['GET /api/auth/me 200 (RQ2)', async () => request(app).get('/api/auth/me').set('Authorization', `Bearer ${firmarToken({ email: EMAIL })}`)],
  ['POST /api/auth/forgot-password 200 (RQ3.1)', async () => request(app).post('/api/auth/forgot-password').send({ email: EMAIL })],
  ['GET /api/auth/validate-reset-token/:token 200 (RQ3.4)', async () => request(app).get('/api/auth/validate-reset-token/t').query({ email: EMAIL })],
  ['POST /api/auth/reset-password 200 (RQ5)', async () =>
    request(app).post('/api/auth/reset-password').send({ token: 't', email: EMAIL, newPassword: 'Nueva-Clave2026!', confirmPassword: 'Nueva-Clave2026!' })],
]

describe('Regresión de contrato — /api/auth (RQ1, RQ2, RQ3.1, RQ3.4, RQ5)', () => {
  it.each(rutas)('%s conserva su huella de claves', async (nombre, llamar) => {
    const res = await llamar()
    const actual = huellaDeClaves(res.body)

    if (process.env.ACTUALIZAR_CONTRATO) {
      const previa = JSON.parse(readFileSync(LINEA_BASE, 'utf8').trim() || '{}')
      writeFileSync(LINEA_BASE, JSON.stringify({ ...previa, [nombre]: actual }, null, 2) + '\n')
      return
    }

    const base = JSON.parse(readFileSync(LINEA_BASE, 'utf8'))[nombre] as string[] | undefined
    expect(base, `Falta la línea base de «${nombre}». Ejecuta con ACTUALIZAR_CONTRATO=1`).toBeDefined()
    const sobran = actual.filter((k) => !base!.includes(k))
    const faltan = base!.filter((k) => !actual.includes(k))
    expect({ sobran, faltan }, `Cambió el contrato de «${nombre}»`).toEqual({ sobran: [], faltan: [] })
  })
})
