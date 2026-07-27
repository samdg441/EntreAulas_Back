#!/usr/bin/env node

/**
 * Script para insertar profesores de Ingeniería Financiera
 * Este script crea profesores de prueba para la carrera de Ingeniería Financiera
 * para que David (coordinador) tenga datos que mostrar
 */

const { createClient } = require('@supabase/supabase-js');

// Configuración de Supabase - usar valores por defecto para desarrollo
const supabaseUrl = process.env.SUPABASE_URL || 'https://your-project.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'your-service-role-key';

console.log('🔧 Script para insertar profesores de Ingeniería Financiera');
console.log('⚠️  IMPORTANTE: Este script usa valores hardcodeados');
console.log('   Para usarlo, edita las variables SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY');
console.log('   en este archivo con los valores de tu proyecto de Supabase\n');

if (supabaseUrl.includes('your-project') || supabaseKey.includes('your-service-role')) {
  console.error('❌ Error: Las variables de configuración no están configuradas');
  console.error('');
  console.error('🔧 Para solucionarlo:');
  console.error('   1. Edita este archivo (insertar-profesores-financiera.js)');
  console.error('   2. Reemplaza SUPABASE_URL con tu URL de Supabase');
  console.error('   3. Reemplaza SUPABASE_SERVICE_ROLE_KEY con tu service role key');
  console.error('');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function insertarProfesoresFinanciera() {
  console.log('🔧 Insertando profesores de Ingeniería Financiera...\n');

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

    // Verificar que la carrera de Ingeniería Financiera existe
    console.log('🔍 Verificando carrera de Ingeniería Financiera...');
    const { data: carrera, error: carreraError } = await supabase
      .from('carreras')
      .select('id, nombre, codigo')
      .eq('id', 6)
      .eq('activa', true)
      .single();

    if (carreraError) {
      throw new Error(`Error verificando carrera: ${carreraError.message}`);
    }

    if (!carrera) {
      throw new Error('La carrera de Ingeniería Financiera (ID: 6) no existe o no está activa');
    }

    console.log(`✅ Carrera encontrada: ${carrera.nombre} (${carrera.codigo})`);

    // Lista de profesores de Ingeniería Financiera
    const profesoresFinanciera = [
      {
        email: 'maria.finanzas@udemedellin.edu.co',
        password: 'Password123!',
        nombre: 'María',
        apellido: 'González',
        codigo_profesor: 'PROF-FIN-001'
      },
      {
        email: 'carlos.economia@udemedellin.edu.co',
        password: 'Password123!',
        nombre: 'Carlos',
        apellido: 'Rodríguez',
        codigo_profesor: 'PROF-FIN-002'
      },
      {
        email: 'ana.contabilidad@udemedellin.edu.co',
        password: 'Password123!',
        nombre: 'Ana',
        apellido: 'Martínez',
        codigo_profesor: 'PROF-FIN-003'
      },
      {
        email: 'luis.inversiones@udemedellin.edu.co',
        password: 'Password123!',
        nombre: 'Luis',
        apellido: 'Fernández',
        codigo_profesor: 'PROF-FIN-004'
      },
      {
        email: 'patricia.riesgos@udemedellin.edu.co',
        password: 'Password123!',
        nombre: 'Patricia',
        apellido: 'López',
        codigo_profesor: 'PROF-FIN-005'
      }
    ];

    console.log(`📊 Creando ${profesoresFinanciera.length} profesores de Ingeniería Financiera...\n`);

    let profesoresCreados = 0;
    let profesoresExistentes = 0;

    for (const profData of profesoresFinanciera) {
      try {
        // Verificar si el profesor ya existe
        const { data: usuarioExistente, error: usuarioError } = await supabase
          .from('usuarios')
          .select('id')
          .eq('email', profData.email)
          .single();

        if (usuarioError && usuarioError.code !== 'PGRST116') {
          console.warn(`⚠️ Error verificando usuario ${profData.email}: ${usuarioError.message}`);
          continue;
        }

        if (usuarioExistente) {
          console.log(`⏭️  Profesor ${profData.nombre} ${profData.apellido} ya existe`);
          profesoresExistentes++;
          continue;
        }

        // Crear usuario
        const { data: nuevoUsuario, error: crearError } = await supabase
          .from('usuarios')
          .insert({
            email: profData.email,
            password: profData.password,
            nombre: profData.nombre,
            apellido: profData.apellido,
            tipo_usuario: 'profesor',
            activo: true
          })
          .select('id')
          .single();

        if (crearError) {
          console.warn(`⚠️ Error creando usuario ${profData.email}: ${crearError.message}`);
          continue;
        }

        // Asignar rol de profesor
        const { error: rolError } = await supabase
          .from('usuario_roles')
          .insert({
            usuario_id: nuevoUsuario.id,
            rol: 'profesor',
            activo: true
          });

        if (rolError) {
          console.warn(`⚠️ Error asignando rol profesor a ${profData.email}: ${rolError.message}`);
        }

        // Crear registro en profesores
        const { error: profError } = await supabase
          .from('profesores')
          .insert({
            usuario_id: nuevoUsuario.id,
            carrera_id: 6, // Ingeniería Financiera
            codigo_profesor: profData.codigo_profesor,
            activo: true
          });

        if (profError) {
          console.warn(`⚠️ Error creando profesor ${profData.email}: ${profError.message}`);
        } else {
          console.log(`✅ Profesor creado: ${profData.nombre} ${profData.apellido} (${profData.email})`);
          profesoresCreados++;
        }

      } catch (error) {
        console.warn(`⚠️ Error procesando profesor ${profData.email}: ${error.message}`);
      }
    }

    // Verificar profesores creados
    console.log('\n🔍 Verificando profesores de Ingeniería Financiera...');
    const { data: profesoresVerificacion, error: verifError } = await supabase
      .from('profesores')
      .select(`
        id,
        codigo_profesor,
        carrera_id,
        usuarios!inner(nombre, apellido, email)
      `)
      .eq('carrera_id', 6)
      .eq('activo', true);

    if (verifError) {
      console.warn(`⚠️ Error verificando profesores: ${verifError.message}`);
    } else {
      console.log(`✅ Profesores de Ingeniería Financiera encontrados: ${profesoresVerificacion.length}`);
      profesoresVerificacion.forEach((prof, index) => {
        console.log(`   ${index + 1}. ${prof.usuarios.nombre} ${prof.usuarios.apellido} (${prof.usuarios.email})`);
      });
    }

    console.log('\n📊 Resumen:');
    console.log(`   - Profesores creados: ${profesoresCreados}`);
    console.log(`   - Profesores existentes: ${profesoresExistentes}`);
    console.log(`   - Total en la carrera: ${profesoresVerificacion?.length || 0}`);

    console.log('\n🎉 ¡Profesores de Ingeniería Financiera insertados correctamente!');
    console.log('📋 Próximos pasos:');
    console.log('   1. Inicia sesión con David (coordinador de Ingeniería Financiera)');
    console.log('   2. Ve al dashboard de coordinador');
    console.log('   3. Deberías ver los profesores de Ingeniería Financiera');
    console.log('   4. Ya no deberías ver profesores de Sistemas');

  } catch (error) {
    console.error('\n❌ Error insertando profesores de Ingeniería Financiera:', error.message);
    console.error('\n🔧 Posibles soluciones:');
    console.error('   1. Verifica que las variables SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY estén configuradas');
    console.error('   2. Asegúrate de que la base de datos esté accesible');
    console.error('   3. Verifica que la carrera de Ingeniería Financiera (ID: 6) exista');
    process.exit(1);
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  insertarProfesoresFinanciera();
}

module.exports = { insertarProfesoresFinanciera };








