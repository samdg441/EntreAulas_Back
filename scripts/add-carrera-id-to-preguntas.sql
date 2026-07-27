-- Script para agregar columna id_carrera a la tabla preguntas_evaluacion
-- Este script permite que las preguntas estén asociadas a carreras específicas

-- 1. Agregar la columna id_carrera a la tabla preguntas_evaluacion
ALTER TABLE preguntas_evaluacion 
ADD COLUMN IF NOT EXISTS id_carrera INTEGER;

-- 2. Agregar comentario a la columna para documentación
COMMENT ON COLUMN preguntas_evaluacion.id_carrera IS 'ID de la carrera a la que pertenece la pregunta. NULL para preguntas generales que aplican a todas las carreras.';

-- 3. Crear índice para mejorar el rendimiento de las consultas por carrera
CREATE INDEX IF NOT EXISTS idx_preguntas_evaluacion_carrera_id 
ON preguntas_evaluacion(id_carrera) 
WHERE id_carrera IS NOT NULL;

-- 4. Crear índice compuesto para consultas por carrera y estado activo
CREATE INDEX IF NOT EXISTS idx_preguntas_evaluacion_carrera_activa 
ON preguntas_evaluacion(id_carrera, activa) 
WHERE activa = true;

-- 5. Agregar constraint de foreign key si existe la tabla carreras
-- (Comentado por si no existe la tabla carreras aún)
-- ALTER TABLE preguntas_evaluacion 
-- ADD CONSTRAINT fk_preguntas_evaluacion_carrera 
-- FOREIGN KEY (id_carrera) REFERENCES carreras(id);

-- 6. Crear función para obtener preguntas por carrera
CREATE OR REPLACE FUNCTION obtener_preguntas_por_carrera(carrera_id_param INTEGER DEFAULT NULL)
RETURNS TABLE (
    id INTEGER,
    categoria_id INTEGER,
    texto_pregunta TEXT,
    descripcion TEXT,
    tipo_pregunta TEXT,
    opciones JSONB,
    obligatoria BOOLEAN,
    orden INTEGER,
    activa BOOLEAN,
    id_carrera INTEGER,
    categoria_nombre TEXT
) AS $$
BEGIN
    -- Si se especifica una carrera, obtener preguntas específicas de esa carrera
    IF carrera_id_param IS NOT NULL THEN
        RETURN QUERY
        SELECT 
            pe.id,
            pe.categoria_id,
            pe.texto_pregunta,
            pe.descripcion,
            pe.tipo_pregunta,
            pe.opciones,
            pe.obligatoria,
            pe.orden,
            pe.activa,
            pe.id_carrera,
            cp.nombre as categoria_nombre
        FROM preguntas_evaluacion pe
        LEFT JOIN categorias_pregunta cp ON pe.categoria_id = cp.id
        WHERE pe.activa = true 
        AND pe.id_carrera = carrera_id_param
        ORDER BY pe.orden ASC;
        
        -- Si no hay preguntas específicas para la carrera, obtener preguntas generales
        IF NOT FOUND THEN
            RETURN QUERY
            SELECT 
                pe.id,
                pe.categoria_id,
                pe.texto_pregunta,
                pe.descripcion,
                pe.tipo_pregunta,
                pe.opciones,
                pe.obligatoria,
                pe.orden,
                pe.activa,
                pe.id_carrera,
                cp.nombre as categoria_nombre
            FROM preguntas_evaluacion pe
            LEFT JOIN categorias_pregunta cp ON pe.categoria_id = cp.id
            WHERE pe.activa = true 
            AND pe.id_carrera IS NULL
            ORDER BY pe.orden ASC;
        END IF;
    ELSE
        -- Si no se especifica carrera, obtener todas las preguntas activas
        RETURN QUERY
        SELECT 
            pe.id,
            pe.categoria_id,
            pe.texto_pregunta,
            pe.descripcion,
            pe.tipo_pregunta,
            pe.opciones,
            pe.obligatoria,
            pe.orden,
            pe.activa,
            pe.id_carrera,
            cp.nombre as categoria_nombre
        FROM preguntas_evaluacion pe
        LEFT JOIN categorias_pregunta cp ON pe.categoria_id = cp.id
        WHERE pe.activa = true
        ORDER BY pe.orden ASC;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- 7. Crear vista para facilitar consultas de preguntas con información de carrera
CREATE OR REPLACE VIEW vista_preguntas_evaluacion_completa AS
SELECT 
    pe.id,
    pe.categoria_id,
    pe.texto_pregunta,
    pe.descripcion,
    pe.tipo_pregunta,
    pe.opciones,
    pe.obligatoria,
    pe.orden,
    pe.activa,
    pe.id_carrera,
    cp.nombre as categoria_nombre,
    cp.descripcion as categoria_descripcion,
    cp.orden as categoria_orden,
    CASE 
        WHEN pe.id_carrera IS NULL THEN 'General'
        ELSE 'Específica'
    END as tipo_pregunta_carrera
FROM preguntas_evaluacion pe
LEFT JOIN categorias_pregunta cp ON pe.categoria_id = cp.id
WHERE pe.activa = true
ORDER BY pe.orden ASC;

-- 8. Comentarios de documentación
COMMENT ON FUNCTION obtener_preguntas_por_carrera(INTEGER) IS 'Función para obtener preguntas de evaluación filtradas por carrera. Si no hay preguntas específicas para la carrera, retorna preguntas generales.';
COMMENT ON VIEW vista_preguntas_evaluacion_completa IS 'Vista que muestra todas las preguntas de evaluación activas con información completa de categorías y tipo de pregunta (general o específica por carrera).';

-- 9. Ejemplo de uso de la función
-- SELECT * FROM obtener_preguntas_por_carrera(1); -- Preguntas para carrera ID 1
-- SELECT * FROM obtener_preguntas_por_carrera(); -- Todas las preguntas activas

-- 10. Verificar la estructura actualizada
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'preguntas_evaluacion' 
ORDER BY ordinal_position;
