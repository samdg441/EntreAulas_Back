const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Configuración de Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Error: Variables de entorno SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY no están configuradas');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function ejecutarSQL(sql) {
  try {
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });
    if (error) {
      console.log(`   ⚠️  ${error.message}`);
      return false;
    }
    return true;
  } catch (err) {
    console.log(`   ❌ ${err.message}`);
    return false;
  }
}

async function ejecutarScriptCompleto() {
  console.log('🚀 Iniciando actualización completa de preguntas por carrera...\n');
  
  try {
    // Paso 1: Desactivar todas las preguntas existentes
    console.log('📝 Paso 1: Desactivando preguntas existentes...');
    const { error: error1 } = await supabase
      .from('preguntas_evaluacion')
      .update({ activa: false })
      .eq('activa', true);
    
    if (error1) {
      console.log('⚠️  Error desactivando preguntas:', error1.message);
    } else {
      console.log('✅ Preguntas desactivadas correctamente');
    }
    
    // Paso 2: Verificar/crear categorías
    console.log('\n📝 Paso 2: Verificando categorías...');
    const categorias = [
      { nombre: 'Comunicación', descripcion: 'Preguntas relacionadas con la comunicación y manejo de aula del docente', orden: 1 },
      { nombre: 'Conocimiento del Tema', descripcion: 'Preguntas sobre el dominio y aplicación de los contenidos', orden: 2 },
      { nombre: 'Metodología de Enseñanza', descripcion: 'Preguntas sobre estrategias y métodos de enseñanza', orden: 3 },
      { nombre: 'Evaluación', descripcion: 'Preguntas sobre evaluación y retroalimentación', orden: 4 },
      { nombre: 'Disponibilidad', descripcion: 'Preguntas sobre disponibilidad y aporte del docente', orden: 5 }
    ];
    
    for (const categoria of categorias) {
      const { data: existing } = await supabase
        .from('categorias_pregunta')
        .select('id')
        .eq('nombre', categoria.nombre)
        .single();
      
      if (!existing) {
        const { error } = await supabase
          .from('categorias_pregunta')
          .insert([{ ...categoria, activa: true }]);
        
        if (error) {
          console.log(`   ⚠️  Error creando categoría ${categoria.nombre}:`, error.message);
        } else {
          console.log(`   ✅ Categoría ${categoria.nombre} creada`);
        }
      } else {
        console.log(`   ✅ Categoría ${categoria.nombre} ya existe`);
      }
    }
    
    // Paso 3: Obtener IDs de categorías
    console.log('\n📝 Paso 3: Obteniendo IDs de categorías...');
    const { data: categoriasData, error: error3 } = await supabase
      .from('categorias_pregunta')
      .select('id, nombre')
      .eq('activa', true);
    
    if (error3) {
      console.log('❌ Error obteniendo categorías:', error3.message);
      return;
    }
    
    const categoriaMap = {};
    categoriasData.forEach(cat => {
      categoriaMap[cat.nombre] = cat.id;
    });
    
    console.log('✅ Categorías obtenidas:', Object.keys(categoriaMap).join(', '));
    
    // Paso 4: Insertar preguntas para cada carrera
    console.log('\n📝 Paso 4: Insertando preguntas por carrera...');
    
    const carreras = [
      { id: 1, nombre: 'Ingeniería de Sistemas' },
      { id: 2, nombre: 'Ingeniería Civil' },
      { id: 3, nombre: 'Ingeniería Ambiental' },
      { id: 4, nombre: 'Ingeniería de Energías' },
      { id: 5, nombre: 'Ingeniería de Telecomunicaciones' },
      { id: 6, nombre: 'Ingeniería Financiera' },
      { id: 7, nombre: 'Ingeniería Industrial' },
      { id: null, nombre: 'Tronco Común' }
    ];
    
    // Preguntas base (comunes para todas las carreras)
    const preguntasBase = [
      {
        texto: 'Indica tu percepción sobre el respeto, manejo de aula y comunicación del docente con los estudiantes',
        categoria: 'Comunicación',
        tipo: 'rating',
        opciones: { type: 'scale', min: 1, max: 5, labels: ['Muy deficiente', 'Deficiente', 'Aceptable', 'Buena', 'Excelente'] },
        orden: 1
      },
      {
        texto: '¿En qué medida el docente cumple y aplica los objetivos planteados al inicio de la asignatura, y qué tan claros resultan durante el desarrollo de las clases?',
        categoria: 'Conocimiento del Tema',
        tipo: 'rating',
        opciones: { type: 'scale', min: 1, max: 5, labels: ['Muy malo', 'Malo', 'Regular', 'Bueno', 'Excelente'] },
        orden: 2
      },
      {
        texto: '¿Qué tan organizado(a) consideras que es el docente en la secuencia de sus clases?',
        categoria: 'Metodología de Enseñanza',
        tipo: 'rating',
        opciones: { type: 'scale', min: 1, max: 5, labels: ['Muy malo', 'Malo', 'Regular', 'Bueno', 'Excelente'] },
        orden: 3
      },
      {
        texto: '¿Qué estrategias o métodos de enseñanza emplea el profesor que te ayudan más a comprender los conceptos técnicos o científicos?',
        categoria: 'Metodología de Enseñanza',
        tipo: 'text',
        opciones: { type: 'text', placeholder: 'Escribe tu respuesta aquí...' },
        orden: 4
      },
      {
        texto: '¿Con qué frecuencia el profesor promueve la participación y el análisis crítico en clase?',
        categoria: 'Metodología de Enseñanza',
        tipo: 'rating',
        opciones: { type: 'scale', min: 1, max: 5, labels: ['Nunca', 'Rara vez', 'A veces', 'Frecuentemente', 'Siempre'] },
        orden: 5
      },
      {
        texto: 'Describe una actividad, proyecto o práctica que haya contribuido a tu aprendizaje en esta materia.',
        categoria: 'Evaluación',
        tipo: 'text',
        opciones: { type: 'text', placeholder: 'Escribe tu respuesta aquí...' },
        orden: 6
      },
      {
        texto: '¿Qué tan útil consideras la retroalimentación del profesor para mejorar tu desempeño académico?',
        categoria: 'Evaluación',
        tipo: 'rating',
        opciones: { type: 'scale', min: 1, max: 5, labels: ['Muy malo', 'Malo', 'Regular', 'Bueno', 'Excelente'] },
        orden: 7
      },
      {
        texto: '¿Qué sugerencias podrías dar al docente para fortalecer el proceso de enseñanza-aprendizaje en esta asignatura?',
        categoria: 'Metodología de Enseñanza',
        tipo: 'text',
        opciones: { type: 'text', placeholder: 'Escribe tu respuesta aquí...' },
        orden: 8
      }
    ];
    
    // Preguntas específicas por carrera
    const preguntasEspecificas = {
      1: [ // Ingeniería de Sistemas
        {
          texto: '¿En qué medida el profesor relaciona los contenidos de la clase con problemáticas reales del campo de la Ingeniería de Sistemas?',
          categoria: 'Conocimiento del Tema',
          tipo: 'rating',
          opciones: { type: 'scale', min: 1, max: 5, labels: ['Muy malo', 'Malo', 'Regular', 'Bueno', 'Excelente'] },
          orden: 9
        },
        {
          texto: '¿Qué tanto sientes que las actividades en clase te ayudan a desarrollar una conciencia ética y social sobre el uso de la tecnología y la información?',
          categoria: 'Disponibilidad',
          tipo: 'rating',
          opciones: { type: 'scale', min: 1, max: 5, labels: ['Muy malo', 'Malo', 'Regular', 'Bueno', 'Excelente'] },
          orden: 10
        },
        {
          texto: '¿Cómo describirías el aporte del profesor a tu formación como ingeniero(a) de sistemas?',
          categoria: 'Disponibilidad',
          tipo: 'text',
          opciones: { type: 'text', placeholder: 'Escribe tu respuesta aquí...' },
          orden: 11
        }
      ],
      2: [ // Ingeniería Civil
        {
          texto: '¿En qué medida el profesor relaciona los contenidos de la clase con problemáticas reales de la Ingeniería Civil?',
          categoria: 'Conocimiento del Tema',
          tipo: 'rating',
          opciones: { type: 'scale', min: 1, max: 5, labels: ['Muy malo', 'Malo', 'Regular', 'Bueno', 'Excelente'] },
          orden: 9
        },
        {
          texto: '¿Qué tanto sientes que las actividades en clase te ayudan a desarrollar una conciencia sobre la responsabilidad social y ambiental del ingeniero civil?',
          categoria: 'Disponibilidad',
          tipo: 'rating',
          opciones: { type: 'scale', min: 1, max: 5, labels: ['Muy malo', 'Malo', 'Regular', 'Bueno', 'Excelente'] },
          orden: 10
        },
        {
          texto: '¿Cómo describirías el aporte del profesor a tu formación como ingeniero(a) civil?',
          categoria: 'Disponibilidad',
          tipo: 'text',
          opciones: { type: 'text', placeholder: 'Escribe tu respuesta aquí...' },
          orden: 11
        }
      ],
      3: [ // Ingeniería Ambiental
        {
          texto: '¿En qué medida el profesor relaciona los contenidos de la clase con problemáticas ambientales reales?',
          categoria: 'Conocimiento del Tema',
          tipo: 'rating',
          opciones: { type: 'scale', min: 1, max: 5, labels: ['Muy malo', 'Malo', 'Regular', 'Bueno', 'Excelente'] },
          orden: 9
        },
        {
          texto: '¿Qué tanto sientes que las actividades en clase te ayudan a desarrollar una conciencia ambiental y social sobre el impacto de la ingeniería en el entorno?',
          categoria: 'Disponibilidad',
          tipo: 'rating',
          opciones: { type: 'scale', min: 1, max: 5, labels: ['Muy malo', 'Malo', 'Regular', 'Bueno', 'Excelente'] },
          orden: 10
        },
        {
          texto: '¿Cómo describirías el aporte del profesor a tu formación como ingeniero(a) ambiental?',
          categoria: 'Disponibilidad',
          tipo: 'text',
          opciones: { type: 'text', placeholder: 'Escribe tu respuesta aquí...' },
          orden: 11
        }
      ]
    };
    
    // Insertar preguntas para cada carrera
    for (const carrera of carreras) {
      console.log(`\n   📚 Procesando ${carrera.nombre}...`);
      
      const preguntasParaInsertar = [...preguntasBase];
      
      // Agregar preguntas específicas si existen
      if (preguntasEspecificas[carrera.id]) {
        preguntasParaInsertar.push(...preguntasEspecificas[carrera.id]);
      } else if (carrera.id === null) {
        // Para tronco común, agregar preguntas específicas
        preguntasParaInsertar.push(
          {
            texto: '¿En qué medida el profesor relaciona los contenidos de la clase con problemáticas o situaciones reales actuales del entorno social o profesional?',
            categoria: 'Conocimiento del Tema',
            tipo: 'rating',
            opciones: { type: 'scale', min: 1, max: 5, labels: ['Muy malo', 'Malo', 'Regular', 'Bueno', 'Excelente'] },
            orden: 9
          },
          {
            texto: '¿Cómo describirías el aporte del profesor a tu formación como ingeniero(a)?',
            categoria: 'Disponibilidad',
            tipo: 'text',
            opciones: { type: 'text', placeholder: 'Escribe tu respuesta aquí...' },
            orden: 10
          }
        );
      }
      
      // Preparar datos para inserción
      const datosInsercion = preguntasParaInsertar.map(pregunta => ({
        categoria_id: categoriaMap[pregunta.categoria],
        texto_pregunta: pregunta.texto,
        descripcion: `Pregunta para ${carrera.nombre} - ${pregunta.categoria}`,
        tipo_pregunta: pregunta.tipo,
        opciones: pregunta.opciones,
        obligatoria: true,
        orden: pregunta.orden,
        activa: true,
        id_carrera: carrera.id
      }));
      
      // Insertar preguntas
      const { error: errorInsert } = await supabase
        .from('preguntas_evaluacion')
        .insert(datosInsercion);
      
      if (errorInsert) {
        console.log(`   ❌ Error insertando preguntas para ${carrera.nombre}:`, errorInsert.message);
      } else {
        console.log(`   ✅ ${datosInsercion.length} preguntas insertadas para ${carrera.nombre}`);
      }
    }
    
    // Paso 5: Verificación final
    console.log('\n📝 Paso 5: Verificación final...');
    
    const { data: preguntasFinales, error: errorFinal } = await supabase
      .from('preguntas_evaluacion')
      .select('*')
      .eq('activa', true);
    
    if (errorFinal) {
      console.log('❌ Error en verificación final:', errorFinal.message);
    } else {
      const porCarrera = {};
      preguntasFinales.forEach(p => {
        const carrera = p.id_carrera ? `Carrera ${p.id_carrera}` : 'Tronco Común';
        porCarrera[carrera] = (porCarrera[carrera] || 0) + 1;
      });
      
      console.log('✅ Verificación completada:');
      console.log(`   📊 Total preguntas activas: ${preguntasFinales.length}`);
      Object.entries(porCarrera).forEach(([carrera, count]) => {
        console.log(`   📚 ${carrera}: ${count} preguntas`);
      });
    }
    
    console.log('\n🎉 ¡Actualización completada exitosamente!');
    console.log('📋 Las preguntas están listas para ser utilizadas en el sistema');
    
  } catch (error) {
    console.error('❌ Error general:', error.message);
  }
}

// Ejecutar el script
ejecutarScriptCompleto();
