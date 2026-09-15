/**
 * Siembra los fixtures que necesitan rq1-crear-usuario-admin.test.ts y
 * rq2-login.test.ts para correr contra un Supabase real (sin mocks de
 * authRepository/RoleService). Es idempotente: se puede correr las veces
 * que haga falta, solo actualiza/crea lo que falte.
 *
 * NO crea los usuarios que los propios tests insertan y borran
 * (rq1.nuevo@entreaulas.test, rq1.nuevo.profesor@entreaulas.test) — esos
 * deben quedar ausentes antes de cada corrida, los tests se encargan.
 *
 * Ejecutar: npx ts-node src/scripts/seed-rq1-rq2-fixtures.ts
 */
import dotenv from 'dotenv'
import bcrypt from 'bcrypt'
import { supabaseAdmin } from '../config/supabase-only'

dotenv.config()

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env')
  process.exit(1)
}

const PASSWORD_PLANO = 'password123'

async function asegurarFacultad(nombre: string, codigo: string): Promise<number> {
  const { data: existente } = await supabaseAdmin
    .from('facultades')
    .select('id')
    .eq('codigo', codigo)
    .maybeSingle()
  if (existente) return existente.id as number

  const { data, error } = await supabaseAdmin
    .from('facultades')
    .insert({ nombre, codigo, descripcion: `${nombre} (fixture de pruebas RQ1/RQ2)` })
    .select('id')
    .single()
  if (error) throw error
  return data!.id as number
}

async function asegurarCarrera(nombre: string, facultadId: number): Promise<number> {
  const { data: existente } = await supabaseAdmin
    .from('carreras')
    .select('id')
    .eq('nombre', nombre)
    .maybeSingle()
  if (existente) return existente.id as number

  const { data, error } = await supabaseAdmin
    .from('carreras')
    .insert({ nombre, descripcion: `${nombre} (fixture RQ2)`, facultad_id: facultadId, activa: true })
    .select('id')
    .single()
  if (error) throw error
  return data!.id as number
}

type UsuarioFixture = {
  email: string
  tipo_usuario: string
  activo: boolean
  password?: string // texto plano; si se omite, se guarda hasheado con PASSWORD_PLANO
}

async function asegurarUsuario(fx: UsuarioFixture): Promise<string> {
  const { data: existente } = await supabaseAdmin
    .from('usuarios')
    .select('id')
    .eq('email', fx.email)
    .maybeSingle()
  if (existente) return existente.id as string

  const passwordAlmacenado = fx.password ?? (await bcrypt.hash(PASSWORD_PLANO, 10))
  const { data, error } = await supabaseAdmin
    .from('usuarios')
    .insert({
      email: fx.email,
      password: passwordAlmacenado,
      nombre: 'Fixture',
      apellido: fx.tipo_usuario,
      tipo_usuario: fx.tipo_usuario,
      activo: fx.activo,
    })
    .select('id')
    .single()
  if (error) throw error
  return data!.id as string
}

async function asegurarRol(usuarioId: string, rol: string) {
  const { error } = await supabaseAdmin
    .from('usuario_roles')
    .upsert(
      { usuario_id: usuarioId, rol, activo: true, fecha_asignacion: new Date().toISOString() },
      { onConflict: 'usuario_id,rol' }
    )
  if (error) throw error
}

async function asegurarCoordinador(usuarioId: string, carreraId: number) {
  const { data: existente } = await supabaseAdmin
    .from('coordinadores')
    .select('id')
    .eq('usuario_id', usuarioId)
    .maybeSingle()
  if (existente) return

  const { error } = await supabaseAdmin.from('coordinadores').insert({
    usuario_id: usuarioId,
    carrera_id: carreraId,
    fecha_nombramiento: new Date().toISOString(),
    activo: true,
  })
  if (error) throw error
}

async function asegurarDecano(usuarioId: string, facultadId: number) {
  const { data: existente } = await supabaseAdmin
    .from('decanos')
    .select('id')
    .eq('usuario_id', usuarioId)
    .maybeSingle()
  if (existente) return

  const { error } = await supabaseAdmin.from('decanos').insert({
    usuario_id: usuarioId,
    facultad_id: facultadId,
    fecha_nombramiento: new Date().toISOString(),
    activo: true,
  })
  if (error) throw error
}

