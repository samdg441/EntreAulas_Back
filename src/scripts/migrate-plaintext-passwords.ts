import dotenv from 'dotenv'
import { supabaseAdmin } from '../config/supabase-only'
import { hashPassword, isBcryptHash } from '../utils/passwordSecurity'

dotenv.config()

async function migratePlaintextPasswords() {
  console.log('Iniciando migracion de contrasenas en texto plano...')

  const { data: users, error } = await supabaseAdmin
    .from('usuarios')
    .select('id, email, password')

  if (error) {
    console.error('Error consultando usuarios:', error.message)
    process.exit(1)
  }

  const rows = users ?? []
  const candidates = rows.filter((u: any) => !isBcryptHash(u?.password))

  if (candidates.length === 0) {
    console.log('No hay contrasenas en texto plano para migrar.')
    return
  }

  let migrated = 0
  let failed = 0

  for (const user of candidates) {
    try {
      const plain = String(user.password || '')
      if (!plain) {
        failed += 1
        console.warn(`Saltando usuario ${user.id}: password vacio/null.`)
        continue
      }

      const hashed = await hashPassword(plain)
      const { error: updateError } = await supabaseAdmin
        .from('usuarios')
        .update({ password: hashed })
        .eq('id', user.id)

      if (updateError) {
        failed += 1
        console.warn(`Fallo al migrar ${user.email || user.id}: ${updateError.message}`)
        continue
      }

      migrated += 1
      console.log(`Migrado: ${user.email || user.id}`)
    } catch (e: any) {
      failed += 1
      console.warn(`Error migrando ${user.email || user.id}: ${e?.message || e}`)
    }
  }

  console.log(`Migracion terminada. Migrados: ${migrated}. Fallidos: ${failed}.`)
}

migratePlaintextPasswords().catch((e) => {
  console.error('Error inesperado en migracion:', e)
  process.exit(1)
})
