// =====================================================
// IMPORTAR / ACTUALIZAR CURSOS Y GRUPOS DE SISTEMAS DESDE CSV
// Lee "materias sistemas1.csv" (CODIGO;NOMBRE) y:
// - Crea/actualiza cursos (tabla "cursos") usando el código base (antes del guion).
// - Crea los grupos (tabla "grupos") usando lo que va después del guion como numero_grupo.
// No crea estudiantes ni inscripciones.
// =====================================================

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

let supabase;

async function initSupabase() {
  if (supabase) return supabase;
  const { createClient } = await import('@supabase/supabase-js');
  supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  return supabase;
}

const CSV_FILE_NAME = 'materias sistemas1.csv';
const csvPath = path.resolve(__dirname, '..', CSV_FILE_NAME);

function parseCursosDesdeCsv() {
  if (!fs.existsSync(csvPath)) {
    throw new Error(`No se encontró el archivo CSV en: ${csvPath}`);
  }

  const raw = fs.readFileSync(csvPath, 'utf-8').replace(/^\uFEFF/, '');
  const lines = raw
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0);

  const cursos = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Saltar encabezados y líneas de programa / nivel
    if (
      line.startsWith('CODIGO;') ||
      line.startsWith('ASIGNATURA;') ||
      line.startsWith('PROGRAMA') ||
      line === ';'
    ) {
      continue;
    }

    const cols = line.split(';').map(c => c.trim());
    if (cols.length < 2) continue;

    const codigoCompleto = cols[0];
    const nombre = cols[1];

    if (!codigoCompleto || !nombre) continue;

    const [codigoBase, sufijoGrupo] = codigoCompleto.split('-');
    if (!codigoBase || !sufijoGrupo) continue;

    const numeroGrupo = parseInt(sufijoGrupo, 10);
    if (Number.isNaN(numeroGrupo)) continue;

    cursos.push({ codigoBase, nombre, numeroGrupo });
  }

  // Agrupar por nombre (normalizado) para obtener:
  // - un solo código base por curso
  // - el conjunto de grupos asociado
  const porNombre = new Map();
  for (const { codigoBase, nombre, numeroGrupo } of cursos) {
    const key = nombre.toUpperCase();
    if (!porNombre.has(key)) {
      porNombre.set(key, {
        nombre,
        codigoBase,
        grupos: new Set([numeroGrupo])
      });
    } else {
      const entry = porNombre.get(key);
      entry.codigoBase = codigoBase; // el último código base "gana"
      entry.grupos.add(numeroGrupo);
    }
  }

  return Array.from(porNombre.values()).map(entry => ({
    nombre: entry.nombre,
    codigoBase: entry.codigoBase,
    grupos: Array.from(entry.grupos).sort((a, b) => a - b)
  }));
}

async function getOrCreateCourse(nombre, codigoBase) {
  const { data: existing, error } = await supabase
    .from('cursos')
    .select('id, nombre, codigo')
    .ilike('nombre', nombre)
    .maybeSingle();

  if (error) throw error;

  if (existing) {
    if (existing.codigo === codigoBase) {
      console.log(`   = Curso ya actualizado: "${nombre}" (codigo=${codigoBase})`);
      return existing.id;
    }

    const payload = {
      codigo: codigoBase,
      activo: true
    };
    const { error: updateError } = await supabase
      .from('cursos')
      .update(payload)
      .eq('id', existing.id);

    if (updateError) throw updateError;
    console.log(
      `   🔁 Curso actualizado: "${nombre}" (id=${existing.id}) codigo: ${existing.codigo} -> ${codigoBase}`
    );
    return existing.id;
  }

  const payload = {
    nombre,
    codigo: codigoBase,
    activo: true
  };

  const { data: inserted, error: insertError } = await supabase
    .from('cursos')
    .insert(payload)
    .select('id')
    .single();

  if (insertError) {
    // Si el código ya existe para otro curso, reutilizamos ese curso y actualizamos el nombre si hace falta.
    if (
      insertError.code === '23505' ||
      (insertError.message && insertError.message.includes('cursos_codigo_key'))
    ) {
      const { data: byCode, error: fetchError } = await supabase
        .from('cursos')
        .select('id, nombre, codigo')
        .eq('codigo', codigoBase)
        .maybeSingle();

      if (fetchError || !byCode) {
        throw insertError;
      }

      if (byCode.nombre !== nombre) {
        const { error: updateNombreError } = await supabase
          .from('cursos')
          .update({ nombre })
          .eq('id', byCode.id);

        if (updateNombreError) {
          console.warn(
            `⚠️ No se pudo actualizar nombre del curso con codigo=${codigoBase}:`,
            updateNombreError.message
          );
        } else {
          console.log(
            `   🔁 Curso existente con mismo código reutilizado y nombre actualizado: "${nombre}" (id=${byCode.id}, codigo=${codigoBase})`
          );
        }
      } else {
        console.log(
          `   = Curso existente con mismo código reutilizado: "${byCode.nombre}" (id=${byCode.id}, codigo=${codigoBase})`
        );
      }

      return byCode.id;
    }

    throw insertError;
  }

  console.log(
    `   📚 Curso creado: "${nombre}" (id=${inserted.id}, codigo=${codigoBase})`
  );
  return inserted.id;
}

async function getOrCreateGroup(cursoId, numeroGrupo) {
  const { data: existing, error } = await supabase
    .from('grupos')
    .select('id, numero_grupo, periodo_id')
    .eq('curso_id', cursoId)
    .eq('numero_grupo', numeroGrupo)
    .maybeSingle();

  if (error) throw error;

  if (existing) {
    console.log(`   = Grupo ya existe: curso_id=${cursoId}, grupo=${numeroGrupo}`);
    return existing.id;
  }

  const { data, error: insertError } = await supabase
    .from('grupos')
    .insert({
      curso_id: cursoId,
      numero_grupo: numeroGrupo,
      activo: true,
      periodo_id: await getDefaultPeriodoId()
    })
    .select('id')
    .single();

  if (insertError) throw insertError;

  console.log(`   👥 Grupo creado: curso_id=${cursoId}, grupo=${numeroGrupo} (id=${data.id})`);
  return data.id;
}

async function getDefaultPeriodoId() {
  const { data, error } = await supabase
    .from('periodos_academicos')
    .select('id')
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    console.warn(
      '⚠️ No se pudo obtener periodo académico; usando id=1 por defecto. Ajusta esto si es necesario.'
    );
    return 1;
  }

  return data.id;
}

async function main() {
  try {
    await initSupabase();
    console.log('📄 Leyendo CSV de materias de Sistemas:', CSV_FILE_NAME);
    const cursos = parseCursosDesdeCsv();
    console.log(`✅ ${cursos.length} cursos únicos (por nombre) encontrados\n`);

    for (const curso of cursos) {
      console.log(`\n➡️ Curso: "${curso.nombre}"`);
      console.log(`   Código base: ${curso.codigoBase}`);
      console.log(`   Grupos: ${curso.grupos.join(', ')}`);

      const cursoId = await getOrCreateCourse(curso.nombre, curso.codigoBase);

      for (const numeroGrupo of curso.grupos) {
        await getOrCreateGroup(cursoId, numeroGrupo);
      }
    }

    console.log('\n✅ Cursos y grupos de Ingeniería de Sistemas importados/actualizados.');
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

main();

