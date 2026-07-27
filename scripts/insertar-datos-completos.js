#!/usr/bin/env node

/**
 * Script completo para insertar datos quemados
 * Este script inserta todos los datos necesarios para que el dashboard del profesor
 * muestre información real en lugar de estar vacío
 */

const { createClient } = require('@supabase/supabase-js');

// Configuración de Supabase - usar valores por defecto para desarrollo
const supabaseUrl = process.env.SUPABASE_URL || 'https://your-project.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'your-service-role-key';

console.log('🔧 Script completo para insertar datos quemados');
console.log('⚠️  IMPORTANTE: Este script usa valores hardcodeados');
console.log('   Para usarlo, edita las variables SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY');
console.log('   en este archivo con los valores de tu proyecto de Supabase\n');

if (supabaseUrl.includes('your-project') || supabaseKey.includes('your-service-role')) {
  console.error('❌ Error: Las variables de configuración no están configuradas');
  console.error('');
  console.error('🔧 Para solucionarlo:');
  console.error('   1. Edita este archivo (insertar-datos-completos.js)');
  console.error('   2. Reemplaza SUPABASE_URL con tu URL de Supabase');
  console.error('   3. Reemplaza SUPABASE_SERVICE_ROLE_KEY con tu service role key');
  console.error('');
  console.error('   4. Ejemplo de configuración:');
  console.error('      const supabaseUrl = "https://abcdefgh.supabase.co";');
  console.error('      const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...";');
  console.error('');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

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
    'Excelente retroalimentación y seguimiento del progreso',
    'Profesor con gran conocimiento técnico y didáctico',
    'Muy buena comunicación y manejo de aula',
    'Profesor que motiva el aprendizaje activo',
    'Excelente preparación de las clases y materiales',
    'Profesor que fomenta el pensamiento crítico'
  ];
  return comentarios[Math.floor(Math.random() * comentarios.length)];
}

