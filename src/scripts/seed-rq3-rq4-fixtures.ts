/**
 * Siembra los fixtures que necesitan rq3-solicitud-recuperacion-contrasena.test.ts,
 * rq3-2-validacion-token-recuperacion.test.ts y rq4-envio-correo-recuperacion.test.ts
 * para correr contra un Supabase real (sin mocks).
 *
 * Ejecutar: npx ts-node src/scripts/seed-rq3-rq4-fixtures.ts
 */
import dotenv from 'dotenv'
import bcrypt from 'bcrypt'
import { supabaseAdmin } from '../config/supabase-only'

dotenv.config()

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env')
  process.exit(1)
}

const EMAIL =
  process.env.RQ3_EMAIL_EXISTENTE ??
  process.env.RQ4_EMAIL_EXISTENTE ??
  'usuario.activo@entreaulas.test'
const TOKEN_VALIDO = process.env.RQ32_TOKEN_VALIDO ?? 'a'.repeat(64)
const TOKEN_EXPIRADO = process.env.RQ32_TOKEN_EXPIRADO ?? 'b'.repeat(64)

async function asegurarUsuarioActivo(email: string, nombre: string, apellido: string) {
  const { data: existente } = await supabaseAdmin
    .from('usuarios')
    .select('id, activo')
    .eq('email', email)
    .maybeSingle()

  if (existente) {
    if (!existente.activo) {
      await supabaseAdmin.from('usuarios').update({ activo: true }).eq('id', existente.id)
      console.log(`   ⚠️ Usuario ${email} existía inactivo → activado`)
    } else {
      console.log(`   ✅ Usuario ${email} ya existe y está activo`)
    }
    return
  }

  const hashedPassword = await bcrypt.hash('password123', 10)
  const { error } = await supabaseAdmin.from('usuarios').insert({
    email,
    password: hashedPassword,
    nombre,
    apellido,
    tipo_usuario: 'estudiante',
    activo: true,
  })
  if (error) throw error
  console.log(`   ✅ Usuario ${email} creado (activo)`)
}

async function asegurarToken(token: string, expiresAt: string, etiqueta: string) {
  const { data: existente } = await supabaseAdmin
    .from('password_reset_tokens')
    .select('id')
    .eq('token', token)
    .maybeSingle()

  if (existente) {
    await supabaseAdmin
      .from('password_reset_tokens')
      .update({ email: EMAIL, expires_at: expiresAt, used: false })
      .eq('id', existente.id)
    console.log(`   ✅ Token ${etiqueta} ya existía → actualizado`)
    return
  }

  const { error } = await supabaseAdmin.from('password_reset_tokens').insert({
    email: EMAIL,
    token,
    expires_at: expiresAt,
    used: false,
  })
  if (error) throw error
  console.log(`   ✅ Token ${etiqueta} creado`)
}

async function seed() {
  console.log('🌱 Sembrando fixtures de RQ3/RQ4 (recuperación de contraseña)...\n')
  try {
    console.log('1️⃣ Usuario activo...')
    await asegurarUsuarioActivo(EMAIL, 'Usuario', 'Activo RQ3')

    console.log('\n1️⃣.1 Usuario activo con "+" en el email (RQ4 N5, codificación de URL)...')
    await asegurarUsuarioActivo('prueba+rq4@entreaulas.test', 'Usuario', 'Plus RQ4')

    console.log('\n2️⃣ Token válido (RQ32_TOKEN_VALIDO)...')
    const enUnaHora = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    await asegurarToken(TOKEN_VALIDO, enUnaHora, 'válido')

    console.log('\n3️⃣ Token expirado (RQ32_TOKEN_EXPIRADO)...')
    const haceUnaHora = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    await asegurarToken(TOKEN_EXPIRADO, haceUnaHora, 'expirado')

    console.log('\n✅ Seed de RQ3/RQ4 completado.')
    console.log(`   Email: ${EMAIL}`)
    console.log(`   Token válido:   ${TOKEN_VALIDO}`)
    console.log(`   Token expirado: ${TOKEN_EXPIRADO}`)
  } catch (error: any) {
    console.error('\n❌ Error en seed:', error?.message || error)
    if (error?.details) console.error('   Detalles:', error.details)
    process.exit(1)
  }
}

seed()
