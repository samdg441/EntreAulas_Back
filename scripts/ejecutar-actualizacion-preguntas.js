const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Configuración de Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Error: Variables de entorno SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY no están configuradas');
  console.log('Por favor, configura estas variables en tu archivo .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function ejecutarScript(archivo) {
  try {
    console.log(`📄 Ejecutando script: ${archivo}`);
    
    const rutaArchivo = path.join(__dirname, archivo);
    const contenido = fs.readFileSync(rutaArchivo, 'utf8');
    
    // Dividir el script en comandos individuales
    const comandos = contenido
      .split(';')
      .map(cmd => cmd.trim())
      .filter(cmd => cmd.length > 0 && !cmd.startsWith('--'));
    
    console.log(`   📊 Ejecutando ${comandos.length} comandos...`);
    
    for (let i = 0; i < comandos.length; i++) {
      const comando = comandos[i];
      if (comando.trim()) {
        try {
          const { data, error } = await supabase.rpc('exec_sql', { 
            sql_query: comando + ';' 
          });
          
          if (error) {
            console.log(`   ⚠️  Comando ${i + 1}: ${error.message}`);
          } else {
            console.log(`   ✅ Comando ${i + 1} ejecutado correctamente`);
          }
        } catch (err) {
          console.log(`   ❌ Error en comando ${i + 1}: ${err.message}`);
        }
      }
    }
    
    console.log(`✅ Script ${archivo} completado\n`);
    
  } catch (error) {
    console.error(`❌ Error ejecutando ${archivo}:`, error.message);
  }
}

async function main() {
  console.log('🚀 Iniciando actualización de preguntas por carrera...\n');
  
  const scripts = [
    'add-carrera-id-to-preguntas.sql',
    'actualizar-preguntas-por-carrera.sql',
    'completar-preguntas-carreras-restantes.sql',
    'verificar-preguntas-por-carrera.sql'
  ];
  
  for (const script of scripts) {
    await ejecutarScript(script);
  }
  
  console.log('🎉 ¡Actualización completada!');
  console.log('📋 Revisa los resultados en el SQL Editor de Supabase');
}

// Función alternativa para ejecutar SQL directo
async function ejecutarSQLDirecto() {
  console.log('🔄 Ejecutando comandos SQL directos...\n');
  
  try {
    // 1. Desactivar todas las preguntas existentes
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
    
    // 2. Verificar categorías
    console.log('\n📝 Paso 2: Verificando categorías...');
    const { data: categorias, error: error2 } = await supabase
      .from('categorias_pregunta')
      .select('*');
    
    if (error2) {
      console.log('⚠️  Error obteniendo categorías:', error2.message);
    } else {
      console.log(`✅ Categorías encontradas: ${categorias.length}`);
      categorias.forEach(cat => {
        console.log(`   - ${cat.nombre} (ID: ${cat.id})`);
      });
    }
    
    // 3. Verificar preguntas actuales
    console.log('\n📝 Paso 3: Verificando estado actual...');
    const { data: preguntas, error: error3 } = await supabase
      .from('preguntas_evaluacion')
      .select('*');
    
    if (error3) {
      console.log('⚠️  Error obteniendo preguntas:', error3.message);
    } else {
      const activas = preguntas.filter(p => p.activa).length;
      const desactivadas = preguntas.filter(p => !p.activa).length;
      console.log(`✅ Total preguntas: ${preguntas.length}`);
      console.log(`   - Activas: ${activas}`);
      console.log(`   - Desactivadas: ${desactivadas}`);
    }
    
  } catch (error) {
    console.error('❌ Error en ejecución directa:', error.message);
  }
}

// Verificar si se debe ejecutar SQL directo
if (process.argv.includes('--directo')) {
  ejecutarSQLDirecto();
} else {
  main();
}
