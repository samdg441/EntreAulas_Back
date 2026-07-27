-- Script para crear tabla de decanos
-- Este script crea la tabla decanos y establece las relaciones necesarias

-- 1. Crear tabla decanos
CREATE TABLE IF NOT EXISTS decanos (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    facultad_id INTEGER REFERENCES facultades(id) ON DELETE SET NULL,
    fecha_nombramiento TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    activo BOOLEAN DEFAULT true,
    observaciones TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Restricciones
    CONSTRAINT decanos_usuario_unique UNIQUE (usuario_id),
    CONSTRAINT decanos_facultad_unique UNIQUE (facultad_id)
);

-- 2. Crear índices para mejor rendimiento
CREATE INDEX IF NOT EXISTS idx_decanos_usuario_id ON decanos(usuario_id);
CREATE INDEX IF NOT EXISTS idx_decanos_facultad_id ON decanos(facultad_id);
CREATE INDEX IF NOT EXISTS idx_decanos_activo ON decanos(activo);

-- 3. Crear tabla facultades si no existe
CREATE TABLE IF NOT EXISTS facultades (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(255) NOT NULL,
    codigo VARCHAR(50) UNIQUE,
    descripcion TEXT,
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Insertar facultad por defecto si no existe
INSERT INTO facultades (nombre, codigo, descripcion) 
VALUES ('Facultad de Ingenierías', 'FI', 'Facultad de Ingenierías de la Universidad de Medellín')
ON CONFLICT (codigo) DO NOTHING;

-- 5. Crear función para obtener decano por usuario
CREATE OR REPLACE FUNCTION obtener_decano_por_usuario(p_usuario_id INTEGER)
RETURNS TABLE (
    id INTEGER,
    usuario_id INTEGER,
    facultad_id INTEGER,
    facultad_nombre VARCHAR(255),
    fecha_nombramiento TIMESTAMP,
    activo BOOLEAN,
    observaciones TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        d.id,
        d.usuario_id,
        d.facultad_id,
        f.nombre as facultad_nombre,
        d.fecha_nombramiento,
        d.activo,
        d.observaciones
    FROM decanos d
    LEFT JOIN facultades f ON d.facultad_id = f.id
    WHERE d.usuario_id = p_usuario_id 
    AND d.activo = true;
END;
$$ LANGUAGE plpgsql;

-- 6. Crear función para obtener decano activo de la facultad
CREATE OR REPLACE FUNCTION obtener_decano_facultad(p_facultad_id INTEGER)
RETURNS TABLE (
    id INTEGER,
    usuario_id INTEGER,
    usuario_nombre VARCHAR(255),
    usuario_apellido VARCHAR(255),
    usuario_email VARCHAR(255),
    facultad_id INTEGER,
    facultad_nombre VARCHAR(255),
    fecha_nombramiento TIMESTAMP,
    activo BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        d.id,
        d.usuario_id,
        u.nombre as usuario_nombre,
        u.apellido as usuario_apellido,
        u.email as usuario_email,
        d.facultad_id,
        f.nombre as facultad_nombre,
        d.fecha_nombramiento,
        d.activo
    FROM decanos d
    JOIN usuarios u ON d.usuario_id = u.id
    LEFT JOIN facultades f ON d.facultad_id = f.id
    WHERE d.facultad_id = p_facultad_id 
    AND d.activo = true
    AND u.activo = true;
END;
$$ LANGUAGE plpgsql;

-- 7. Crear trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_decanos_updated_at 
    BEFORE UPDATE ON decanos 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_facultades_updated_at 
    BEFORE UPDATE ON facultades 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- 8. Insertar datos de ejemplo (opcional)
-- Descomenta las siguientes líneas si quieres insertar datos de ejemplo

/*
-- Insertar decano para celopez@udemedellin.edu.co
INSERT INTO decanos (usuario_id, facultad_id, observaciones)
SELECT 
    u.id,
    f.id,
    'Decano de la Facultad de Ingenierías'
FROM usuarios u, facultades f
WHERE u.email = 'celopez@udemedellin.edu.co'
AND f.codigo = 'FI'
ON CONFLICT (usuario_id) DO NOTHING;
*/

-- 9. Comentarios de la tabla
COMMENT ON TABLE decanos IS 'Tabla que almacena información específica de los decanos';
COMMENT ON COLUMN decanos.usuario_id IS 'Referencia al usuario que es decano';
COMMENT ON COLUMN decanos.facultad_id IS 'Referencia a la facultad que dirige';
COMMENT ON COLUMN decanos.fecha_nombramiento IS 'Fecha en que fue nombrado decano';
COMMENT ON COLUMN decanos.activo IS 'Indica si el decano está activo';
COMMENT ON COLUMN decanos.observaciones IS 'Observaciones adicionales sobre el decano';

COMMENT ON TABLE facultades IS 'Tabla que almacena información de las facultades';
COMMENT ON COLUMN facultades.nombre IS 'Nombre de la facultad';
COMMENT ON COLUMN facultades.codigo IS 'Código único de la facultad';
COMMENT ON COLUMN facultades.descripcion IS 'Descripción de la facultad';

-- 10. Verificar que las tablas se crearon correctamente
SELECT 'Tabla decanos creada exitosamente' as mensaje;
SELECT 'Tabla facultades creada exitosamente' as mensaje;
SELECT 'Funciones creadas exitosamente' as mensaje;




