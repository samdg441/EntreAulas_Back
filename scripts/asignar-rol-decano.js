const { createClient } = require('@supabase/supabase-js');

// Configuración básica - necesitarás configurar estas variables
const supabaseUrl = process.env.SUPABASE_URL || 'https://your-project.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'your-service-role-key';

if (supabaseUrl === 'https://your-project.supabase.co' || supabaseKey === 'your-service-role-key') {
  console.log('❌ Por favor configura las variables de entorno:');
  console.log('   SUPABASE_URL=tu_url_de_supabase');
  console.log('   SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key');
  console.log('\n💡 Puedes crear un archivo .env en la carpeta back/ con estas variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function asignarRolDecano() {
  console.log('🔧 Script para asignar rol de decano\n');

  try {
    // 1. Listar usuarios disponibles
    console.log('📋 Paso 1: Usuarios disponibles en el sistema');
    const { data: usuarios, error: usuariosError } = await supabase
      .from('usuarios')
      .select('id, email, nombre, apellido, tipo_usuario, activo')
      .eq('activo', true)
      .order('email');

    if (usuariosError) {
      console.error('❌ Error obteniendo usuarios:', usuariosError);
      return;
    }

    console.log(`✅ Usuarios encontrados: ${usuarios?.length || 0}`);
    usuarios?.forEach((user, index) => {
      console.log(`   ${index + 1}. ${user.email} (${user.nombre} ${user.apellido}) - ${user.tipo_usuario}`);
    });

    // 2. Buscar usuarios que podrían ser decanos
    console.log('\n📋 Paso 2: Usuarios candidatos para decano');
    const candidatosDecano = usuarios?.filter(user => 
      user.email.includes('decano') || 
      user.email.includes('admin') ||
      user.tipo_usuario === 'profesor' ||
      user.tipo_usuario === 'coordinador'
    );

    if (candidatosDecano && candidatosDecano.length > 0) {
      console.log('🎯 Candidatos para decano:');
      candidatosDecano.forEach((user, index) => {
        console.log(`   ${index + 1}. ${user.email} (${user.nombre} ${user.apellido}) - ${user.tipo_usuario}`);
      });

      // 3. Asignar rol de decano al primer candidato
      const usuarioDecano = candidatosDecano[0];
      console.log(`\n🔧 Asignando rol de decano a: ${usuarioDecano.email}`);

      // Verificar si ya tiene el rol
      const { data: rolExistente, error: rolError } = await supabase
        .from('usuario_roles')
        .select('id, rol, activo')
        .eq('usuario_id', usuarioDecano.id)
        .eq('rol', 'decano')
        .eq('activo', true)
        .single();

      if (rolError && rolError.code !== 'PGRST116') {
        console.error('❌ Error verificando rol existente:', rolError);
        return;
      }

      if (rolExistente) {
        console.log('✅ El usuario ya tiene el rol de decano asignado');
      } else {
        // Asignar rol de decano
        const { error: asignarError } = await supabase
          .from('usuario_roles')
          .insert({
            usuario_id: usuarioDecano.id,
            rol: 'decano',
            activo: true,
            fecha_asignacion: new Date().toISOString()
          });

        if (asignarError) {
          console.error('❌ Error asignando rol de decano:', asignarError);
        } else {
          console.log('✅ Rol de decano asignado exitosamente');
        }
      }

      // 4. Verificar roles finales del usuario
      console.log('\n📋 Paso 3: Verificando roles finales');
      const { data: rolesFinales, error: rolesError } = await supabase
        .from('usuario_roles')
        .select('rol, activo, fecha_asignacion')
        .eq('usuario_id', usuarioDecano.id)
        .eq('activo', true)
        .order('rol');

      if (rolesError) {
        console.error('❌ Error obteniendo roles finales:', rolesError);
      } else {
        console.log(`✅ Roles de ${usuarioDecano.email}:`);
        rolesFinales?.forEach(role => {
          console.log(`   - ${role.rol} (asignado: ${role.fecha_asignacion})`);
        });
      }

      console.log('\n🎉 ¡Configuración completada!');
      console.log(`📧 Usuario decano: ${usuarioDecano.email}`);
      console.log('🌐 Ahora puedes iniciar sesión y acceder al dashboard del decano');

    } else {
      console.log('⚠️ No se encontraron candidatos para decano');
      console.log('💡 Puedes crear un usuario manualmente o modificar este script');
    }

  } catch (error) {
    console.error('❌ Error general:', error.message);
  }
}

// Ejecutar el script
asignarRolDecano();



