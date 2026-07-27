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

async function insertarDecanoEnTabla() {
  try {
    console.log('🔧 Insertando decano en la tabla decanos...');
    
    // 1. Buscar el usuario Celopez
    console.log('📋 Paso 1: Buscando usuario Celopez...');
    
    const { data: usuario, error: usuarioError } = await supabase
      .from('usuarios')
      .select('id, email, nombre, apellido')
      .eq('email', 'celopez@udemedellin.edu.co')
      .single();

    if (usuarioError) {
      throw new Error(`Error buscando usuario: ${usuarioError.message}`);
    }

    if (!usuario) {
      throw new Error('Usuario celopez@udemedellin.edu.co no encontrado');
    }

    console.log(`✅ Usuario encontrado: ${usuario.nombre} ${usuario.apellido} (ID: ${usuario.id})`);

    // 2. Buscar o crear la facultad
    console.log('📋 Paso 2: Buscando facultad...');
    
    const { data: facultad, error: facultadError } = await supabase
      .from('facultades')
      .select('id, nombre, codigo')
      .eq('codigo', 'FI')
      .single();

    if (facultadError && facultadError.code !== 'PGRST116') {
      throw new Error(`Error buscando facultad: ${facultadError.message}`);
    }

    let facultadId;
    if (!facultad) {
      console.log('🏛️ Facultad no encontrada, creando...');
      
      const { data: nuevaFacultad, error: crearFacultadError } = await supabase
        .from('facultades')
        .insert({
          nombre: 'Facultad de Ingenierías',
          codigo: 'FI',
          descripcion: 'Facultad de Ingenierías de la Universidad de Medellín'
        })
        .select('id, nombre')
        .single();

      if (crearFacultadError) {
        throw new Error(`Error creando facultad: ${crearFacultadError.message}`);
      }

      console.log(`✅ Facultad creada: ${nuevaFacultad.nombre} (ID: ${nuevaFacultad.id})`);
      facultadId = nuevaFacultad.id;
    } else {
      console.log(`✅ Facultad encontrada: ${facultad.nombre} (ID: ${facultad.id})`);
      facultadId = facultad.id;
    }

    // 3. Verificar si ya es decano en la tabla
    console.log('📋 Paso 3: Verificando si ya es decano...');
    
    const { data: decanoExistente, error: decanoError } = await supabase
      .from('decanos')
      .select('id, facultad_id, activo')
      .eq('usuario_id', usuario.id)
      .single();

    if (decanoError && decanoError.code !== 'PGRST116') {
      throw new Error(`Error verificando decano: ${decanoError.message}`);
    }

    if (decanoExistente) {
      console.log(`✅ Usuario ya es decano en la tabla (ID: ${decanoExistente.id})`);
      
      // Actualizar facultad si es necesario
      if (decanoExistente.facultad_id !== facultadId) {
        console.log('🔄 Actualizando facultad del decano...');
        
        const { error: updateError } = await supabase
          .from('decanos')
          .update({ 
            facultad_id: facultadId,
            observaciones: 'Decano de la Facultad de Ingenierías'
          })
          .eq('id', decanoExistente.id);

        if (updateError) {
          console.warn(`⚠️ Error actualizando facultad: ${updateError.message}`);
        } else {
          console.log('✅ Facultad del decano actualizada');
        }
      }
    } else {
      console.log('🔧 Insertando decano en la tabla...');
      
      const { data: nuevoDecano, error: insertError } = await supabase
        .from('decanos')
        .insert({
          usuario_id: usuario.id,
          facultad_id: facultadId,
          observaciones: 'Decano de la Facultad de Ingenierías',
          activo: true
        })
        .select('id, facultad_id')
        .single();

      if (insertError) {
        throw new Error(`Error insertando decano: ${insertError.message}`);
      }

      console.log(`✅ Decano insertado en la tabla (ID: ${nuevoDecano.id})`);
    }

    // 4. Verificar configuración final
    console.log('📋 Paso 4: Verificando configuración final...');
    
    const { data: decanoFinal, error: verificarError } = await supabase
      .from('decanos')
      .select(`
        id,
        usuario_id,
        facultad_id,
        fecha_nombramiento,
        activo,
        observaciones,
        usuarios:usuarios!usuario_id(nombre, apellido, email),
        facultades:facultades!facultad_id(nombre, codigo)
      `)
      .eq('usuario_id', usuario.id)
      .single();

    if (verificarError) {
      console.warn(`⚠️ Error verificando configuración: ${verificarError.message}`);
    } else {
      console.log('✅ Configuración final del decano:');
      console.log(`   - ID: ${decanoFinal.id}`);
      console.log(`   - Usuario: ${decanoFinal.usuarios.nombre} ${decanoFinal.usuarios.apellido}`);
      console.log(`   - Email: ${decanoFinal.usuarios.email}`);
      console.log(`   - Facultad: ${decanoFinal.facultades.nombre} (${decanoFinal.facultades.codigo})`);
      console.log(`   - Fecha nombramiento: ${decanoFinal.fecha_nombramiento}`);
      console.log(`   - Activo: ${decanoFinal.activo}`);
      console.log(`   - Observaciones: ${decanoFinal.observaciones}`);
    }

    console.log('\n🎉 ¡Decano insertado exitosamente en la tabla decanos!');
    console.log('📧 Usuario: celopez@udemedellin.edu.co');
    console.log('👑 Rol: Decano');
    console.log('🏛️ Facultad: Facultad de Ingenierías');
    console.log('🌐 Dashboard: /dashboard-decano');

  } catch (error) {
    console.error('❌ Error durante la inserción:', error.message);
    process.exit(1);
  }
}

// Ejecutar la inserción
insertarDecanoEnTabla();




