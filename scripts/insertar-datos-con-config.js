#!/usr/bin/env node

/**
 * Script para insertar datos de prueba usando archivo de configuración
 * Este script lee la configuración desde un archivo config.js
 */

const { createClient } = require('@supabase/supabase-js');
const path = require('path');

// Intentar cargar configuración personalizada
let config;
try {
  config = require('./config.js');
  console.log('✅ Configuración cargada desde config.js');
} catch (error) {
  console.log('⚠️ No se encontró config.js, usando configuración de ejemplo');
  config = require('./config-ejemplo.js');
}

// Verificar configuración
if (config.supabase.url.includes('tu-proyecto') || config.supabase.serviceRoleKey.includes('tu-service-role-key')) {
  console.error('❌ Error: La configuración no está completa');
  console.error('');
  console.error('🔧 Para solucionarlo:');
  console.error('   1. Copia config-ejemplo.js como config.js');
  console.error('   2. Edita config.js con tus valores reales de Supabase');
  console.error('   3. Obtén los valores desde tu proyecto de Supabase:');
  console.error('      - Ve a Settings > API');
  console.error('      - Copia la URL del proyecto');
  console.error('      - Copia la service_role key (no la anon key)');
  console.error('');
  process.exit(1);
}

const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey);

// Función para generar calificaciones aleatorias
function generarCalificacion() {
  return Math.round((3.0 + Math.random() * 2.0) * 100) / 100; // Entre 3.0 y 5.0
}

// Función para generar fechas aleatorias en un período
function generarFecha(periodo) {
  const [año, semestre] = periodo.split('-');
  const inicio = semestre === '1' ? `${año}-01-01` : `${año}-07-01`;
  const fin = semestre === '1' ? `${año}-06-30` : `${año}-12-31`;
  
  const inicioDate = new Date(inicio);
  const finDate = new Date(fin);
  const randomTime = inicioDate.getTime() + Math.random() * (finDate.getTime() - inicioDate.getTime());
  
  return new Date(randomTime).toISOString().split('T')[0];
}

// Función para generar comentarios de prueba
function generarComentario() {
  const comentarios = [
    'Excelente profesor, muy claro en sus explicaciones',
    'Buen profesor, aunque podría mejorar la metodología',
    'Profesor competente, cumple con los objetivos del curso',
    'Profesor con buen dominio del tema, recomendado',
    'Muy buen manejo de la clase y los contenidos',
    'Profesor dedicado y comprometido con la enseñanza',
    'Buen dominio del contenido, explica de manera clara',
    'Profesor accesible y dispuesto a ayudar a los estudiantes',
    'Metodología de enseñanza efectiva y bien estructurada',
    'Excelente retroalimentación y seguimiento del progreso'
  ];
  return comentarios[Math.floor(Math.random() * comentarios.length)];
}

