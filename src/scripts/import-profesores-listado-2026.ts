/**
 * Importa profesores desde back/ListadoActualizadoProfes2026.csv
 * Columnas: NOMBRE Y APELLIDO;Correo institucional;Vinculación
 *
 * - Si el usuario ya existe y ya tiene fila en profesores → omite.
 * - Si el usuario existe pero no tiene profesores → inserta fila profesor (+ rol si falta).
 * - Si no existe → crea usuario (password bcrypt), rol profesor, fila profesores.
 *
 * Contraseña inicial: variable IMPORT_PROFESOR_PASSWORD (por defecto Cambiar2026!)
 */
import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'
import { supabaseAdmin } from '../config/supabase-only'
import { hashPassword } from '../utils/passwordSecurity'

dotenv.config()

const CSV_REL = path.join(__dirname, '..', '..', 'ListadoActualizadoProfes2026.csv')

function splitNombreApellido(full: string): { nombre: string; apellido: string } {
  const s = full.trim().replace(/\s+/g, ' ')
  if (!s) return { nombre: 'Profesor', apellido: 'Sin nombre' }
  const parts = s.split(' ')
  if (parts.length === 1) return { nombre: parts[0], apellido: '-' }
  if (parts.length === 2) return { nombre: parts[0], apellido: parts[1] }
  return {
    nombre: parts.slice(0, -2).join(' '),
    apellido: parts.slice(-2).join(' ')
  }
}

function parseCsv(): { nombreCompleto: string; email: string; vinculacion: string }[] {
  if (!fs.existsSync(CSV_REL)) {
    throw new Error(`No se encontró: ${CSV_REL}`)
  }
  const raw = fs.readFileSync(CSV_REL, 'utf-8').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean)
  const out: { nombreCompleto: string; email: string; vinculacion: string }[] = []
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(';').map((c) => c.trim())
    if (cols.length < 2) continue
    const nombreCompleto = cols[0] || ''
    const email = (cols[1] || '').trim()
    const vinculacion = (cols[2] || '').trim()
    if (!email.includes('@')) continue
    out.push({ nombreCompleto, email, vinculacion })
  }
  return out
}

async function getCarreraSistemasId(): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from('carreras')
    .select('id')
    .or('nombre.ilike.%ingeniería de sistemas%,nombre.ilike.%ingenieria de sistemas%')
    .limit(1)
    .maybeSingle()

  if (error) throw error
  if (!data?.id) {
    console.warn('⚠️ Carrera Ingeniería de Sistemas no encontrada; usando id=2.')
    return 2
  }
  return Number(data.id)
}

async function findUsuarioPorEmail(email: string): Promise<{ id: string } | null> {
  const e = email.trim()
  const { data, error } = await supabaseAdmin
    .from('usuarios')
    .select('id')
    .ilike('email', e)
    .maybeSingle()

  if (error && error.code !== 'PGRST116') throw error
  return data ?? null
}

async function tieneFilaProfesor(usuarioId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('profesores')
    .select('id')
    .eq('usuario_id', usuarioId)
    .maybeSingle()

  if (error && error.code !== 'PGRST116') throw error
  return !!data
}

async function asegurarRolProfesor(usuarioId: string): Promise<void> {
  const { error } = await supabaseAdmin.from('usuario_roles').upsert(
    {
      usuario_id: usuarioId,
      rol: 'profesor',
      activo: true,
      fecha_asignacion: new Date().toISOString()
    },
    { onConflict: 'usuario_id,rol' }
  )
  if (error && !String(error.message).includes('duplicate')) {
    console.warn(`   ⚠️ Rol profesor: ${error.message}`)
  }
}

