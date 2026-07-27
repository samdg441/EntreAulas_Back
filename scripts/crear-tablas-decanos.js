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

async function crearTablasDecanos() {
  try {
    console.log('🔧 Creando tablas para decanos...');
    
    // 1. Crear tabla facultades
    console.log('📋 Paso 1: Creando tabla facultades...');
    
    const createFacultadesSQL = `
      CREATE TABLE IF NOT EXISTS facultades (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(255) NOT NULL,
        codigo VARCHAR(50) UNIQUE,
        descripcion TEXT,
        activo BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    const { error: facultadesError } = await supabase.rpc('exec_sql', { 
      sql: createFacultadesSQL 
    });

    if (facultadesError) {
      console.warn(`⚠️ Error creando tabla facultades: ${facultadesError.message}`);
    } else {
      console.log('✅ Tabla facultades creada');
    }

    // 2. Crear tabla decanos
    console.log('📋 Paso 2: Creando tabla decanos...');
    
    const createDecanosSQL = `
      CREATE TABLE IF NOT EXISTS decanos (
        id SERIAL PRIMARY KEY,
        usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        facultad_id INTEGER REFERENCES facultades(id) ON DELETE SET NULL,
        fecha_nombramiento TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        activo BOOLEAN DEFAULT true,
        observaciones TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        
        CONSTRAINT decanos_usuario_unique UNIQUE (usuario_id),
        CONSTRAINT decanos_facultad_unique UNIQUE (facultad_id)
      );
    `;

    const { error: decanosError } = await supabase.rpc('exec_sql', { 
      sql: createDecanosSQL 
    });

    if (decanosError) {
      console.warn(`⚠️ Error creando tabla decanos: ${decanosError.message}`);
    } else {
      console.log('✅ Tabla decanos creada');
    }

    // 3. Crear índices
    console.log('📋 Paso 3: Creando índices...');
    
    const createIndexesSQL = `
      CREATE INDEX IF NOT EXISTS idx_decanos_usuario_id ON decanos(usuario_id);
      CREATE INDEX IF NOT EXISTS idx_decanos_facultad_id ON decanos(facultad_id);
      CREATE INDEX IF NOT EXISTS idx_decanos_activo ON decanos(activo);
    `;

    const { error: indexesError } = await supabase.rpc('exec_sql', { 
      sql: createIndexesSQL 
    });

    if (indexesError) {
      console.warn(`⚠️ Error creando índices: ${indexesError.message}`);
    } else {
      console.log('✅ Índices creados');
    }

    // 4. Insertar facultad por defecto
    console.log('📋 Paso 4: Insertando facultad por defecto...');
    
    const { data: facultadExistente, error: facultadCheckError } = await supabase
      .from('facultades')
      .select('id')
      .eq('codigo', 'FI')
      .single();

    if (facultadCheckError && facultadCheckError.code !== 'PGRST116') {
      console.warn(`⚠️ Error verificando facultad: ${facultadCheckError.message}`);
    }

    if (!facultadExistente) {
      const { data: nuevaFacultad, error: insertFacultadError } = await supabase
        .from('facultades')
        .insert({
          nombre: 'Facultad de Ingenierías',
          codigo: 'FI',
          descripcion: 'Facultad de Ingenierías de la Universidad de Medellín'
        })
        .select('id, nombre')
        .single();

      if (insertFacultadError) {
        console.warn(`⚠️ Error insertando facultad: ${insertFacultadError.message}`);
      } else {
        console.log(`✅ Facultad insertada: ${nuevaFacultad.nombre} (ID: ${nuevaFacultad.id})`);
      }
    } else {
      console.log(`✅ Facultad ya existe (ID: ${facultadExistente.id})`);
    }

    // 5. Verificar que las tablas existen
    console.log('📋 Paso 5: Verificando tablas...');
    
    const { data: facultades, error: facultadesListError } = await supabase
      .from('facultades')
      .select('id, nombre, codigo')
      .limit(5);

    if (facultadesListError) {
      console.warn(`⚠️ Error listando facultades: ${facultadesListError.message}`);
    } else {
      console.log(`✅ Facultades encontradas: ${facultades?.length || 0}`);
      facultades?.forEach(f => {
        console.log(`   - ${f.nombre} (${f.codigo})`);
      });
    }

    const { data: decanos, error: decanosListError } = await supabase
      .from('decanos')
      .select('id, usuario_id, facultad_id, activo')
      .limit(5);

    if (decanosListError) {
      console.warn(`⚠️ Error listando decanos: ${decanosListError.message}`);
    } else {
      console.log(`✅ Decanos encontrados: ${decanos?.length || 0}`);
    }

    console.log('\n🎉 ¡Tablas creadas exitosamente!');
    console.log('📊 Tablas disponibles:');
    console.log('   - facultades: Información de las facultades');
    console.log('   - decanos: Información específica de los decanos');
    console.log('\n🔗 Ahora puedes ejecutar el script para insertar el decano');

  } catch (error) {
    console.error('❌ Error durante la creación de tablas:', error.message);
    process.exit(1);
  }
}

// Ejecutar la creación de tablas
crearTablasDecanos();




