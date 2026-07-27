-- =====================================================
-- AGREGAR ROL DE DECANO AL SISTEMA
-- =====================================================
-- Este script agrega el rol de "decano" al sistema de roles múltiples
-- y actualiza las restricciones para permitir este nuevo rol

-- =====================================================
-- 1. ACTUALIZAR RESTRICCIÓN DE TIPO_USUARIO
-- =====================================================

-- Actualizar la restricción para permitir 'decano'
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_tipo_usuario_check;

-- Crear la nueva restricción que incluye 'decano'
ALTER TABLE usuarios ADD CONSTRAINT usuarios_tipo_usuario_check 
CHECK (tipo_usuario IN ('estudiante', 'profesor', 'docente', 'coordinador', 'admin', 'decano'));

-- =====================================================
-- 2. CREAR FUNCIÓN PARA ASIGNAR ROL DE DECANO
-- =====================================================

-- Función para crear un decano
CREATE OR REPLACE FUNCTION crear_decano(
  p_email VARCHAR(255),
  p_password VARCHAR(255),
  p_nombre VARCHAR(100),
  p_apellido VARCHAR(100),
  p_codigo_profesor VARCHAR(50) DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  nuevo_usuario_id UUID;
BEGIN
  -- Crear usuario
  INSERT INTO usuarios (email, password, nombre, apellido, tipo_usuario, activo)
  VALUES (p_email, p_password, p_nombre, p_apellido, 'profesor', true)
  RETURNING id INTO nuevo_usuario_id;
  
  -- Asignar rol de profesor
  PERFORM asignar_rol_usuario(nuevo_usuario_id, 'profesor');
  
  -- Asignar rol de coordinador (para acceso a funcionalidades de coordinación)
  PERFORM asignar_rol_usuario(nuevo_usuario_id, 'coordinador');
  
  -- Asignar rol de decano
  PERFORM asignar_rol_usuario(nuevo_usuario_id, 'decano');
  
  -- Crear registro en profesores (se hace automáticamente por trigger)
  -- El trigger ya crea el registro en profesores cuando se inserta un usuario con tipo_usuario = 'profesor'
  
  -- Crear registro en coordinadores para acceso completo
  INSERT INTO coordinadores (usuario_id, departamento, fecha_nombramiento, activo)
  VALUES (nuevo_usuario_id, 'Facultad de Ingenierías', NOW()::date, true);
  
  RETURN nuevo_usuario_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 3. CREAR VISTA PARA DECANOS
-- =====================================================

-- Vista para obtener decanos con información completa
CREATE OR REPLACE VIEW vista_decanos_completa AS
SELECT 
  u.id,
  u.email,
  u.nombre,
  u.apellido,
  u.activo,
  c.departamento,
  c.fecha_nombramiento,
  c.activo as coordinador_activo,
  p.id as profesor_id,
  p.codigo_profesor,
  p.activo as profesor_activo,
  ARRAY_AGG(ur.rol ORDER BY ur.rol) as roles_activos
FROM usuarios u
JOIN usuario_roles ur ON u.id = ur.usuario_id AND ur.rol = 'decano' AND ur.activo = true
LEFT JOIN coordinadores c ON u.id = c.usuario_id
LEFT JOIN profesores p ON u.id = p.usuario_id
WHERE u.activo = true
GROUP BY u.id, u.email, u.nombre, u.apellido, u.activo, c.departamento, c.fecha_nombramiento, c.activo, p.id, p.codigo_profesor, p.activo;

-- =====================================================
-- 4. FUNCIONES DE UTILIDAD PARA DECANOS
-- =====================================================

-- Función para verificar si un usuario es decano
CREATE OR REPLACE FUNCTION es_decano(p_usuario_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM usuario_roles 
    WHERE usuario_id = p_usuario_id 
    AND rol = 'decano' 
    AND activo = true
  );
END;
$$ LANGUAGE plpgsql;

-- Función para obtener todos los profesores de la facultad (solo para decanos)
CREATE OR REPLACE FUNCTION obtener_profesores_facultad(p_usuario_id UUID)
RETURNS TABLE (
  profesor_id INTEGER,
  usuario_id UUID,
  nombre VARCHAR(100),
  apellido VARCHAR(100),
  email VARCHAR(255),
  codigo_profesor VARCHAR(50),
  carrera_id INTEGER,
  carrera_nombre VARCHAR(100),
  departamento VARCHAR(100),
  activo BOOLEAN
) AS $$
BEGIN
  -- Verificar que el usuario sea decano
  IF NOT es_decano(p_usuario_id) THEN
    RAISE EXCEPTION 'Acceso denegado. Solo el decano puede ver todos los profesores de la facultad.';
  END IF;

  RETURN QUERY
  SELECT 
    p.id as profesor_id,
    p.usuario_id,
    u.nombre,
    u.apellido,
    u.email,
    p.codigo_profesor,
    p.carrera_id,
    c.nombre as carrera_nombre,
    p.departamento,
    p.activo
  FROM profesores p
  JOIN usuarios u ON p.usuario_id = u.id
  LEFT JOIN carreras c ON p.carrera_id = c.id
  WHERE p.activo = true AND u.activo = true
  ORDER BY u.nombre, u.apellido;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 5. COMENTARIOS Y DOCUMENTACIÓN
-- =====================================================

COMMENT ON FUNCTION crear_decano IS 'Crea un usuario con rol de decano de la facultad';
COMMENT ON FUNCTION es_decano IS 'Verifica si un usuario tiene el rol de decano';
COMMENT ON FUNCTION obtener_profesores_facultad IS 'Obtiene todos los profesores de la facultad (solo para decanos)';
COMMENT ON VIEW vista_decanos_completa IS 'Vista completa de decanos con todos sus roles y información';

-- =====================================================
-- 6. INSTRUCCIONES DE USO
-- =====================================================

/*
INSTRUCCIONES DE USO:

1. Ejecutar este script en SQL Editor de Supabase:
   - Ve a SQL Editor en Supabase Dashboard
   - Pega este script completo
   - Ejecuta el script

2. Crear un decano usando la función:
   SELECT crear_decano(
     'celopez@udemedellin.edu.co',
     'Password123!',
     'Carlos',
     'López',
     'PROF-CELOPEZ-001'
   );

3. Verificar que el decano fue creado:
   SELECT * FROM vista_decanos_completa;

4. Ver todos los profesores de la facultad (como decano):
   SELECT * FROM obtener_profesores_facultad('ID_DEL_DECANO');

5. Verificar roles del decano:
   SELECT * FROM usuario_roles WHERE usuario_id = 'ID_DEL_DECANO' AND activo = true;
*/