async function seed() {
  console.log('🌱 Sembrando fixtures de RQ1/RQ2 (create-user / login)...\n')

  const facultadId = await asegurarFacultad('Facultad RQ2 Fixtures', 'F-RQ2')
  const carreraId = await asegurarCarrera('Carrera RQ2 Fixtures', facultadId)
  console.log(`✅ Facultad id=${facultadId}, Carrera id=${carreraId}\n`)

  // --- RQ1: admin para las pruebas de create-user ---
  const adminId = await asegurarUsuario({
    email: 'rq1.admin@entreaulas.test',
    tipo_usuario: 'admin',
    activo: true,
  })
  await asegurarRol(adminId, 'admin')
  console.log(`✅ rq1.admin@entreaulas.test (id=${adminId})\n`)

  // --- RQ2: escenarios de login ---
  const estudianteId = await asegurarUsuario({
    email: 'rq2.activo.estudiante@entreaulas.test',
    tipo_usuario: 'estudiante',
    activo: true,
  })
  await asegurarRol(estudianteId, 'estudiante')
  console.log(`✅ rq2.activo.estudiante@entreaulas.test (id=${estudianteId})`)

  const inactivoId = await asegurarUsuario({
    email: 'rq2.inactivo@entreaulas.test',
    tipo_usuario: 'estudiante',
    activo: false,
  })
  console.log(`✅ rq2.inactivo@entreaulas.test (id=${inactivoId})`)

  const multirolesId = await asegurarUsuario({
    email: 'rq2.multiroles@entreaulas.test',
    tipo_usuario: 'estudiante',
    activo: true,
  })
  await asegurarRol(multirolesId, 'estudiante')
  await asegurarRol(multirolesId, 'profesor')
  console.log(`✅ rq2.multiroles@entreaulas.test (id=${multirolesId})`)

  // NOTA: no se siembra un usuario con tipo_usuario inválido (ej. 'invitado').
  // La tabla 'usuarios' tiene un CHECK constraint (usuarios_tipo_usuario_check,
  // ver scripts/add-decano-role.sql) que solo permite
  // estudiante/profesor/docente/coordinador/admin/decano — el mismo set que
  // VALID_USER_TYPES en el código. Un tipo_usuario inválido es estructuralmente
  // imposible de insertar en la BD real; esa rama defensiva de tieneRolValido
  // solo se puede probar mockeando la fila (JWT viejo o edición manual de BD),
  // no con datos reales. Se deja como mock explícito en el test.

  const coordinadorId = await asegurarUsuario({
    email: 'rq2.coordinador@entreaulas.test',
    tipo_usuario: 'coordinador',
    activo: true,
  })
  await asegurarRol(coordinadorId, 'coordinador')
  await asegurarCoordinador(coordinadorId, carreraId)
  console.log(`✅ rq2.coordinador@entreaulas.test (id=${coordinadorId})`)

  const decanoId = await asegurarUsuario({
    email: 'rq2.decano@entreaulas.test',
    tipo_usuario: 'decano',
    activo: true,
  })
  await asegurarRol(decanoId, 'decano')
  await asegurarDecano(decanoId, facultadId)
  console.log(`✅ rq2.decano@entreaulas.test (id=${decanoId})`)

  const migracionId = await asegurarUsuario({
    email: 'rq2.migracion@entreaulas.test',
    tipo_usuario: 'estudiante',
    activo: true,
    password: PASSWORD_PLANO, // se guarda en texto plano a propósito
  })
  await asegurarRol(migracionId, 'estudiante')
  console.log(`✅ rq2.migracion@entreaulas.test (id=${migracionId}, password en texto plano)`)

  console.log('\n✅ Seed de RQ1/RQ2 completado. Password de todos (excepto migración): ' + PASSWORD_PLANO)
}

seed().catch((error) => {
  console.error('\n❌ Error en seed:', error?.message || error)
  if (error?.details) console.error('   Detalles:', error.details)
  process.exit(1)
})
