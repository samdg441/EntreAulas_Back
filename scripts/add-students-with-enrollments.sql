-- =====================================================
-- SCRIPT PARA AGREGAR ESTUDIANTES CON INSCRIPCIONES
-- =====================================================
-- Este script:
-- 1. Inserta estudiantes en la tabla 'usuarios'
-- 2. Los mueve automáticamente a 'estudiantes' (via trigger)
-- 3. Realiza inscripciones a grupos específicos

-- IMPORTANTE: Ejecuta primero el script supabase-triggers.sql
-- para que funcionen los triggers de hash de contraseña y creación automática

BEGIN;

-- =====================================================
-- 1. CREAR ESTUDIANTES EN TABLA USUARIOS
-- =====================================================

-- Insertar estudiantes (las contraseñas se hashean automáticamente)
INSERT INTO usuarios (email, password, nombre, apellido, tipo_usuario)
VALUES 
  ('maria.gomez@udem.edu.co', 'Password123!', 'María', 'Gómez', 'estudiante'),
  ('carlos.rojas@udem.edu.co', 'Password123!', 'Carlos', 'Rojas', 'estudiante'),
  ('ana.lopez@udem.edu.co', 'Password123!', 'Ana', 'López', 'estudiante'),
  ('pedro.ramirez@udem.edu.co', 'Password123!', 'Pedro', 'Ramírez', 'estudiante'),
  ('sofia.diaz@udem.edu.co', 'Password123!', 'Sofía', 'Díaz', 'estudiante');

-- =====================================================
-- 2. ACTUALIZAR INFORMACIÓN EN TABLA ESTUDIANTES
-- =====================================================

-- Actualizar información específica de estudiantes
UPDATE estudiantes 
SET 
  codigo = 'EST001',
  carrera_id = 1,
  semestre = '2025-1',
  activo = true
WHERE usuario_id = (SELECT id FROM usuarios WHERE email = 'maria.gomez@udem.edu.co');

UPDATE estudiantes 
SET 
  codigo = 'EST002',
  carrera_id = 1,
  semestre = '2025-1',
  activo = true
WHERE usuario_id = (SELECT id FROM usuarios WHERE email = 'carlos.rojas@udem.edu.co');

UPDATE estudiantes 
SET 
  codigo = 'EST003',
  carrera_id = 2,
  semestre = '2025-1',
  activo = true
WHERE usuario_id = (SELECT id FROM usuarios WHERE email = 'ana.lopez@udem.edu.co');

UPDATE estudiantes 
SET 
  codigo = 'EST004',
  carrera_id = 2,
  semestre = '2025-1',
  activo = true
WHERE usuario_id = (SELECT id FROM usuarios WHERE email = 'pedro.ramirez@udem.edu.co');

UPDATE estudiantes 
SET 
  codigo = 'EST005',
  carrera_id = 1,
  semestre = '2025-1',
  activo = true
WHERE usuario_id = (SELECT id FROM usuarios WHERE email = 'sofia.diaz@udem.edu.co');

-- =====================================================
-- 3. REALIZAR INSCRIPCIONES A GRUPOS
-- =====================================================

-- IMPORTANTE: Ajusta los grupo_id según los grupos existentes en tu BD
-- Puedes consultar los grupos disponibles con:
-- SELECT id, curso_id, numero_grupo FROM grupos WHERE activo = true;

-- Inscribir María Gómez en grupos (ajusta los IDs según tu BD)
INSERT INTO inscripciones (estudiante_id, grupo_id, activa, fecha_inscripcion)
VALUES 
  ((SELECT id FROM estudiantes WHERE codigo = 'EST001'), 1, true, NOW()),
  ((SELECT id FROM estudiantes WHERE codigo = 'EST001'), 2, true, NOW()),
  ((SELECT id FROM estudiantes WHERE codigo = 'EST001'), 3, true, NOW());

-- Inscribir Carlos Rojas en grupos
INSERT INTO inscripciones (estudiante_id, grupo_id, activa, fecha_inscripcion)
VALUES 
  ((SELECT id FROM estudiantes WHERE codigo = 'EST002'), 1, true, NOW()),
  ((SELECT id FROM estudiantes WHERE codigo = 'EST002'), 4, true, NOW()),
  ((SELECT id FROM estudiantes WHERE codigo = 'EST002'), 5, true, NOW());