async function main() {
  const rows = parseCsv()
  const carreraId = await getCarreraSistemasId()
  const plainPassword = process.env.IMPORT_PROFESOR_PASSWORD || 'Cambiar2026!'
  const hashedPassword = await hashPassword(plainPassword)

  console.log(`📄 CSV: ${CSV_REL}`)
  console.log(`   Filas: ${rows.length} | carrera_id: ${carreraId}`)
  console.log(`   Contraseña inicial (hasheada): variable IMPORT_PROFESOR_PASSWORD o por defecto\n`)

  let creadosUsuario = 0
  let anadidosProfesor = 0
  let yaExistian = 0
  let errores = 0

  for (const row of rows) {
    const emailNorm = row.email.trim().toLowerCase()
    const { nombre, apellido } = splitNombreApellido(row.nombreCompleto)

    try {
      const existente = await findUsuarioPorEmail(emailNorm)

      if (existente) {
        if (await tieneFilaProfesor(existente.id)) {
          console.log(`   ⏭️  Ya existe profesor: ${row.nombreCompleto} (${emailNorm})`)
          yaExistian++
          continue
        }
        await asegurarRolProfesor(existente.id)
        const { error: errP } = await supabaseAdmin.from('profesores').insert({
          usuario_id: existente.id,
          carrera_id: carreraId,
          activo: true,
          departamento: row.vinculacion || null
        })
        if (errP) {
          if (
            String(errP.message).includes('duplicate') ||
            String(errP.message).includes('profesores_usuario_id_key')
          ) {
            console.log(`   ⏭️  Profesor ya vinculado: ${emailNorm}`)
            yaExistian++
          } else {
            console.warn(`   ❌ ${emailNorm}: ${errP.message}`)
            errores++
          }
          continue
        }
        console.log(`   ✅ Profesor añadido (usuario ya existía): ${row.nombreCompleto} (${emailNorm})`)
        anadidosProfesor++
        continue
      }

      const { data: nuevo, error: errU } = await supabaseAdmin
        .from('usuarios')
        .insert({
          email: emailNorm,
          password: hashedPassword,
          nombre,
          apellido,
          tipo_usuario: 'profesor',
          activo: true
        })
        .select('id')
        .single()

      if (errU) {
        console.warn(`   ❌ Usuario ${emailNorm}: ${errU.message}`)
        errores++
        continue
      }

      await asegurarRolProfesor(nuevo!.id)

      // El trigger suele crear ya la fila en profesores; actualizamos carrera/departamento.
      const patch: Record<string, unknown> = {
        carrera_id: carreraId,
        activo: true
      }
      if (row.vinculacion) patch.departamento = row.vinculacion

      const { data: profTrg, error: errFind } = await supabaseAdmin
        .from('profesores')
        .select('id')
        .eq('usuario_id', nuevo!.id)
        .maybeSingle()

      if (errFind) {
        console.warn(`   ❌ Buscar profesor ${emailNorm}: ${errFind.message}`)
        errores++
        continue
      }

      if (profTrg) {
        const { error: errUp } = await supabaseAdmin
          .from('profesores')
          .update(patch)
          .eq('usuario_id', nuevo!.id)
        if (errUp) {
          console.warn(`   ❌ Actualizar profesor ${emailNorm}: ${errUp.message}`)
          errores++
          continue
        }
      } else {
        const { error: errP } = await supabaseAdmin.from('profesores').insert({
          usuario_id: nuevo!.id,
          carrera_id: carreraId,
          activo: true,
          ...(row.vinculacion ? { departamento: row.vinculacion } : {})
        })
        if (errP) {
          console.warn(`   ❌ Profesor ${emailNorm}: ${errP.message}`)
          errores++
          continue
        }
      }

      console.log(`   ✅ Creado: ${row.nombreCompleto} (${emailNorm})`)
      creadosUsuario++
    } catch (e: any) {
      console.warn(`   ❌ ${emailNorm}: ${e?.message || e}`)
      errores++
    }
  }

  console.log('\n📊 Resumen:')
  console.log(`   Nuevos usuarios + profesor: ${creadosUsuario}`)
  console.log(`   Solo fila profesor (usuario ya existía): ${anadidosProfesor}`)
  console.log(`   Ya estaban completos: ${yaExistian}`)
  if (errores) console.log(`   Errores: ${errores}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
