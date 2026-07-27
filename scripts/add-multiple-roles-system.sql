-- =====================================================
-- SISTEMA DE ROLES MÚLTIPLES PARA COORDINADORES-PROFESORES
-- =====================================================
-- Este script implementa un sistema donde los coordinadores
-- pueden ser también profesores al mismo tiempo.

-- =====================================================
-- 1. CREAR TABLA DE ROLES DE USUARIO
-- =====================================================

-- Crear tabla para manejar múltiples roles por usuario
CREATE TABLE IF NOT EXISTS usuario_roles (
  id SERIAL PRIMARY KEY,
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  rol VARCHAR(50) NOT NULL,
  activo BOOLEAN DEFAULT true,
  fecha_asignacion TIMESTAMP DEFAULT NOW(),
  UNIQUE(usuario_id, rol)
);

-- Crear índices para mejor rendimiento
CREATE INDEX IF NOT EXISTS idx_usuario_roles_usuario_id ON usuario_roles(usuario_id);
CREATE INDEX IF NOT EXISTS idx_usuario_roles_rol ON usuario_roles(rol);
CREATE INDEX IF NOT EXISTS idx_usuario_roles_activo ON usuario_roles(activo);

-- =====================================================
-- 2. CREAR TABLA DE COORDINADORES
-- =====================================================

-- Crear tabla específica para coordinadores
CREATE TABLE IF NOT EXISTS coordinadores (
  id SERIAL PRIMARY KEY,
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  carrera_id INTEGER REFERENCES carreras(id),
  departamento VARCHAR(100),
  fecha_nombramiento DATE,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(usuario_id)
);

-- Crear índices
CREATE INDEX IF NOT EXISTS idx_coordinadores_usuario_id ON coordinadores(usuario_id);
CREATE INDEX IF NOT EXISTS idx_coordinadores_carrera_id ON coordinadores(carrera_id);
CREATE INDEX IF NOT EXISTS idx_coordinadores_activo ON coordinadores(activo);

-- =====================================================
-- 3. FUNCIONES PARA MANEJAR ROLES MÚLTIPLES
-- =====================================================

-- Función para asignar un rol a un usuario
CREATE OR REPLACE FUNCTION asignar_rol_usuario(
  p_usuario_id UUID,
  p_rol VARCHAR(50)
) RETURNS BOOLEAN AS $$
BEGIN
  -- Insertar el rol si no existe
  INSERT INTO usuario_roles (usuario_id, rol, activo)
  VALUES (p_usuario_id, p_rol, true)
  ON CONFLICT (usuario_id, rol) 
  DO UPDATE SET activo = true, fecha_asignacion = NOW();
  
  RETURN TRUE;
EXCEPTION
  WHEN OTHERS THEN
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- Función para remover un rol de un usuario
CREATE OR REPLACE FUNCTION remover_rol_usuario(
  p_usuario_id UUID,
  p_rol VARCHAR(50)
) RETURNS BOOLEAN AS $$
BEGIN
  UPDATE usuario_roles 
  SET activo = false 
  WHERE usuario_id = p_usuario_id AND rol = p_rol;
  
  RETURN TRUE;
EXCEPTION
  WHEN OTHERS THEN
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- Función para obtener todos los roles activos de un usuario
CREATE OR REPLACE FUNCTION obtener_roles_usuario(p_usuario_id UUID)
RETURNS TABLE(rol VARCHAR(50)) AS $$
BEGIN
  RETURN QUERY
  SELECT ur.rol
  FROM usuario_roles ur
  WHERE ur.usuario_id = p_usuario_id AND ur.activo = true
  ORDER BY ur.rol;
END;
$$ LANGUAGE plpgsql;

-- Función para verificar si un usuario tiene un rol específico
CREATE OR REPLACE FUNCTION usuario_tiene_rol(
  p_usuario_id UUID,
  p_rol VARCHAR(50)
) RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS(
    SELECT 1 
    FROM usuario_roles 
    WHERE usuario_id = p_usuario_id 
    AND rol = p_rol 
    AND activo = true
  );
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 4. TRIGGERS PARA MIGRACIÓN AUTOMÁTICA
-- =====================================================

-- Función para migrar roles existentes
CREATE OR REPLACE FUNCTION migrar_roles_existentes()
RETURNS VOID AS $$
DECLARE
  usuario_record RECORD;
BEGIN
  -- Migrar usuarios existentes a la nueva tabla de roles
  FOR usuario_record IN 
    SELECT id, tipo_usuario 
    FROM usuarios 
    WHERE tipo_usuario IS NOT NULL
  LOOP
    -- Asignar el rol basado en tipo_usuario
    PERFORM asignar_rol_usuario(usuario_record.id, usuario_record.tipo_usuario);
    
    -- Si es coordinador, crear registro en tabla coordinadores
    IF usuario_record.tipo_usuario = 'coordinador' THEN
      INSERT INTO coordinadores (usuario_id, activo)
      VALUES (usuario_record.id, true)
      ON CONFLICT (usuario_id) DO NOTHING;
    END IF;
  END LOOP;
  
  RAISE NOTICE 'Migración de roles completada';
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 5. FUNCIONES PARA COORDINADORES-PROFESORES
-- =====================================================

