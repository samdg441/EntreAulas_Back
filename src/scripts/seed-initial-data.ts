/**
 * Script para insertar datos iniciales: facultad, carrera, período y primer estudiante.
 * Ejecutar: npm run seed
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

async function seed() {
  console.log('🌱 Iniciando seed de datos iniciales...\n')

  try {
    // 1. Facultad
    console.log('1️⃣ Insertando facultad...')
    const { data: facultad, error: errFacultad } = await supabaseAdmin
      .from('facultades')
      .insert({
        nombre: 'Facultad de Ingeniería',
        codigo: 'F-ING',
        descripcion: 'Facultad de Ingeniería - Formación en ingenierías y tecnología.',
      })
      .select('id')
      .single()

    let facultadId = facultad?.id
    if (errFacultad) {
      if (errFacultad.code === '23505') {
        console.log('   ⚠️ Facultad ya existe, buscando id...')
        const { data: f } = await supabaseAdmin.from('facultades').select('id').eq('codigo', 'F-ING').single()
        facultadId = f?.id ?? 1
      } else {
        throw errFacultad
      }
    }
    facultadId = facultadId ?? 1
    console.log(`   ✅ Facultad id: ${facultadId}\n`)

    // 2. Carrera
    console.log('2️⃣ Insertando carrera...')
    const { data: carrera, error: errCarrera } = await supabaseAdmin
      .from('carreras')
      .insert({
        nombre: 'Ingeniería de Sistemas',
        descripcion: 'Programa de Ingeniería de Sistemas.',
        facultad_id: facultadId,
        activa: true,
      })
      .select('id')
      .single()

    let carreraId = carrera?.id
    if (errCarrera) {
      if (errCarrera.code === '23505' || String(errCarrera.message).includes('duplicate')) {
        console.log('   ⚠️ Carrera ya existe, buscando id...')
        const { data: c } = await supabaseAdmin.from('carreras').select('id').eq('nombre', 'Ingeniería de Sistemas').limit(1).single()
        carreraId = c?.id ?? 1
      } else {
        throw errCarrera
      }
    }
    carreraId = carreraId ?? 1
    console.log(`   ✅ Carrera id: ${carreraId}\n`)

    // 3. Período académico
    console.log('3️⃣ Insertando período académico...')
    const { data: periodo, error: errPeriodo } = await supabaseAdmin
      .from('periodos_academicos')
      .insert({
        ano: 2025,
        semestre: 2,
        activo: true,
      })
      .select('id')
      .single()

    if (errPeriodo) {
      if (errPeriodo.code === '23505' || String(errPeriodo.message).includes('duplicate')) {
        console.log('   ⚠️ Período ya existe.')
      } else {
        throw errPeriodo
      }
    }
    console.log(`   ✅ Período id: ${periodo?.id}\n`)

    // 4. Estudiante (usuario + estudiante + rol)
    const email = 'sgallego035@soyudemedellin.edu.co'
    const passwordPlano = '12345678'
    const nombre = 'Samuel David'
    const apellido = 'Gallego Meneses'
    const codigoEstudiante = '20241001'
    const semestre = '5'

    console.log('4️⃣ Verificando si el usuario ya existe...')
    const { data: existe } = await supabaseAdmin
      .from('usuarios')
      .select('id')
      .eq('email', email)
      .maybeSingle()

    if (existe) {
      console.log('   ⚠️ Ya existe un usuario con ese email. No se crea de nuevo.')
      console.log('\n✅ Seed finalizado (datos ya presentes).')
      process.exit(0)
      return
    }

    console.log('   Creando usuario y estudiante...')
    const hashedPassword = await bcrypt.hash(passwordPlano, 10)

    const { data: usuario, error: errUsuario } = await supabaseAdmin
      .from('usuarios')
      .insert({
        email,
        password: hashedPassword,
        nombre,
        apellido,
        tipo_usuario: 'estudiante',
        activo: true,
      })
      .select('id')
      .single()

    if (errUsuario) throw errUsuario
    const usuarioId = usuario!.id
    console.log(`   ✅ Usuario creado id: ${usuarioId}`)

    // El trigger puede haber creado ya la fila en estudiantes; actualizamos o insertamos
    const { data: estudianteExistente } = await supabaseAdmin
      .from('estudiantes')
      .select('id')
      .eq('usuario_id', usuarioId)
      .maybeSingle()

    if (estudianteExistente) {
      await supabaseAdmin
        .from('estudiantes')
        .update({
          codigo: codigoEstudiante,
          carrera_id: carreraId,
          semestre,
          activo: true,
        })
        .eq('usuario_id', usuarioId)
      console.log('   ✅ Estudiante actualizado (codigo, carrera_id, semestre)')
    } else {
      await supabaseAdmin.from('estudiantes').insert({
        usuario_id: usuarioId,
        codigo: codigoEstudiante,
        carrera_id: carreraId,
        semestre,
        activo: true,
      })
      console.log('   ✅ Estudiante creado')
    }

    // Rol estudiante en usuario_roles
    const { error: errRol } = await supabaseAdmin.from('usuario_roles').upsert(
      {
        usuario_id: usuarioId,
        rol: 'estudiante',
        activo: true,
        fecha_asignacion: new Date().toISOString(),
      },
      { onConflict: 'usuario_id,rol' }
    )
    if (errRol) {
      console.warn('   ⚠️ No se pudo asignar rol (puede que ya exista):', errRol.message)
    } else {
      console.log('   ✅ Rol estudiante asignado')
    }

    console.log('\n✅ Seed completado correctamente.')
    console.log('\n📋 Credenciales del estudiante:')
    console.log(`   Email:    ${email}`)
    console.log(`   Password: ${passwordPlano}`)
    console.log(`   Nombre:   ${nombre} ${apellido}`)
    console.log(`   Código:   ${codigoEstudiante} | Carrera id: ${carreraId} | Semestre: ${semestre}`)
  } catch (error: any) {
    console.error('\n❌ Error en seed:', error?.message || error)
    if (error?.details) console.error('   Detalles:', error.details)
    process.exit(1)
  }
}

seed()
