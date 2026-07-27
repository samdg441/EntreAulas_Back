// =====================================================
// IMPORTAR PROFESORES DE INGENIERÍA DE SISTEMAS
// Lee el CSV: Documento, Nombre completo, Apellido, Nombre, Email
// Usa los correos del CSV; si no hay correo, usa documento@profesor.udemedellin.edu.co
// =====================================================

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

let supabase;

const CSV_FILE_NAME = 'Profesores_Sistemas - Profesores_Sistemas.csv';
const csvPath = path.resolve(__dirname, '..', CSV_FILE_NAME);

async function initSupabase() {
  if (supabase) return supabase;
  const { createClient } = await import('@supabase/supabase-js');
  supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  return supabase;
}

/**
 * Parsea el CSV de profesores. Columnas: Documento, Nombre completo, Apellido, Nombre, Email
 */
function parseCsvProfesores() {
  if (!fs.existsSync(csvPath)) {
    throw new Error(`No se encontró el archivo: ${csvPath}`);
  }
  const raw = fs.readFileSync(csvPath, 'utf-8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
  const profesores = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map((c) => c.trim());
    if (cols.length < 2) continue;
    const documento = cols[0];
    const nombreCompleto = cols[1] || '';
    const apellido = cols[2] || '';
    const nombre = cols[3] || '';
    const email = (cols[4] || '').trim();
    if (!documento) continue;
    profesores.push({
      documento,
      nombreCompleto,
      apellido: apellido || nombreCompleto,
      nombre: nombre || nombreCompleto,
      email: email && email.includes('@') ? email : `${documento}@profesor.udemedellin.edu.co`
    });
  }
  return profesores;
}

async function getCarreraSistemasId() {
  const { data, error } = await supabase
    .from('carreras')
    .select('id, nombre')
    .or(
      'nombre.ilike.%ingeniería de sistemas%,nombre.ilike.%ingenieria de sistemas%'
    )
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    console.warn('⚠️ Carrera Ingeniería de Sistemas no encontrada. Usando id=2.');
    return 2;
  }
  return data.id;
}

async function main() {
  try {
    await initSupabase();
    console.log('📄 Leyendo CSV:', CSV_FILE_NAME);
    const profesores = parseCsvProfesores();
    if (profesores.length === 0) {
      console.log('No hay filas de profesores en el CSV.');
      return;
    }
    const carreraId = await getCarreraSistemasId();
    console.log(`   Carrera id: ${carreraId}`);
    console.log(`   Total: ${profesores.length} profesores\n`);

    let creados = 0;
    let existentes = 0;
    let errores = 0;

    for (const p of profesores) {
      const email = p.email;

      const { data: existente } = await supabase
        .from('usuarios')
        .select('id')
        .eq('email', email)
        .maybeSingle();

      if (existente) {
        const { data: profRow } = await supabase
          .from('profesores')
          .select('id')
          .eq('usuario_id', existente.id)
          .maybeSingle();
        if (profRow) {
          console.log(`   ⏭️  Ya existe: ${p.nombreCompleto} (${email})`);
          existentes++;
          continue;
        }
        const payloadProf = {
          usuario_id: existente.id,
          carrera_id: carreraId,
          activo: true
        };
        const { error: errProfExist } = await supabase.from('profesores').insert(payloadProf);
        if (errProfExist) {
          if (
            errProfExist.message &&
            (errProfExist.message.includes('profesores_usuario_id_key') ||
              errProfExist.message.includes('duplicate key'))
          ) {
            console.log(`   ⏭️  Ya existe: ${p.nombreCompleto} (${email})`);
            existentes++;
          } else {
            console.warn(`   ❌ Error creando fila profesor (existente) ${p.documento}: ${errProfExist.message}`);
            errores++;
          }
        } else {
          console.log(`   ✅ Fila profesor añadida: ${p.nombreCompleto} (${email})`);
          creados++;
        }
        continue;
      }

      const { data: nuevoUsuario, error: errUsuario } = await supabase
        .from('usuarios')
        .insert({
          email,
          password: p.documento,
          nombre: p.nombre,
          apellido: p.apellido,
          tipo_usuario: 'profesor',
          activo: true
        })
        .select('id')
        .single();

      if (errUsuario) {
        console.warn(`   ❌ Error creando usuario ${p.documento}: ${errUsuario.message}`);
        errores++;
        continue;
      }

      await supabase.from('usuario_roles').insert({
        usuario_id: nuevoUsuario.id,
        rol: 'profesor',
        activo: true
      });

      const payload = {
        usuario_id: nuevoUsuario.id,
        carrera_id: carreraId,
        activo: true
      };
      const { error: errProf } = await supabase.from('profesores').insert(payload);

      if (errProf) {
        if (
          errProf.message &&
          (errProf.message.includes('profesores_usuario_id_key') ||
            errProf.message.includes('duplicate key'))
        ) {
          console.log(`   ✅ ${p.nombreCompleto} → ${email} (fila en profesores ya existía)`);
          creados++;
        } else {
          console.warn(`   ❌ Error creando fila profesor ${p.documento}: ${errProf.message}`);
          errores++;
        }
        continue;
      }

      console.log(`   ✅ ${p.nombreCompleto} → ${email}`);
      creados++;
    }

    console.log('\n✅ Resumen:');
    console.log(`   Creados: ${creados}`);
    console.log(`   Ya existían: ${existentes}`);
    if (errores) console.log(`   Errores: ${errores}`);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

main();
