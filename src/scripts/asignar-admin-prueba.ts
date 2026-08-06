/**
 * Asigna rol `admin` (y asegura `estudiante`) a usuarios de prueba.
 * Uso: npx ts-node src/scripts/asignar-admin-prueba.ts
 */
import dotenv from 'dotenv'
import { supabaseAdmin } from '../config/supabase-only'

dotenv.config()

const TARGETS = [
  { email: 'jfranco140@soyudemedellin.edu.co', doc: '1034988140' },
  { email: 'arivas115@soyudemedellin.edu.co', doc: '1004700115' },
  { email: 'jarias052@soyudemedellin.edu.co', doc: '1025645052' },
  { email: 'sgallego035@soyudemedellin.edu.co', doc: '1023628035' },
]

async function ensureRole(usuarioId: string, rol: string) {
  const { error } = await supabaseAdmin.from('usuario_roles').upsert(
    {
      usuario_id: usuarioId,
      rol,
      activo: true,
      fecha_asignacion: new Date().toISOString(),
    },
    { onConflict: 'usuario_id,rol' }
  )
  if (error) throw error
}

async function main() {
  console.log('🔐 Asignando rol admin a usuarios de prueba...\n')

  for (const t of TARGETS) {
    const email = t.email.toLowerCase()
    console.log(`→ ${email}`)

    const { data: user, error } = await supabaseAdmin
      .from('usuarios')
      .select('id, email, nombre, apellido, tipo_usuario, activo')
      .ilike('email', email)
      .maybeSingle()

    if (error) {
      console.error(`  ❌ Error buscando: ${error.message}`)
      continue
    }
    if (!user) {
      console.error('  ❌ Usuario no encontrado')
      continue
    }

    console.log(
      `  ✓ Encontrado: ${user.nombre} ${user.apellido} | tipo=${user.tipo_usuario} | activo=${user.activo}`
    )

    try {
      // Mantener capacidad de entrar como estudiante
      await ensureRole(user.id, 'estudiante')
      await ensureRole(user.id, 'admin')
    } catch (e: any) {
      console.error(`  ❌ Error asignando roles: ${e?.message || e}`)
      continue
    }

    const { data: roles, error: rolesErr } = await supabaseAdmin
      .from('usuario_roles')
      .select('rol, activo')
      .eq('usuario_id', user.id)
      .eq('activo', true)
      .order('rol')

    if (rolesErr) {
      console.error(`  ⚠️ Roles asignados pero no se pudieron listar: ${rolesErr.message}`)
    } else {
      console.log(`  ✓ Roles activos: ${(roles || []).map((r) => r.rol).join(', ')}`)
    }
    console.log('')
  }

  console.log('✅ Listo. Al iniciar sesión podrán elegir Estudiante o Administrador.')
}

main().catch((e) => {
  console.error('Fallo del script:', e)
  process.exit(1)
})
