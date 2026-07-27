#!/usr/bin/env node

/**
 * Script para configurar el coordinador David
 * Este script configura a David como coordinador con una carrera asignada
 */

const { createClient } = require('@supabase/supabase-js');

// Configuración de Supabase - usar valores por defecto para desarrollo
const supabaseUrl = process.env.SUPABASE_URL || 'https://your-project.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'your-service-role-key';

console.log('🔧 Script para configurar coordinador David');
console.log('⚠️  IMPORTANTE: Este script usa valores hardcodeados');
console.log('   Para usarlo, edita las variables SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY');
console.log('   en este archivo con los valores de tu proyecto de Supabase\n');

if (supabaseUrl.includes('your-project') || supabaseKey.includes('your-service-role')) {
  console.error('❌ Error: Las variables de configuración no están configuradas');
  console.error('');
  console.error('🔧 Para solucionarlo:');
  console.error('   1. Edita este archivo (configurar-coordinador-david.js)');
  console.error('   2. Reemplaza SUPABASE_URL con tu URL de Supabase');
  console.error('   3. Reemplaza SUPABASE_SERVICE_ROLE_KEY con tu service role key');
  console.error('');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function configurarCoordinadorDavid() {
  console.log('🔧 Configurando coordinador David...\n');

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

    // Buscar usuario David (asumiendo que existe)
    console.log('🔍 Buscando usuario David...');
    const { data: usuariosDavid, error: usuariosError } = await supabase
      .from('usuarios')
      .select(`
        id,
        email,
        nombre,
        apellido,
        tipo_usuario,
        activo
      `)
      .ilike('nombre', '%david%')
      .eq('activo', true)
      .limit(1);

    if (usuariosError) {
      throw new Error(`Error buscando usuario David: ${usuariosError.message}`);
    }

    if (usuariosDavid.length === 0) {
      console.log('❌ No se encontró usuario David');
      console.log('💡 Creando usuario David...');
      
      // Crear usuario David
      const { data: nuevoUsuario, error: crearError } = await supabase
        .from('usuarios')
        .insert({
          email: 'david.coordinador@udemedellin.edu.co',
          password: 'Password123!',
          nombre: 'David',
          apellido: 'Coordinador',
          tipo_usuario: 'profesor',
          activo: true
        })
        .select('id, email, nombre, apellido')
        .single();

      if (crearError) {
        throw new Error(`Error creando usuario David: ${crearError.message}`);
      }

      console.log('✅ Usuario David creado:', nuevoUsuario);
      usuariosDavid.push(nuevoUsuario);
    }

    const david = usuariosDavid[0];
    console.log(`✅ Usuario David encontrado: ${david.nombre} ${david.apellido} (${david.email})`);

    // Verificar si ya es coordinador
    const { data: coordinadorExistente, error: coordError } = await supabase
      .from('coordinadores')
      .select('id, carrera_id')
      .eq('usuario_id', david.id)
      .eq('activo', true)
      .single();

    if (coordError && coordError.code !== 'PGRST116') {
      throw new Error(`Error verificando coordinador: ${coordError.message}`);
    }

    if (coordinadorExistente) {
      console.log(`✅ David ya es coordinador con carrera_id: ${coordinadorExistente.carrera_id}`);
    } else {
      console.log('🔧 Configurando David como coordinador...');
      
      // Asignar rol de coordinador
      const { error: rolError } = await supabase
        .from('usuario_roles')
        .upsert({
          usuario_id: david.id,
          rol: 'coordinador',
          activo: true
        });

      if (rolError) {
        console.warn(`⚠️ Error asignando rol coordinador: ${rolError.message}`);
      } else {
        console.log('✅ Rol coordinador asignado');
      }

      // Crear registro en coordinadores (asignar a carrera 6 - Ingeniería Financiera)
      const { error: crearCoordError } = await supabase
        .from('coordinadores')
        .insert({
          usuario_id: david.id,
          carrera_id: 6, // Ingeniería Financiera
          departamento: 'Ingeniería Financiera',
          fecha_nombramiento: new Date().toISOString().split('T')[0],
          activo: true
        });

      if (crearCoordError) {
        throw new Error(`Error creando coordinador: ${crearCoordError.message}`);
      }

      console.log('✅ David configurado como coordinador de Ingeniería Financiera');
    }

    // Verificar si es profesor
    const { data: profesorExistente, error: profError } = await supabase
      .from('profesores')
      .select('id, carrera_id')
      .eq('usuario_id', david.id)
      .eq('activo', true)
      .single();

    if (profError && profError.code !== 'PGRST116') {
      throw new Error(`Error verificando profesor: ${profError.message}`);
    }

    if (profesorExistente) {
      console.log(`✅ David ya es profesor con carrera_id: ${profesorExistente.carrera_id}`);
    } else {
      console.log('🔧 Configurando David como profesor...');
      
      // Asignar rol de profesor
      const { error: rolProfError } = await supabase
        .from('usuario_roles')
        .upsert({
          usuario_id: david.id,
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
          usuario_id: david.id,
          carrera_id: 6, // Ingeniería Financiera
          codigo_profesor: 'PROF-DAVID-001',
          activo: true
        });

      if (crearProfError) {
        throw new Error(`Error creando profesor: ${crearProfError.message}`);
      }

      console.log('✅ David configurado como profesor de Ingeniería Financiera');
    }

    // Verificar configuración final
    console.log('\n🔍 Verificando configuración final...');
    
    const { data: rolesFinales, error: rolesFinalError } = await supabase
      .from('usuario_roles')
      .select('rol')
      .eq('usuario_id', david.id)
      .eq('activo', true);

    if (rolesFinalError) {
      console.warn(`⚠️ Error obteniendo roles finales: ${rolesFinalError.message}`);
    } else {
      const rolesList = rolesFinales.map(r => r.rol);
      console.log(`✅ Roles finales: ${rolesList.join(', ')}`);
    }

    const { data: coordFinal, error: coordFinalError } = await supabase
      .from('coordinadores')
      .select(`
        carrera_id,
        carreras!inner(nombre)
      `)
      .eq('usuario_id', david.id)
      .eq('activo', true)
      .single();

    if (coordFinalError) {
      console.warn(`⚠️ Error obteniendo coordinador final: ${coordFinalError.message}`);
    } else {
      console.log(`✅ Coordinador de: ${coordFinal.carreras.nombre} (ID: ${coordFinal.carrera_id})`);
    }

    console.log('\n🎉 ¡David configurado correctamente como coordinador-profesor!');
    console.log('📋 Próximos pasos:');
    console.log('   1. Inicia sesión con David en el frontend');
    console.log('   2. Debería ver el dashboard de coordinador');
    console.log('   3. Debería poder ver profesores de Ingeniería Financiera');
    console.log('   4. Si aún no funciona, verifica que el frontend tenga la configuración temporal para David');

  } catch (error) {
    console.error('\n❌ Error configurando coordinador David:', error.message);
    console.error('\n🔧 Posibles soluciones:');
    console.error('   1. Verifica que las variables SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY estén configuradas');
    console.error('   2. Asegúrate de que la base de datos esté accesible');
    console.error('   3. Verifica que las tablas usuario_roles y coordinadores existan');
    process.exit(1);
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  configurarCoordinadorDavid();
}

module.exports = { configurarCoordinadorDavid };
