/**
 * Clase de pruebas HTTP contra el backend.
 *
 * Sustituye el copy-paste de `fromMock` + `queueFrom` + spy de `RoleService`.
 * La frontera I/O sigue siendo un Fake en memoria (`fake-supabase.ts`) hasta
 * que exista un Postgres de prueba; la API de esta clase no cambia en ese paso.
 *
 * El archivo de prueba debe registrar los dobles de config (ver dobles-supabase.ts)
 * y NO mockear auth.
 */
import jwt from 'jsonwebtoken'
import request, { type Test } from 'supertest'
import { vi } from 'vitest'
import { app } from '../../app'
import { fakeDb, type ErrorConsulta, type Fila } from './fake-supabase'
import { setTestUser } from './test-user'

export type UsuarioPrueba = {
  id: string
  email: string
  tipo_usuario: string
  roles?: string[]
  nombre?: string
  apellido?: string
  activo?: boolean
  coordinador?: { carrera_id: number | null }
}

export class ClasePruebas {
  private token: string | null = null

  reset() {
    fakeDb.reset()
    this.token = null
    setTestUser(undefined)
    return this
  }

  silenciarLogs() {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    return this
  }

  sembrar(tabla: string, filas: Fila[]) {
    fakeDb.seed(tabla, filas)
    return this
  }

  /**
   * La siguiente consulta a `tabla` (tras `omitir` aciertos) responde error.
   * Auth lee `usuarios` una vez: para fallar la carga de docentes usa `omitir: 1`.
   */
  fallarTabla(tabla: string, error: ErrorConsulta = { message: 'db' }, omitir = 0) {
    fakeDb.fail(tabla, error, omitir)
    return this
  }

  autenticarComo(user: UsuarioPrueba) {
    const activo = user.activo !== false
    fakeDb.seed('usuarios', [
      {
        id: user.id,
        email: user.email,
        tipo_usuario: user.tipo_usuario,
        nombre: user.nombre ?? 'Test',
        apellido: user.apellido ?? 'User',
        activo,
      },
    ])
    const roles = user.roles ?? [user.tipo_usuario]
    fakeDb.seed(
      'usuario_roles',
      roles.map((rol) => ({
        usuario_id: user.id,
        rol,
        activo: true,
      }))
    )
    if (user.coordinador) {
      fakeDb.seed('coordinadores', [
        {
          usuario_id: user.id,
          carrera_id: user.coordinador.carrera_id,
          activo: true,
        },
      ])
    }
    const secret = process.env.JWT_SECRET
    if (!secret) throw new Error('JWT_SECRET no definido (setup.ts debe fijarlo)')
    this.token = jwt.sign(
      { userId: user.id, email: user.email, tipo_usuario: user.tipo_usuario },
      secret,
      { expiresIn: '1h' }
    )
    return this
  }

  sinAutenticar() {
    this.token = null
    return this
  }

  get(path: string) {
    return this.conAuth(request(app).get(path))
  }

  post(path: string, body?: object) {
    const req = this.conAuth(request(app).post(path))
    return body ? req.send(body) : req
  }

  private conAuth(req: Test) {
    if (this.token) req.set('Authorization', `Bearer ${this.token}`)
    return req
  }
}
