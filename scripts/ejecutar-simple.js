const fs = require('fs');
const path = require('path');

console.log('🚀 Script para actualizar preguntas por carrera');
console.log('================================================\n');

console.log('📋 INSTRUCCIONES:');
console.log('1. Ve a tu proyecto de Supabase');
console.log('2. Abre el SQL Editor');
console.log('3. Ejecuta los siguientes scripts en orden:\n');

const scripts = [
  {
    archivo: 'add-carrera-id-to-preguntas.sql',
    descripcion: 'Script base - Agrega columna id_carrera y funciones'
  },
  {
    archivo: 'actualizar-preguntas-por-carrera.sql', 
    descripcion: 'Script principal - Desactiva preguntas existentes e inserta nuevas'
  },
  {
    archivo: 'completar-preguntas-carreras-restantes.sql',
    descripcion: 'Script complementario - Completa carreras restantes'
  },
  {
    archivo: 'verificar-preguntas-por-carrera.sql',
    descripcion: 'Script de verificación - Verifica que todo esté correcto'
  }
];

scripts.forEach((script, index) => {
  console.log(`${index + 1}. ${script.descripcion}`);
  console.log(`   Archivo: ${script.archivo}`);
  
  try {
    const rutaArchivo = path.join(__dirname, script.archivo);
    const contenido = fs.readFileSync(rutaArchivo, 'utf8');
    const lineas = contenido.split('\n').length;
    console.log(`   📄 Líneas: ${lineas}`);
    console.log(`   📁 Ruta: ${rutaArchivo}\n`);
  } catch (error) {
    console.log(`   ❌ Error leyendo archivo: ${error.message}\n`);
  }
});

console.log('🔧 COMANDOS ALTERNATIVOS:');
console.log('Si tienes Node.js configurado con Supabase:');
console.log('   node ejecutar-actualizacion-preguntas.js --directo');
console.log('\nSi quieres ver el contenido de un script:');
console.log('   node ejecutar-simple.js --mostrar [nombre-archivo]');

// Mostrar contenido de un archivo específico si se solicita
if (process.argv.includes('--mostrar')) {
  const archivoIndex = process.argv.indexOf('--mostrar') + 1;
  const nombreArchivo = process.argv[archivoIndex];
  
  if (nombreArchivo) {
    try {
      const rutaArchivo = path.join(__dirname, nombreArchivo);
      const contenido = fs.readFileSync(rutaArchivo, 'utf8');
      console.log(`\n📄 CONTENIDO DE ${nombreArchivo}:`);
      console.log('='.repeat(50));
      console.log(contenido);
    } catch (error) {
      console.log(`❌ Error leyendo ${nombreArchivo}: ${error.message}`);
    }
  } else {
    console.log('❌ Debes especificar el nombre del archivo');
    console.log('Ejemplo: node ejecutar-simple.js --mostrar add-carrera-id-to-preguntas.sql');
  }
}
