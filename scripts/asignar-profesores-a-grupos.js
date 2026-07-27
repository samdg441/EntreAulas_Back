// =====================================================
// ASIGNAR PROFESORES A GRUPOS (asignaciones_profesor)
// Usa los horarios de programación académica: codigo asignatura (ej. CM00102987-061)
// y documento del profesor. Lee profesores desde CSV para documento -> email -> profesor_id.
// =====================================================

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

let supabase;

const CSV_PROFESORES = 'Profesores_Sistemas - Profesores_Sistemas.csv';
const csvProfPath = path.resolve(__dirname, '..', CSV_PROFESORES);

async function initSupabase() {
  if (supabase) return supabase;
  const { createClient } = await import('@supabase/supabase-js');
  supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  return supabase;
}

/** Parsea CSV profesores: documento -> email */
function loadDocumentoToEmail() {
  if (!fs.existsSync(csvProfPath)) {
    throw new Error(`No se encontró ${csvProfPath}`);
  }
  const raw = fs.readFileSync(csvProfPath, 'utf-8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
  const map = new Map();
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map((c) => c.trim());
    if (cols.length >= 5 && cols[0] && cols[4]) {
      map.set(cols[0], cols[4]);
    }
  }
  return map;
}

// Asignaciones extraídas de los horarios (codigo_base, numero_grupo, documento_profesor)
const ASIGNACIONES = [
  // -----------------------------------------------------
  // TCI / TRONCO COMÚN (capturas nuevas)
  // -----------------------------------------------------
  ['TC60507715', 401, '40078524'],   // PROYECTO DE INGENIERÍA I -401 -> MANRIQUE LOSADA BELL
  ['TC60507715', 402, '1037572595'], // PROYECTO DE INGENIERÍA I -402 -> RESTREPO TAMAYO LUZ MARCELA
  ['TC60507715', 403, '1037572595'], // PROYECTO DE INGENIERÍA I -403 -> RESTREPO TAMAYO LUZ MARCELA
  ['TC60507715', 404, '40078524'],   // PROYECTO DE INGENIERÍA I -404 -> MANRIQUE LOSADA BELL

  ['EN60107959', 401, '98528249'],   // PENSAMIENTO INGENIERIL -401 -> MAYA VASCO GABRIEL JAIME
  ['EN60107959', 402, '79955036'],   // PENSAMIENTO INGENIERIL -402 -> LUNA DEL RISCO MARIO ALBERTO
  ['EN60107959', 403, '75090594'],   // PENSAMIENTO INGENIERIL -403 -> ARREDONDO OROZCO CARLOS ANDRÉS
  ['EN60107959', 404, '98528249'],   // PENSAMIENTO INGENIERIL -404 -> MAYA VASCO GABRIEL JAIME
  ['EN60107959', 405, '75090594'],   // PENSAMIENTO INGENIERIL -405 -> ARREDONDO OROZCO CARLOS ANDRÉS
  ['EN60107959', 406, '43991079'],   // PENSAMIENTO INGENIERIL -406 -> ARIAS RENDON DENNIS MAGALI
  ['EN60107959', 407, '43628807'],   // PENSAMIENTO INGENIERIL -407 -> ZULIANI COLETTI SANDRA
  ['EN60107959', 408, '43628807'],   // PENSAMIENTO INGENIERIL -408 -> ZULIANI COLETTI SANDRA

  ['IE00107706', 401, '43209242'],   // PENSAMIENTO ALGORÍTMICO -401 -> VILLA MONTOYA LUISA FERNANDA
  ['IE00107706', 402, '8027996'],    // PENSAMIENTO ALGORÍTMICO -402 -> ÁLVAREZ AGUDELO DAVID
  ['IE00107706', 403, '1001420737'], // PENSAMIENTO ALGORÍTMICO -403 -> LÓPEZ GIRALDO YESENIA
  ['IE00107706', 404, '8100538'],    // PENSAMIENTO ALGORÍTMICO -404 -> FLÓREZ GAVIRIA JUAN GUILLERMO
  ['IE00107706', 405, '71262387'],   // PENSAMIENTO ALGORÍTMICO -405 -> GONZÁLEZ PALACIO MAURICIO
  ['IE00107706', 406, '1103099121'], // PENSAMIENTO ALGORÍTMICO -406 -> ARRIETA GONZÁLEZ CARLOS ERNESTO
  ['IE00107706', 407, '98519463'],   // PENSAMIENTO ALGORÍTMICO -407 -> MUÑOZ JARAMILLO RICARDO ADOLFO
  ['IE00107706', 408, '1001420737'], // PENSAMIENTO ALGORÍTMICO -408 -> LÓPEZ GIRALDO YESENIA
  ['IE00107706', 409, '1018376096'], // PENSAMIENTO ALGORÍTMICO -409 -> SALDARRIAGA ÁLVAREZ MARIO ALEJANDRO
  ['IE00107706', 413, '98584089'],   // PENSAMIENTO ALGORÍTMICO -413 -> ECHEVERRI ARIAS JAIME ALBERTO
  ['IE00107706', 414, '98584089'],   // PENSAMIENTO ALGORÍTMICO -414 -> ECHEVERRI ARIAS JAIME ALBERTO

  ['CM00102987', 61, '1018376096'],
  ['CM00102987', 62, '98584089'],
  ['CM00102987', 63, '98584089'],
  ['CM00102987', 64, '98584089'],
  ['CM00102987', 65, '1018376096'],
  ['CM00207979', 61, '43590344'],
  ['CM00207979', 65, '1152216905'],
  ['CM00207980', 61, '8029296'],
  ['CM00207980', 63, '8029296'],
  ['CM00207980', 66, '1018376096'],
  ['MT00203066', 61, '70062259'],
  ['MT00203066', 62, '70062259'],
  ['MT00203066', 63, '70062259'],
  ['CM00307981', 61, '1152216905'],
  ['CM00307981', 62, '8027996'],
  ['CM00307981', 64, '1036605136'],
  ['CM00307981', 65, '1036605136'],
  ['CM00307982', 61, '71757036'],
  ['CM00307982', 63, '1036688671'],
  ['CM00307982', 64, '71757036'],
  ['CM00307982', 65, '1036688671'],
  ['CM00307983', 61, '1128443432'],
  ['CM00307983', 62, '1128443432'],
  ['CM00307983', 64, '1026151318'],
  ['CM00307983', 65, '32108503'],
  ['CM00307983', 66, '32108503'],
  ['CM00307983', 67, '1026151318'],
  ['AD00403004', 61, '71657023'],
  ['AD00403004', 62, '71657023'],
  ['CM00407984', 61, '40078524'],
  ['CM00407984', 63, '98716018'],
  ['CM00407985', 61, '1045137425'],
  ['CM00407985', 62, '1045137425'],
  ['CM00407985', 63, '1128282732'],
  ['CM00407986', 61, '1128443432'],
  ['CM00407986', 63, '1128443432'],
  ['CM00407986', 64, '1128282732'],
  ['CM00507987', 61, '98716018'],
  ['CM00507987', 62, '98716018'],
  ['CM00507987', 64, '98716018'],
  ['CM00507988', 61, '8100538'],
  ['CM00507988', 62, '8100538'],
  ['TC00507299', 61, '1094242315'],
  ['TC00507299', 62, '1094242315'],
  ['TC00507299', 63, '1094242315'],
  ['TC50507287', 61, '43102431'],
  ['TC50507287', 62, '71262387'],
  ['TC50507287', 63, '43102431'],
  ['CM00607989', 61, '1017143450'],
  ['CM00607989', 63, '1017143450'],
  ['CM00607990', 61, '1036955282'],
  ['CM00607990', 63, '1036955282'],
  ['CM00607991', 61, '3415107'],
  ['CM00607991', 63, '3415107'],
  ['CM00607992', 61, '98519463'],
  ['CM00607992', 62, '98519463'],
  ['CM00707993', 61, '94062970'],
  ['CM00707993', 62, '94062970'],
  ['CM00707993', 63, '94062970'],
  ['CM00707994', 61, '1004347933'],
  ['CM00707994', 62, '1004347933'],
  ['CM00707995', 61, '34569201'],
  ['CM00707995', 62, '34569201'],
  ['CM00707995', 63, '34569201'],
  ['MT00703015', 61, '43209242'],
  ['MT00703015', 62, '43209242'],
  ['MT00703015', 63, '43209242'],
  ['CM00807996', 61, '52430820'],
  ['CM00807996', 62, '43991079'],
  ['CM00807997', 61, '1152434849'],
  ['CM00807997', 62, '1152434849'],
  ['CM00807998', 61, '79658192'],
  ['CM00807998', 62, '79658192'],
  ['CM00807999', 61, '71365709'],
  ['CM00807999', 62, '71365709'],
  ['CM00807999', 63, '98709623'],
  ['CM20805489', 61, '71266781'],
  ['CM20805489', 62, '71266781'],
  ['TC60807733', 61, '94062970'],
  ['TC60807733', 62, '43590344'],
  ['CM30908001', 61, '98709623'],
  ['CM30909115', 61, '71266781'],
  ['CM30910667', 61, '8106625']
  // NIVEL 10 (ÉNFASIS IV/V/VI, TRABAJO DE GRADO, PRÁCTICA) sin profesor asignado en la imagen
];