async function insertarDatosPrueba() {
  console.log('🚀 Iniciando inserción de datos de prueba de evaluaciones...\n');

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

    // Obtener datos base
    console.log('🔍 Obteniendo datos base...');
    
    const { data: profesores, error: profesoresError } = await supabase
      .from('profesores')
      .select(`
        id,
        usuarios!inner(nombre, apellido)
      `)
      .eq('activo', true)
      .limit(5);

    if (profesoresError) {
      throw new Error(`Error obteniendo profesores: ${profesoresError.message}`);
    }

    const { data: estudiantes, error: estudiantesError } = await supabase
      .from('estudiantes')
      .select('id')
      .eq('activo', true)
      .limit(10);

    if (estudiantesError) {
      throw new Error(`Error obteniendo estudiantes: ${estudiantesError.message}`);
    }

    const { data: cursos, error: cursosError } = await supabase
      .from('cursos')
      .select('id, nombre')
      .eq('activo', true)
      .limit(5);

    if (cursosError) {
      throw new Error(`Error obteniendo cursos: ${cursosError.message}`);
    }

    const { data: grupos, error: gruposError } = await supabase
      .from('grupos')
      .select('id')
      .eq('activo', true)
      .limit(3);

    if (gruposError) {
      throw new Error(`Error obteniendo grupos: ${gruposError.message}`);
    }

    console.log(`✅ Datos base obtenidos:`);
    console.log(`   - Profesores: ${profesores.length}`);
    console.log(`   - Estudiantes: ${estudiantes.length}`);
    console.log(`   - Cursos: ${cursos.length}`);
    console.log(`   - Grupos: ${grupos.length}\n`);

    if (profesores.length === 0 || estudiantes.length === 0 || cursos.length === 0 || grupos.length === 0) {
      throw new Error('No hay suficientes datos base para crear evaluaciones de prueba');
    }

    // Generar evaluaciones de prueba
    const evaluaciones = [];
    const periodos = ['2025-2', '2025-1', '2024-2', '2024-1', '2023-2'];
    
    console.log('📊 Generando evaluaciones de prueba...');
    
    // Crear 50 evaluaciones de prueba
    for (let i = 0; i < 50; i++) {
      const profesor = profesores[Math.floor(Math.random() * profesores.length)];
      const estudiante = estudiantes[Math.floor(Math.random() * estudiantes.length)];
      const curso = cursos[Math.floor(Math.random() * cursos.length)];
      const grupo = grupos[Math.floor(Math.random() * grupos.length)];
      const periodo = periodos[Math.floor(Math.random() * periodos.length)];
      
      evaluaciones.push({
        profesor_id: profesor.id,
        estudiante_id: estudiante.id,
        curso_id: curso.id,
        grupo_id: grupo.id,
        periodo_id: 1, // Por defecto período 2025-2
        calificacion_general: generarCalificacion(),
        fecha_evaluacion: generarFecha(periodo),
        comentarios: generarComentario(),
        completada: true,
        fecha_completada: generarFecha(periodo)
      });
    }

    console.log(`✅ Generadas ${evaluaciones.length} evaluaciones de prueba\n`);

    // Insertar evaluaciones en lotes de 10
    const batchSize = 10;
    let insertadas = 0;
    
    for (let i = 0; i < evaluaciones.length; i += batchSize) {
      const batch = evaluaciones.slice(i, i + batchSize);
      
      const { error } = await supabase
        .from('evaluaciones')
        .insert(batch);

      if (error) {
        console.warn(`⚠️ Error insertando lote ${Math.floor(i/batchSize) + 1}:`, error.message);
      } else {
        insertadas += batch.length;
        console.log(`✅ Lote ${Math.floor(i/batchSize) + 1} insertado (${insertadas}/${evaluaciones.length})`);
      }
    }

    // Verificar resultados
    console.log('\n🔍 Verificando resultados...');
    const { data: evaluacionesInsertadas, error: verificarError } = await supabase
      .from('evaluaciones')
      .select('id, calificacion_general, fecha_evaluacion, comentarios')
      .limit(5);

    if (verificarError) {
      console.warn('⚠️ Error verificando evaluaciones:', verificarError.message);
    } else {
      console.log(`✅ Verificación exitosa: ${evaluacionesInsertadas.length} evaluaciones encontradas`);
      console.log('📊 Muestra de evaluaciones insertadas:');
      evaluacionesInsertadas.forEach((eval, index) => {
        console.log(`   ${index + 1}. Calificación: ${eval.calificacion_general}, Fecha: ${eval.fecha_evaluacion}`);
        console.log(`      Comentario: ${eval.comentarios.substring(0, 50)}...`);
      });
    }

    console.log('\n🎉 ¡Datos de prueba insertados correctamente!');
    console.log('📋 Próximos pasos:');
    console.log('   1. Ve al dashboard del profesor en el frontend (http://localhost:3001/reports)');
    console.log('   2. Verifica que aparezcan las estadísticas y gráficos');
    console.log('   3. Los datos mostrados son de prueba y ficticios');
    console.log('   4. Ahora deberías ver:');
    console.log('      - Total de evaluaciones > 0');
    console.log('      - Calificación promedio > 0');
    console.log('      - Gráficos con datos');
    console.log('      - Estadísticas por curso');
    
  } catch (error) {
    console.error('\n❌ Error insertando datos de prueba:', error.message);
    console.error('\n🔧 Posibles soluciones:');
    console.error('   1. Verifica que el archivo config.js esté configurado correctamente');
    console.error('   2. Asegúrate de que la base de datos esté accesible');
    console.error('   3. Verifica que existan profesores, estudiantes y cursos en la BD');
    console.error('   4. Ejecuta primero los scripts de configuración inicial');
    process.exit(1);
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  insertarDatosPrueba();
}

module.exports = { insertarDatosPrueba };








