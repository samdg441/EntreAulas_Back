#!/usr/bin/env node

/**
 * Script para configurar el decano Celopez
 * Este script configura a celopez@udemedellin.edu.co como decano de la facultad
 * con permisos para ver todos los profesores de la facultad
 */

const { createClient } = require('@supabase/supabase-js');

// Configuración de Supabase - usar valores por defecto para desarrollo
const supabaseUrl = process.env.SUPABASE_URL || 'https://your-project.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'your-service-role-key';

console.log('🔧 Script para configurar decano Celopez');
console.log('⚠️  IMPORTANTE: Este script usa valores hardcodeados');
console.log('   Para usarlo, edita las variables SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY');
console.log('   en este archivo con los valores de tu proyecto de Supabase\n');

if (supabaseUrl.includes('your-project') || supabaseKey.includes('your-service-role')) {
  console.error('❌ Error: Las variables de configuración no están configuradas');
  console.error('');
  console.error('🔧 Para solucionarlo:');
  console.error('   1. Edita este archivo (configurar-decano-celopez.js)');
  console.error('   2. Reemplaza SUPABASE_URL con tu URL de Supabase');
  console.error('   3. Reemplaza SUPABASE_SERVICE_ROLE_KEY con tu service role key');
  console.error('');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function configurarDecanoCelopez() {
  console.log('🔧 Configurando decano Celopez...\n');

  try {
    // Verificar conexión
    console.log('🔍 Verificando conexión a la base de datos...');
    const { data: testData, error: testError } = await supabase
      .from('usuarios')
      .select('id')
      .limit(1);

    if (testError) {
      throw new Error(`Error de conexión: ${testError.message}`);
    }
    console.log('✅ Conexión exitosa\n');

    // Buscar usuario Celopez
    console.log('🔍 Buscando usuario celopez@udemedellin.edu.co...');
    const { data: usuariosCelopez, error: usuariosError } = await supabase
      .from('usuarios')
      .select(`
        id,
        email,
        nombre,
        apellido,
        tipo_usuario,
        activo
      `)
      .eq('email', 'celopez@udemedellin.edu.co')
      .eq('activo', true)
      .limit(1);

    if (usuariosError) {
      throw new Error(`Error buscando usuario Celopez: ${usuariosError.message}`);
    }

    let celopez;
    if (usuariosCelopez.length === 0) {
      console.log('❌ No se encontró usuario celopez@udemedellin.edu.co');
      console.log('💡 Creando usuario Celopez...');
      
      // Crear usuario Celopez
      const { data: nuevoUsuario, error: crearError } = await supabase
        .from('usuarios')
        .insert({
          email: 'celopez@udemedellin.edu.co',
          password: 'Password123!',
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

    // Verificar si ya es decano
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
      console.log('🔧 Configurando Celopez como decano...');
      
      // Asignar rol de decano
      const { error: rolError } = await supabase
        .from('usuario_roles')
        .upsert({
          usuario_id: celopez.id,
          rol: 'decano',
          activo: true
        });

      if (rolError) {
        console.warn(`⚠️ Error asignando rol decano: ${rolError.message}`);
      } else {
        console.log('✅ Rol decano asignado');
      }
    }

    // También asignar rol de coordinador para tener acceso a funcionalidades de coordinación
    const { data: coordinadorExistente, error: coordError } = await supabase
      .from('usuario_roles')
      .select('id, rol')
      .eq('usuario_id', celopez.id)
      .eq('rol', 'coordinador')
      .eq('activo', true)
      .single();

    if (coordError && coordError.code !== 'PGRST116') {
      throw new Error(`Error verificando coordinador: ${coordError.message}`);
    }

    if (!coordinadorExistente) {
      console.log('🔧 Asignando rol de coordinador para acceso completo...');
      
      const { error: rolCoordError } = await supabase
        .from('usuario_roles')
        .upsert({
          usuario_id: celopez.id,
          rol: 'coordinador',
          activo: true
        });

      if (rolCoordError) {
        console.warn(`⚠️ Error asignando rol coordinador: ${rolCoordError.message}`);
      } else {
        console.log('✅ Rol coordinador asignado');
      }
    }

    // Verificar si es profesor
    const { data: profesorExistente, error: profError } = await supabase
      .from('profesores')
      .select('id')
      .eq('usuario_id', celopez.id)
      .eq('activo', true)
      .single();

    if (profError && profError.code !== 'PGRST116') {
      throw new Error(`Error verificando profesor: ${profError.message}`);
    }

    if (!profesorExistente) {
      console.log('🔧 Configurando Celopez como profesor...');
      
      // Asignar rol de profesor
      const { error: rolProfError } = await supabase
        .from('usuario_roles')
        .upsert({
          usuario_id: celopez.id,
          rol: 'profesor',
          activo: true
        });

      if (rolProfError) {
        console.warn(`⚠️ Error asignando rol profesor: ${rolProfError.message}`);
      } else {
        console.log('✅ Rol profesor asignado');
      }

      // Crear registro en profesores
      const { error: crearProfError } = await supabase
        .from('profesores')
        .insert({
          usuario_id: celopez.id,
          codigo_profesor: 'PROF-CELOPEZ-001',
          activo: true
        });

      if (crearProfError) {
        throw new Error(`Error creando profesor: ${crearProfError.message}`);
      }

      console.log('✅ Celopez configurado como profesor');
    }

    // Crear registro en coordinadores para acceso a funcionalidades de coordinación
    const { data: coordRegistro, error: coordRegError } = await supabase
      .from('coordinadores')
      .select('id')
      .eq('usuario_id', celopez.id)
      .eq('activo', true)
      .single();

    if (coordRegError && coordRegError.code !== 'PGRST116') {
      throw new Error(`Error verificando registro coordinador: ${coordRegError.message}`);
    }

    if (!coordRegistro) {
      console.log('🔧 Creando registro de coordinador para acceso completo...');
      
      const { error: crearCoordError } = await supabase
        .from('coordinadores')
        .insert({
          usuario_id: celopez.id,
          departamento: 'Facultad de Ingenierías',
          fecha_nombramiento: new Date().toISOString().split('T')[0],
          activo: true
        });

      if (crearCoordError) {
        throw new Error(`Error creando coordinador: ${crearCoordError.message}`);
      }

      console.log('✅ Registro de coordinador creado para acceso completo');
    }

    // Verificar configuración final
    console.log('\n🔍 Verificando configuración final...');
    
    const { data: rolesFinales, error: rolesFinalError } = await supabase
      .from('usuario_roles')
      .select('rol')
      .eq('usuario_id', celopez.id)
      .eq('activo', true);

    if (rolesFinalError) {
      console.warn(`⚠️ Error obteniendo roles finales: ${rolesFinalError.message}`);
    } else {
      const rolesList = rolesFinales.map(r => r.rol);
      console.log(`✅ Roles finales: ${rolesList.join(', ')}`);
    }

    console.log('\n🎉 ¡Celopez configurado correctamente como decano de la facultad!');
    console.log('📋 Próximos pasos:');
    console.log('   1. Inicia sesión con celopez@udemedellin.edu.co en el frontend');
    console.log('   2. Debería ver el dashboard de coordinador (por tener rol coordinador)');
    console.log('   3. Debería poder ver TODOS los profesores de la facultad');
    console.log('   4. El rol de decano le da acceso completo a la facultad');
    console.log('\n🔑 Credenciales:');
    console.log('   Email: celopez@udemedellin.edu.co');
    console.log('   Password: Password123!');

  } catch (error) {
    console.error('\n❌ Error configurando decano Celopez:', error.message);
    console.error('\n🔧 Posibles soluciones:');
    console.error('   1. Verifica que las variables SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY estén configuradas');
    console.error('   2. Asegúrate de que la base de datos esté accesible');
    console.error('   3. Verifica que las tablas usuario_roles, coordinadores y profesores existan');
    process.exit(1);
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  configurarDecanoCelopez();
}

module.exports = { configurarDecanoCelopez };