async function main() {
  try {
    await initSupabase();
    const documentoToEmail = loadDocumentoToEmail();
    console.log('📄 Asignaciones profesor-grupo desde horarios');
    console.log(`   Profesores en CSV: ${documentoToEmail.size}`);
    console.log(`   Asignaciones a procesar: ${ASIGNACIONES.length}\n`);

    const codigosUnicos = [...new Set(ASIGNACIONES.map(([c]) => c))];
    const documentosUnicos = [...new Set(ASIGNACIONES.map(([, , d]) => d))];
    const emailsNecesarios = documentosUnicos
      .map((d) => documentoToEmail.get(d))
      .filter(Boolean);

    process.stdout.write('   Cargando cursos y grupos... ');
    const { data: cursos, error: errCursos } = await supabase
      .from('cursos')
      .select('id, codigo')
      .in('codigo', codigosUnicos);
    if (errCursos) throw new Error('Cursos: ' + errCursos.message);
    const cursoByCodigo = new Map((cursos || []).map((c) => [c.codigo, c.id]));

    const cursoIds = [...new Set((cursos || []).map((c) => c.id))];
    const { data: grupos, error: errGrupos } = await supabase
      .from('grupos')
      .select('id, curso_id, numero_grupo')
      .in('curso_id', cursoIds.length ? cursoIds : [null]);
    if (errGrupos) throw new Error('Grupos: ' + errGrupos.message);
    const grupoByCursoYNum = new Map(
      (grupos || []).map((g) => [`${g.curso_id}-${g.numero_grupo}`, g.id])
    );
    console.log('listo.');

    process.stdout.write('   Cargando usuarios y profesores... ');
    const { data: usuarios, error: errUsuarios } = await supabase
      .from('usuarios')
      .select('id, email')
      .in('email', emailsNecesarios);
    if (errUsuarios) throw new Error('Usuarios: ' + errUsuarios.message);
    const usuarioByEmail = new Map((usuarios || []).map((u) => [u.email, u.id]));
    const usuarioIds = [...new Set((usuarios || []).map((u) => u.id))];
    const { data: profesores, error: errProfesores } = await supabase
      .from('profesores')
      .select('id, usuario_id')
      .in('usuario_id', usuarioIds.length ? usuarioIds : [null]);
    if (errProfesores) throw new Error('Profesores: ' + errProfesores.message);
    const profesorByUsuarioId = new Map((profesores || []).map((p) => [p.usuario_id, p.id]));
    const profesorByDocumento = new Map();
    for (const doc of documentosUnicos) {
      const email = documentoToEmail.get(doc);
      if (!email) continue;
      const uid = usuarioByEmail.get(email);
      if (!uid) continue;
      const pid = profesorByUsuarioId.get(uid);
      if (pid) profesorByDocumento.set(doc, pid);
    }
    console.log('listo.\n');

    const grupoIdsUnicos = [];
    for (const [codigoBase, numeroGrupo] of ASIGNACIONES) {
      const cid = cursoByCodigo.get(codigoBase);
      if (!cid) continue;
      const gid = grupoByCursoYNum.get(`${cid}-${numeroGrupo}`);
      if (gid) grupoIdsUnicos.push(gid);
    }
    const grupoIdsSet = [...new Set(grupoIdsUnicos)];
    let asignacionesExistentes = new Map();
    if (grupoIdsSet.length > 0) {
      const { data: existentes } = await supabase
        .from('asignaciones_profesor')
        .select('id, grupo_id')
        .in('grupo_id', grupoIdsSet);
      if (existentes) asignacionesExistentes = new Map(existentes.map((e) => [e.grupo_id, e.id]));
    }

    let creadas = 0;
    let omitidas = 0;
    let errores = 0;

    for (let idx = 0; idx < ASIGNACIONES.length; idx++) {
      const [codigoBase, numeroGrupo, documento] = ASIGNACIONES[idx];
      if (idx % 20 === 0 || idx === ASIGNACIONES.length - 1) {
        process.stdout.write(`   Procesando ${idx + 1}/${ASIGNACIONES.length}...\r`);
      }
      const email = documentoToEmail.get(documento);
      if (!email) {
        errores++;
        continue;
      }

      const cursoId = cursoByCodigo.get(codigoBase);
      if (!cursoId) {
        errores++;
        continue;
      }

      const grupoId = grupoByCursoYNum.get(`${cursoId}-${numeroGrupo}`);
      if (!grupoId) {
        errores++;
        continue;
      }

      const profesorId = profesorByDocumento.get(documento);
      if (!profesorId) {
        errores++;
        continue;
      }

      const existenteId = asignacionesExistentes.get(grupoId);

      if (existenteId) {
        const { error: upd } = await supabase
          .from('asignaciones_profesor')
          .update({ profesor_id: profesorId, curso_id: cursoId, activa: true })
          .eq('id', existenteId);
        if (upd) errores++;
        else omitidas++;
        continue;
      }

      const { error: ins } = await supabase.from('asignaciones_profesor').insert({
        profesor_id: profesorId,
        curso_id: cursoId,
        grupo_id: grupoId,
        activa: true
      });

      if (ins) {
        if (ins.message && (ins.message.includes('duplicate') || ins.message.includes('unique'))) {
          omitidas++;
        } else {
          errores++;
        }
        continue;
      }
      creadas++;
    }

    console.log('\n✅ Resumen:');
    console.log(`   Asignaciones creadas: ${creadas}`);
    console.log(`   Ya existían / actualizadas: ${omitidas}`);
    if (errores) console.log(`   Errores/omitidos: ${errores}`);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

main();
