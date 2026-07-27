// =====================================================
// SCRIPT NODE.JS PARA AGREGAR ESTUDIANTES CON INSCRIPCIONES
// =====================================================
// Este script:
// 1. Crea estudiantes en la tabla 'usuarios'
// 2. Los mueve automáticamente a 'estudiantes' (via trigger)
// 3. Realiza inscripciones a grupos específicos

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// =====================================================
// CONFIGURACIÓN DE ESTUDIANTES
// =====================================================

const estudiantes = [
  {
    email: 'maria.gomez@udem.edu.co',
    password: 'Password123!',
    nombre: 'María',
    apellido: 'Gómez',
    codigo: 'EST001',
    carrera_id: 1,
    semestre: '2025-1',
    grupos: [1, 2, 3] // Ajusta según los grupos existentes en tu BD
  },
  {
    email: 'carlos.rojas@udem.edu.co',
    password: 'Password123!',
    nombre: 'Carlos',
    apellido: 'Rojas',
    codigo: 'EST002',
    carrera_id: 1,
    semestre: '2025-1',
    grupos: [1, 4, 5]
  },
  {
    email: 'ana.lopez@udem.edu.co',
    password: 'Password123!',
    nombre: 'Ana',
    apellido: 'López',
    codigo: 'EST003',
    carrera_id: 2,
    semestre: '2025-1',
    grupos: [2, 6, 7]
  },
  {
    email: 'pedro.ramirez@udem.edu.co',
    password: 'Password123!',
    nombre: 'Pedro',
    apellido: 'Ramírez',
    codigo: 'EST004',
    carrera_id: 2,
    semestre: '2025-1',
    grupos: [3, 8, 9]
  },
  {
    email: 'sofia.diaz@udem.edu.co',
    password: 'Password123!',
    nombre: 'Sofía',
    apellido: 'Díaz',
    codigo: 'EST005',
    carrera_id: 1,
    semestre: '2025-1',
    grupos: [4, 10, 11]
  }
];

// =====================================================
// FUNCIONES AUXILIARES
// =====================================================

async function verificarGruposExistentes() {
  console.log('🔍 Verificando grupos existentes...');
  
  const { data: grupos, error } = await supabase
    .from('grupos')
    .select('id, numero_grupo, curso_id, cursos(nombre, codigo)')
    .eq('activo', true);
  
  if (error) {
    console.error('❌ Error consultando grupos:', error);
    return [];
  }
  
  console.log('📚 Grupos disponibles:');
  grupos.forEach(grupo => {
    console.log(`  - ID: ${grupo.id}, Grupo: ${grupo.numero_grupo}, Curso: ${grupo.cursos?.nombre} (${grupo.cursos?.codigo})`);
  });
  
  return grupos;
}

async function verificarCarrerasExistentes() {
  console.log('🔍 Verificando carreras existentes...');
  
  const { data: carreras, error } = await supabase
    .from('carreras')
    .select('id, nombre')
    .eq('activo', true);
  
  if (error) {
    console.error('❌ Error consultando carreras:', error);
    return [];
  }
  
  console.log('🎓 Carreras disponibles:');
  carreras.forEach(carrera => {
    console.log(`  - ID: ${carrera.id}, Nombre: ${carrera.nombre}`);
  });
  
  return carreras;
}

// =====================================================
// FUNCIÓN PRINCIPAL
// =====================================================

