const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Configuración de Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function ejecutarModificacionesBase() {
  console.log('🚀 Ejecutando modificaciones base de la tabla...\n');
  
  try {
    // 1. Agregar columna id_carrera
    console.log('📝 Paso 1: Agregando columna id_carrera...');
    const { error: error1 } = await supabase.rpc('exec_sql', {
      sql_query: 'ALTER TABLE preguntas_evaluacion ADD COLUMN IF NOT EXISTS id_carrera INTEGER;'
    });
    
    if (error1) {
      console.log('⚠️  Error agregando columna:', error1.message);
    } else {
      console.log('✅ Columna id_carrera agregada correctamente');
    }
    
    // 2. Crear índices
    console.log('\n📝 Paso 2: Creando índices...');
    const { error: error2 } = await supabase.rpc('exec_sql', {
      sql_query: 'CREATE INDEX IF NOT EXISTS idx_preguntas_evaluacion_carrera_id ON preguntas_evaluacion(id_carrera) WHERE id_carrera IS NOT NULL;'
    });
    
    if (error2) {
      console.log('⚠️  Error creando índice:', error2.message);
    } else {
      console.log('✅ Índice creado correctamente');
    }
    
    // 3. Verificar estructura
    console.log('\n📝 Paso 3: Verificando estructura...');
    const { data: columnas, error: error3 } = await supabase.rpc('exec_sql', {
      sql_query: `SELECT column_name, data_type, is_nullable 
                  FROM information_schema.columns 
                  WHERE table_name = 'preguntas_evaluacion' 
                  AND column_name = 'id_carrera';`
    });
    
    if (error3) {
      console.log('⚠️  Error verificando estructura:', error3.message);
    } else {
      console.log('✅ Estructura verificada:', columnas);
    }
    
    console.log('\n🎉 Modificaciones base completadas!');
    console.log('📋 Ahora puedes ejecutar el script principal');
    
  } catch (error) {
    console.error('❌ Error general:', error.message);
  }
}

// Ejecutar
ejecutarModificacionesBase();