-- Función para crear un coordinador que también es profesor
CREATE OR REPLACE FUNCTION crear_coordinador_profesor(
  p_email VARCHAR(255),
  p_password VARCHAR(255),
  p_nombre VARCHAR(100),
  p_apellido VARCHAR(100),
  p_codigo_profesor VARCHAR(50),
  p_carrera_id INTEGER,
  p_departamento VARCHAR(100)
) RETURNS UUID AS $$
DECLARE
  nuevo_usuario_id UUID;
BEGIN
  -- Crear usuario
  INSERT INTO usuarios (email, password, nombre, apellido, tipo_usuario, activo)
  VALUES (p_email, p_password, p_nombre, p_apellido, 'profesor', true)
  RETURNING id INTO nuevo_usuario_id;
  
  -- Asignar rol de profesor
  PERFORM asignar_rol_usuario(nuevo_usuario_id, 'profesor');
  
  -- Asignar rol de coordinador
  PERFORM asignar_rol_usuario(nuevo_usuario_id, 'coordinador');
  
  -- Crear registro en profesores (se hace automáticamente por trigger)
  -- El trigger ya crea el registro en profesores cuando se inserta un usuario con tipo_usuario = 'profesor'
  
  -- Crear registro en coordinadores
  INSERT INTO coordinadores (usuario_id, carrera_id, departamento, activo)
  VALUES (nuevo_usuario_id, p_carrera_id, p_departamento, true);
  
  RETURN nuevo_usuario_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 6. VISTAS ÚTILES
-- =====================================================

-- Vista para obtener usuarios con sus roles
CREATE OR REPLACE VIEW vista_usuarios_roles AS
SELECT 
  u.id,
  u.email,
  u.nombre,
  u.apellido,
  u.tipo_usuario as tipo_principal,
  u.activo,
  ARRAY_AGG(ur.rol ORDER BY ur.rol) as roles_activos,
  COUNT(ur.rol) as total_roles
FROM usuarios u
LEFT JOIN usuario_roles ur ON u.id = ur.usuario_id AND ur.activo = true
GROUP BY u.id, u.email, u.nombre, u.apellido, u.tipo_usuario, u.activo;

-- Vista para coordinadores con información completa
CREATE OR REPLACE VIEW vista_coordinadores_completa AS
SELECT 
  u.id,
  u.email,
  u.nombre,
  u.apellido,
  c.carrera_id,
  car.nombre as carrera_nombre,
  c.departamento,
  c.fecha_nombramiento,
  c.activo as coordinador_activo,
  p.id as profesor_id,
  p.activo as profesor_activo
FROM usuarios u
JOIN coordinadores c ON u.id = c.usuario_id
LEFT JOIN carreras car ON c.carrera_id = car.id
LEFT JOIN profesores p ON u.id = p.usuario_id
WHERE c.activo = true;

-- =====================================================
-- 7. EJECUTAR MIGRACIÓN
-- =====================================================

-- Ejecutar migración de roles existentes
SELECT migrar_roles_existentes();

-- =====================================================
-- 8. EJEMPLOS DE USO
-- =====================================================

-- Ejemplo 1: Crear un coordinador que también es profesor
-- SELECT crear_coordinador_profesor(
--   'coordinador.ingenieria@udem.edu.co',
--   'Password123!',
--   'María',
--   'González',
--   'PROF001',
--   1, -- ID de la carrera
--   'Ingeniería de Sistemas'
-- );

-- Ejemplo 2: Asignar rol adicional a un usuario existente
-- SELECT asignar_rol_usuario(1, 'coordinador');

-- Ejemplo 3: Ver todos los roles de un usuario
-- SELECT * FROM obtener_roles_usuario(1);

-- Ejemplo 4: Verificar si un usuario tiene un rol específico
-- SELECT usuario_tiene_rol(1, 'profesor');

-- Ejemplo 5: Ver todos los coordinadores
-- SELECT * FROM vista_coordinadores_completa;

-- =====================================================
-- 9. CONSULTAS DE VERIFICACIÓN
-- =====================================================

-- Ver estructura de la nueva tabla
-- \d usuario_roles

-- Ver todos los roles asignados
-- SELECT * FROM usuario_roles WHERE activo = true;

-- Ver usuarios con múltiples roles
-- SELECT * FROM vista_usuarios_roles WHERE total_roles > 1;

-- =====================================================
-- NOTAS IMPORTANTES
-- =====================================================
-- 
-- 1. Este sistema permite que un usuario tenga múltiples roles
-- 2. Los coordinadores pueden ser también profesores
-- 3. Se mantiene compatibilidad con el sistema actual
-- 4. Las funciones facilitan la gestión de roles
-- 5. Las vistas proporcionan información consolidada
-- 
-- =====================================================