-- Inscribir Ana López en grupos
INSERT INTO inscripciones (estudiante_id, grupo_id, activa, fecha_inscripcion)
VALUES 
  ((SELECT id FROM estudiantes WHERE codigo = 'EST003'), 2, true, NOW()),
  ((SELECT id FROM estudiantes WHERE codigo = 'EST003'), 6, true, NOW()),
  ((SELECT id FROM estudiantes WHERE codigo = 'EST003'), 7, true, NOW());

-- Inscribir Pedro Ramírez en grupos
INSERT INTO inscripciones (estudiante_id, grupo_id, activa, fecha_inscripcion)
VALUES 
  ((SELECT id FROM estudiantes WHERE codigo = 'EST004'), 3, true, NOW()),
  ((SELECT id FROM estudiantes WHERE codigo = 'EST004'), 8, true, NOW()),
  ((SELECT id FROM estudiantes WHERE codigo = 'EST004'), 9, true, NOW());

-- Inscribir Sofía Díaz en grupos
INSERT INTO inscripciones (estudiante_id, grupo_id, activa, fecha_inscripcion)
VALUES 
  ((SELECT id FROM estudiantes WHERE codigo = 'EST005'), 4, true, NOW()),
  ((SELECT id FROM estudiantes WHERE codigo = 'EST005'), 10, true, NOW()),
  ((SELECT id FROM estudiantes WHERE codigo = 'EST005'), 11, true, NOW());

COMMIT;

-- =====================================================
-- VERIFICACIÓN
-- =====================================================

-- Verificar que los estudiantes se crearon correctamente
SELECT 
  u.id,
  u.email,
  u.nombre,
  u.apellido,
  u.tipo_usuario,
  e.codigo,
  e.carrera_id,
  e.semestre,
  e.activo
FROM usuarios u
JOIN estudiantes e ON u.id = e.usuario_id
WHERE u.email IN (
  'maria.gomez@udem.edu.co',
  'carlos.rojas@udem.edu.co',
  'ana.lopez@udem.edu.co',
  'pedro.ramirez@udem.edu.co',
  'sofia.diaz@udem.edu.co'
);

-- Verificar inscripciones
SELECT 
  i.id,
  u.nombre,
  u.apellido,
  e.codigo,
  i.grupo_id,
  g.numero_grupo,
  c.nombre as curso_nombre,
  i.activa,
  i.fecha_inscripcion
FROM inscripciones i
JOIN estudiantes e ON i.estudiante_id = e.id
JOIN usuarios u ON e.usuario_id = u.id
JOIN grupos g ON i.grupo_id = g.id
JOIN cursos c ON g.curso_id = c.id
WHERE u.email IN (
  'maria.gomez@udem.edu.co',
  'carlos.rojas@udem.edu.co',
  'ana.lopez@udem.edu.co',
  'pedro.ramirez@udem.edu.co',
  'sofia.diaz@udem.edu.co'
)
ORDER BY u.nombre, c.nombre;

-- =====================================================
-- INSTRUCCIONES DE USO
-- =====================================================
-- 
-- 1. ANTES DE EJECUTAR:
--    - Ejecuta primero: supabase-triggers.sql
--    - Verifica que existan grupos en la tabla 'grupos'
--    - Ajusta los grupo_id en las inscripciones según tu BD
--    - Ajusta los carrera_id según las carreras existentes
--
-- 2. CONSULTAS ÚTILES:
--    -- Ver grupos disponibles:
--    SELECT id, curso_id, numero_grupo, horario FROM grupos WHERE activo = true;
--    
--    -- Ver carreras disponibles:
--    SELECT id, nombre FROM carreras WHERE activo = true;
--    
--    -- Ver cursos disponibles:
--    SELECT id, nombre, codigo FROM cursos WHERE activo = true;
--
-- 3. DESPUÉS DE EJECUTAR:
--    - Los estudiantes podrán hacer login con sus emails y contraseñas
--    - Estarán inscritos en los grupos especificados
--    - Podrán realizar evaluaciones de los profesores de esos grupos
--
-- =====================================================
