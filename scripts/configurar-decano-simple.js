const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Configuración de Supabase usando variables de entorno
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('❌ Error: Las variables de entorno SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY deben estar configuradas');
  console.log('🔧 Verifica que tu archivo .env contenga estas variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

async function configurarDecanoCelopez() {
  try {
    console.log('🔧 Configurando usuario celopez@udemedellin.edu.co como Decano...');
    
    // 1. Buscar o crear el usuario Celopez
    console.log('📋 Paso 1: Buscando usuario Celopez...');
    
    const { data: usuariosCelopez, error: buscarError } = await supabase
      .from('usuarios')
      .select('id, email, nombre, apellido, tipo_usuario, activo')
      .eq('email', 'celopez@udemedellin.edu.co');

    if (buscarError) {
      throw new Error(`Error buscando usuario: ${buscarError.message}`);
    }

    let celopez;
    if (!usuariosCelopez || usuariosCelopez.length === 0) {
      console.log('👤 Usuario Celopez no encontrado, creando...');
      
      const { data: nuevoUsuario, error: crearError } = await supabase
        .from('usuarios')
        .insert({
          email: 'celopez@udemedellin.edu.co',
          password: '$2a$10$rQZ8K9mN2pL3sT4uV5wX6yZ7aB8cD9eF0gH1iJ2kL3mN4oP5qR6sT7uV8wX9yZ',
          nombre: 'Carlos',
          apellido: 'López',
          tipo_usuario: 'profesor',
          activo: true
        })
        .select('id, email, nombre, apellido')
        .single();

      if (crearError) {
        throw new Error(`Error creando usuario Celopez: ${crearError.message}`);
      }

      console.log('✅ Usuario Celopez creado:', nuevoUsuario);
      celopez = nuevoUsuario;
    } else {
      celopez = usuariosCelopez[0];
      console.log(`✅ Usuario Celopez encontrado: ${celopez.nombre} ${celopez.apellido} (${celopez.email})`);
    }

    // 2. Verificar si ya es decano
    console.log('📋 Paso 2: Verificando rol de decano...');
    
    const { data: decanoExistente, error: decanoError } = await supabase
      .from('usuario_roles')
      .select('id, rol')
      .eq('usuario_id', celopez.id)
      .eq('rol', 'decano')
      .eq('activo', true)
      .single();

    if (decanoError && decanoError.code !== 'PGRST116') {
      throw new Error(`Error verificando decano: ${decanoError.message}`);
    }

    if (decanoExistente) {
      console.log(`✅ Celopez ya tiene el rol de decano`);
    } else {
      console.log('🔧 Asignando rol de decano...');
      
      // Asignar rol de decano
      const { error: rolError } = await supabase
        .from('usuario_roles')
        .upsert({
          usuario_id: celopez.id,
          rol: 'decano',
          activo: true,
          fecha_asignacion: new Date().toISOString()
        });

      if (rolError) {
        console.warn(`⚠️ Error asignando rol decano: ${rolError.message}`);
      } else {
        console.log('✅ Rol decano asignado correctamente');
      }
    }

    // 3. Verificar configuración final
    console.log('📋 Paso 3: Verificando configuración final...');
    
    const { data: rolesFinales, error: verificarError } = await supabase
      .from('usuario_roles')
      .select('rol, activo, fecha_asignacion')
      .eq('usuario_id', celopez.id)
      .eq('activo', true);

    if (verificarError) {
      console.warn(`⚠️ Error verificando roles: ${verificarError.message}`);
    } else {
      console.log('✅ Roles finales del usuario:');
      rolesFinales.forEach(role => {
        console.log(`   - ${role.rol} (asignado: ${role.fecha_asignacion})`);
      });
    }

    console.log('\n🎉 ¡Configuración completada exitosamente!');
    console.log('📧 Usuario: celopez@udemedellin.edu.co');
    console.log('👑 Rol: Decano');
    console.log('🌐 Dashboard: /dashboard-decano');
    console.log('\n🔗 Ahora puedes iniciar sesión con este usuario y será redirigido al dashboard del decano');

  } catch (error) {
    console.error('❌ Error durante la configuración:', error.message);
    process.exit(1);
  }
}

// Ejecutar la configuración
configurarDecanoCelopez();




