-- Script de prueba para la funcionalidad de preguntas por carrera
-- Este script demuestra cómo usar la nueva funcionalidad

-- 1. Verificar que la columna id_carrera existe
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'preguntas_evaluacion' 
AND column_name = 'id_carrera';

-- 2. Ver preguntas existentes (deberían tener id_carrera = NULL por defecto)
SELECT 
    id,
    texto_pregunta,
    tipo_pregunta,
    orden,
    id_carrera,
    activa
FROM preguntas_evaluacion 
WHERE activa = true
ORDER BY orden
LIMIT 5;

-- 3. Crear algunas preguntas específicas para diferentes carreras
-- (Ejemplo: Ingeniería de Sistemas = 1, Ingeniería Civil = 2)

-- Pregunta específica para Ingeniería de Sistemas
INSERT INTO preguntas_evaluacion (
    categoria_id,
    texto_pregunta,
    descripcion,
    tipo_pregunta,
    opciones,
    obligatoria,
    orden,
    activa,
    id_carrera
) VALUES (
    1, -- categoria_id (ajustar según tu estructura)
    '¿El profesor utiliza herramientas tecnológicas apropiadas para la enseñanza?',
    'Pregunta específica para evaluar el uso de tecnología en Ingeniería de Sistemas',
    'rating',
    '{"min": 1, "max": 5, "labels": ["Muy malo", "Malo", "Regular", "Bueno", "Excelente"]}',
    true,
    100, -- orden alto para que aparezca al final
    true,
    1 -- id_carrera para Ingeniería de Sistemas
);

-- Pregunta específica para Ingeniería Civil
INSERT INTO preguntas_evaluacion (
    categoria_id,
    texto_pregunta,
    descripcion,
    tipo_pregunta,
    opciones,
    obligatoria,
    orden,
    activa,
    id_carrera
) VALUES (
    1, -- categoria_id (ajustar según tu estructura)
    '¿El profesor relaciona los conceptos teóricos con aplicaciones prácticas en construcción?',
    'Pregunta específica para evaluar la aplicación práctica en Ingeniería Civil',
    'rating',
    '{"min": 1, "max": 5, "labels": ["Muy malo", "Malo", "Regular", "Bueno", "Excelente"]}',
    true,
    101, -- orden alto para que aparezca al final
    true,
    2 -- id_carrera para Ingeniería Civil
);

-- 4. Probar la función obtener_preguntas_por_carrera

-- Obtener preguntas para Ingeniería de Sistemas (ID: 1)
SELECT 'Preguntas para Ingeniería de Sistemas (ID: 1)' as descripcion;
SELECT * FROM obtener_preguntas_por_carrera(1);

-- Obtener preguntas para Ingeniería Civil (ID: 2)
SELECT 'Preguntas para Ingeniería Civil (ID: 2)' as descripcion;
SELECT * FROM obtener_preguntas_por_carrera(2);

-- Obtener preguntas para una carrera que no tiene preguntas específicas (ID: 3)
SELECT 'Preguntas para carrera sin preguntas específicas (ID: 3) - debería mostrar preguntas generales' as descripcion;
SELECT * FROM obtener_preguntas_por_carrera(3);

-- Obtener todas las preguntas activas
SELECT 'Todas las preguntas activas' as descripcion;
SELECT * FROM obtener_preguntas_por_carrera();

-- 5. Probar la vista
SELECT 'Vista completa de preguntas' as descripcion;
SELECT 
    id,
    texto_pregunta,
    tipo_pregunta_carrera,
    categoria_nombre,
    id_carrera
FROM vista_preguntas_evaluacion_completa
ORDER BY id_carrera NULLS LAST, orden;

-- 6. Verificar índices creados
SELECT 
    indexname,
    indexdef
FROM pg_indexes 
WHERE tablename = 'preguntas_evaluacion'
AND indexname LIKE '%carrera%';

-- 7. Estadísticas de preguntas por carrera
SELECT 
    CASE 
        WHEN id_carrera IS NULL THEN 'General (todas las carreras)'
        ELSE 'Carrera ID: ' || id_carrera::text
    END as tipo_pregunta,
    COUNT(*) as total_preguntas,
    COUNT(CASE WHEN activa = true THEN 1 END) as preguntas_activas
FROM preguntas_evaluacion
GROUP BY id_carrera
ORDER BY id_carrera NULLS FIRST;

-- 8. Limpiar datos de prueba (opcional - descomenta si quieres eliminar las preguntas de prueba)
/*
DELETE FROM preguntas_evaluacion 
WHERE texto_pregunta LIKE '%herramientas tecnológicas%' 
   OR texto_pregunta LIKE '%aplicaciones prácticas en construcción%';
*/

-- 9. Verificar que el sistema funciona correctamente
SELECT 
    'Verificación final' as test,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'preguntas_evaluacion' AND column_name = 'id_carrera')
        THEN '✅ Columna id_carrera existe'
        ELSE '❌ Columna id_carrera NO existe'
    END as columna_existe,
    CASE 
        WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'obtener_preguntas_por_carrera')
        THEN '✅ Función obtener_preguntas_por_carrera existe'
        ELSE '❌ Función obtener_preguntas_por_carrera NO existe'
    END as funcion_existe,
    CASE 
        WHEN EXISTS (SELECT 1 FROM pg_views WHERE viewname = 'vista_preguntas_evaluacion_completa')
        THEN '✅ Vista vista_preguntas_evaluacion_completa existe'
        ELSE '❌ Vista vista_preguntas_evaluacion_completa NO existe'
    END as vista_existe;
