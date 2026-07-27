const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Usar credenciales temporales para debug
const supabaseUrl = 'https://your-project.supabase.co';
const supabaseKey = 'your-anon-key';

console.log('⚠️ Using temporary credentials for debug');

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDatabase() {
  try {
    console.log('🔍 Checking database...\n');

    // 1. Verificar usuarios
    console.log('1. Checking usuarios...');
    const { data: usuarios, error: usuariosError } = await supabase
      .from('usuarios')
      .select('id, email, nombre, apellido, tipo_usuario')
      .limit(5);

    if (usuariosError) {
      console.log('❌ Error getting usuarios:', usuariosError);
    } else {
      console.log('✅ Usuarios found:', usuarios?.length || 0);
      console.log('Sample usuarios:', usuarios);
    }

    // 2. Verificar profesores
    console.log('\n2. Checking profesores...');
    const { data: profesores, error: profesoresError } = await supabase
      .from('profesores')
      .select('id, activo, usuario_id, usuario:usuarios(nombre, apellido, email)')
      .limit(5);

    if (profesoresError) {
      console.log('❌ Error getting profesores:', profesoresError);
    } else {
      console.log('✅ Profesores found:', profesores?.length || 0);
      console.log('Sample profesores:', profesores);
    }

    // 3. Verificar el profesor específico que está fallando
    console.log('\n3. Checking specific professor...');
    const { data: profesorEspecifico, error: profError } = await supabase
      .from('profesores')
      .select('id, activo, usuario_id, usuario:usuarios(nombre, apellido, email)')
      .eq('id', '8c1f98db-6722-4aac-ad68-2a368b6324d4')
      .single();

    if (profError) {
      console.log('❌ Error getting specific professor:', profError);
    } else {
      console.log('✅ Specific professor found:', profesorEspecifico);
    }

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

checkDatabase();