async function agregarEstudiantesConInscripciones() {
  try {
    console.log('🚀 Iniciando proceso de creación de estudiantes...\n');
    
    // Verificar datos existentes
    const grupos = await verificarGruposExistentes();
    const carreras = await verificarCarrerasExistentes();
    
    if (grupos.length === 0) {
      console.error('❌ No hay grupos disponibles. Crea grupos primero.');
      return;
    }
    
    if (carreras.length === 0) {
      console.error('❌ No hay carreras disponibles. Crea carreras primero.');
      return;
    }
    
    console.log('\n📝 Creando estudiantes...\n');
    
    for (const estudiante of estudiantes) {
      console.log(`👤 Creando estudiante: ${estudiante.nombre} ${estudiante.apellido}`);
      
      // 1. Crear usuario (el trigger lo mueve automáticamente a estudiantes)
      const { data: usuario, error: usuarioError } = await supabase
        .from('usuarios')
        .insert({
          email: estudiante.email,
          password: estudiante.password, // Se hashea automáticamente
          nombre: estudiante.nombre,
          apellido: estudiante.apellido,
          tipo_usuario: 'estudiante'
        })
        .select('id')
        .single();
      
      if (usuarioError) {
        console.error(`❌ Error creando usuario ${estudiante.email}:`, usuarioError);
        continue;
      }
      
      console.log(`  ✅ Usuario creado con ID: ${usuario.id}`);
      
      // 2. Actualizar información específica del estudiante
      const { error: estudianteError } = await supabase
        .from('estudiantes')
        .update({
          codigo: estudiante.codigo,
          carrera_id: estudiante.carrera_id,
          semestre: estudiante.semestre,
          activo: true
        })
        .eq('usuario_id', usuario.id);
      
      if (estudianteError) {
        console.error(`❌ Error actualizando estudiante ${estudiante.email}:`, estudianteError);
        continue;
      }
      
      console.log(`  ✅ Información de estudiante actualizada`);
      
      // 3. Realizar inscripciones
      const inscripciones = estudiante.grupos.map(grupoId => ({
        estudiante_id: usuario.id,
        grupo_id: grupoId,
        activa: true,
        fecha_inscripcion: new Date().toISOString()
      }));
      
      const { error: inscripcionError } = await supabase
        .from('inscripciones')
        .insert(inscripciones);
      
      if (inscripcionError) {
        console.error(`❌ Error creando inscripciones para ${estudiante.email}:`, inscripcionError);
        continue;
      }
      
      console.log(`  ✅ Inscrito en ${estudiante.grupos.length} grupos: [${estudiante.grupos.join(', ')}]`);
      console.log('');
    }
    
    console.log('🎉 ¡Proceso completado!');
    
    // Verificación final
    console.log('\n📊 Verificación final:');
    await verificarEstudiantesCreados();
    
  } catch (error) {
    console.error('❌ Error general:', error);
  }
}

async function verificarEstudiantesCreados() {
  const emails = estudiantes.map(e => e.email);
  
  const { data: usuarios, error } = await supabase
    .from('usuarios')
    .select(`
      id,
      email,
      nombre,
      apellido,
      estudiantes!inner(
        codigo,
        carrera_id,
        semestre,
        activo
      )
    `)
    .in('email', emails);
  
  if (error) {
    console.error('❌ Error en verificación:', error);
    return;
  }
  
  console.log('👥 Estudiantes creados:');
  usuarios.forEach(usuario => {
    const estudiante = usuario.estudiantes[0];
    console.log(`  - ${usuario.nombre} ${usuario.apellido} (${usuario.email})`);
    console.log(`    Código: ${estudiante.codigo}, Carrera: ${estudiante.carrera_id}, Semestre: ${estudiante.semestre}`);
  });
  
  // Verificar inscripciones
  const { data: inscripciones, error: inscError } = await supabase
    .from('inscripciones')
    .select(`
      estudiante_id,
      grupo_id,
      activa,
      grupos!inner(
        numero_grupo,
        cursos!inner(nombre, codigo)
      )
    `)
    .in('estudiante_id', usuarios.map(u => u.id))
    .eq('activa', true);
  
  if (inscError) {
    console.error('❌ Error verificando inscripciones:', inscError);
    return;
  }
  
  console.log('\n📚 Inscripciones realizadas:');
  inscripciones.forEach(inscripcion => {
    const grupo = inscripcion.grupos;
    const curso = grupo.cursos;
    console.log(`  - Estudiante ${inscripcion.estudiante_id}: ${curso.nombre} (${curso.codigo}) - Grupo ${grupo.numero_grupo}`);
  });
}

// =====================================================
// EJECUCIÓN
// =====================================================

if (import.meta.url === `file://${process.argv[1]}`) {
  agregarEstudiantesConInscripciones();
}

export { agregarEstudiantesConInscripciones };