async function insertarDatosCompletos() {
  console.log('🚀 Iniciando inserción completa de datos quemados...\n');

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

    // Paso 1: Obtener datos base existentes
    console.log('📊 Paso 1: Obteniendo datos base existentes...');
    
    const { data: profesores, error: profesoresError } = await supabase
      .from('profesores')
      .select(`
        id,
        carrera_id,
        usuarios!inner(nombre, apellido, email)
      `)
      .eq('activo', true)
      .limit(10);

    if (profesoresError) {
      throw new Error(`Error obteniendo profesores: ${profesoresError.message}`);
    }

    const { data: estudiantes, error: estudiantesError } = await supabase
      .from('estudiantes')
      .select('id')
      .eq('activo', true)
      .limit(15);

    if (estudiantesError) {
      throw new Error(`Error obteniendo estudiantes: ${estudiantesError.message}`);
    }

    const { data: cursos, error: cursosError } = await supabase
      .from('cursos')
      .select('id, nombre, codigo')
      .eq('activo', true)
      .limit(10);

    if (cursosError) {
      throw new Error(`Error obteniendo cursos: ${cursosError.message}`);
    }

    const { data: grupos, error: gruposError } = await supabase
      .from('grupos')
      .select('id, curso_id')
      .eq('activo', true)
      .limit(10);

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

    // Paso 2: Limpiar evaluaciones existentes (opcional)
    console.log('🧹 Paso 2: Limpiando evaluaciones existentes...');
    const { error: deleteError } = await supabase
      .from('evaluaciones')
      .delete()
      .neq('id', 0); // Eliminar todas las evaluaciones

    if (deleteError) {
      console.warn(`⚠️ Error eliminando evaluaciones existentes: ${deleteError.message}`);
    } else {
      console.log('✅ Evaluaciones existentes eliminadas\n');
    }

    // Paso 3: Generar evaluaciones de prueba
    console.log('📊 Paso 3: Generando evaluaciones de prueba...');
    const evaluaciones = [];
    const periodos = ['2025-2', '2025-1', '2024-2', '2024-1', '2023-2', '2023-1'];
    
    // Crear 100 evaluaciones de prueba para tener datos suficientes
    for (let i = 0; i < 100; i++) {
      const profesor = profesores[Math.floor(Math.random() * profesores.length)];
      const estudiante = estudiantes[Math.floor(Math.random() * estudiantes.length)];
      const curso = cursos[Math.floor(Math.random() * cursos.length)];
      const grupo = grupos.find(g => g.curso_id === curso.id) || grupos[Math.floor(Math.random() * grupos.length)];
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

    // Paso 4: Insertar evaluaciones en lotes
    console.log('💾 Paso 4: Insertando evaluaciones en la base de datos...');
    const batchSize = 20;
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

    // Paso 5: Verificar resultados
    console.log('\n🔍 Paso 5: Verificando resultados...');
    
    // Verificar evaluaciones insertadas
    const { data: evaluacionesInsertadas, error: verificarError } = await supabase
      .from('evaluaciones')
      .select('id, calificacion_general, fecha_evaluacion, comentarios')
      .limit(10);

    if (verificarError) {
      console.warn('⚠️ Error verificando evaluaciones:', verificarError.message);
    } else {
      console.log(`✅ Evaluaciones insertadas: ${evaluacionesInsertadas.length}`);
      console.log('📊 Muestra de evaluaciones:');
      evaluacionesInsertadas.forEach((eval, index) => {
        console.log(`   ${index + 1}. Calificación: ${eval.calificacion_general}, Fecha: ${eval.fecha_evaluacion}`);
        console.log(`      Comentario: ${eval.comentarios.substring(0, 50)}...`);
      });
    }

    // Verificar estadísticas por profesor
    console.log('\n📈 Verificando estadísticas por profesor...');
    const { data: statsProfesores, error: statsError } = await supabase
      .from('evaluaciones')
      .select(`
        profesor_id,
        calificacion_general,
        profesores!inner(
          usuarios!inner(nombre, apellido)
        )
      `);

    if (!statsError && statsProfesores) {
      const statsPorProfesor = {};
      statsProfesores.forEach(eval => {
        const profId = eval.profesor_id;
        const nombre = `${eval.profesores.usuarios.nombre} ${eval.profesores.usuarios.apellido}`;
        
        if (!statsPorProfesor[profId]) {
          statsPorProfesor[profId] = {
            nombre,
            evaluaciones: [],
            promedio: 0
          };
        }
        statsPorProfesor[profId].evaluaciones.push(eval.calificacion_general);
      });

      console.log('📊 Estadísticas por profesor:');
      Object.values(statsPorProfesor).forEach(prof => {
        prof.promedio = (prof.evaluaciones.reduce((a, b) => a + b, 0) / prof.evaluaciones.length).toFixed(2);
        console.log(`   📊 ${prof.nombre}: ${prof.evaluaciones.length} evaluaciones, promedio: ${prof.promedio}`);
      });
    }

    // Verificar totales
    const { data: totalEvaluaciones, error: totalError } = await supabase
      .from('evaluaciones')
      .select('id', { count: 'exact' });

    if (!totalError) {
      console.log(`\n📊 Total de evaluaciones en la base de datos: ${totalEvaluaciones.length}`);
    }

    console.log('\n🎉 ¡Datos quemados insertados correctamente!');
    console.log('📋 Próximos pasos:');
    console.log('   1. Ve al dashboard del profesor en el frontend');
    console.log('   2. Verifica que aparezcan las estadísticas y gráficos');
    console.log('   3. Los datos mostrados son de prueba y ficticios');
    console.log('   4. Ahora deberías ver:');
    console.log('      - Total de evaluaciones > 0');
    console.log('      - Calificación promedio > 0');
    console.log('      - Gráficos con datos');
    console.log('      - Estadísticas por curso');
    console.log('      - Tendencias históricas');
    
  } catch (error) {
    console.error('\n❌ Error insertando datos quemados:', error.message);
    console.error('\n🔧 Posibles soluciones:');
    console.error('   1. Verifica que las variables SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY estén configuradas');
    console.error('   2. Asegúrate de que la base de datos esté accesible');
    console.error('   3. Verifica que existan profesores, estudiantes, cursos y grupos en la BD');
    console.error('   4. Ejecuta primero los scripts de configuración inicial');
    process.exit(1);
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  insertarDatosCompletos();
}

module.exports = { insertarDatosCompletos };








