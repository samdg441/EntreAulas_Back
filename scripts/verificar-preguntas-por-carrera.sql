-- Script de verificación para comprobar que las preguntas por carrera se insertaron correctamente
-- Este script verifica la integridad y completitud de las preguntas insertadas

-- =====================================================
-- VERIFICACIÓN 1: ESTRUCTURA DE LA TABLA
-- =====================================================

SELECT 
    'Verificación de estructura de tabla' as verificacion,
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'preguntas_evaluacion' 
            AND column_name = 'id_carrera'
        ) THEN '✅ Columna id_carrera existe'
        ELSE '❌ Columna id_carrera NO existe'
    END as columna_id_carrera,
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'preguntas_evaluacion' 
            AND column_name = 'activa'
        ) THEN '✅ Columna activa existe'
        ELSE '❌ Columna activa NO existe'
    END as columna_activa;

-- =====================================================
-- VERIFICACIÓN 2: CATEGORÍAS DE PREGUNTAS
-- =====================================================

SELECT 
    'Verificación de categorías' as verificacion,
    COUNT(*) as total_categorias,
    COUNT(CASE WHEN activa = true THEN 1 END) as categorias_activas
FROM categorias_pregunta;

-- Listar todas las categorías
SELECT 
    id,
    nombre,
    descripcion,
    orden,
    activa
FROM categorias_pregunta
ORDER BY orden;

-- =====================================================
-- VERIFICACIÓN 3: ESTADO GENERAL DE PREGUNTAS
-- =====================================================

SELECT 
    'Estado general de preguntas' as verificacion,
    COUNT(*) as total_preguntas,
    COUNT(CASE WHEN activa = true THEN 1 END) as preguntas_activas,
    COUNT(CASE WHEN activa = false THEN 1 END) as preguntas_desactivadas,
    COUNT(CASE WHEN id_carrera IS NULL THEN 1 END) as preguntas_generales,
    COUNT(CASE WHEN id_carrera IS NOT NULL THEN 1 END) as preguntas_especificas
FROM preguntas_evaluacion;

-- =====================================================
-- VERIFICACIÓN 4: PREGUNTAS POR CARRERA
-- =====================================================

SELECT 
    'Preguntas por carrera' as verificacion,
    CASE 
        WHEN id_carrera IS NULL THEN 'Tronco Común'
        ELSE 'Carrera ID: ' || id_carrera::text
    END as carrera,
    COUNT(*) as total_preguntas,
    COUNT(CASE WHEN activa = true THEN 1 END) as preguntas_activas,
    COUNT(CASE WHEN activa = false THEN 1 END) as preguntas_desactivadas
FROM preguntas_evaluacion
GROUP BY id_carrera
ORDER BY id_carrera NULLS FIRST;

-- =====================================================
-- VERIFICACIÓN 5: PREGUNTAS POR CATEGORÍA
-- =====================================================

SELECT 
    'Preguntas por categoría' as verificacion,
    cp.nombre as categoria,
    COUNT(pe.id) as total_preguntas,
    COUNT(CASE WHEN pe.activa = true THEN 1 END) as preguntas_activas,
    COUNT(CASE WHEN pe.id_carrera IS NULL THEN 1 END) as preguntas_generales,
    COUNT(CASE WHEN pe.id_carrera IS NOT NULL THEN 1 END) as preguntas_especificas
FROM categorias_pregunta cp
LEFT JOIN preguntas_evaluacion pe ON cp.id = pe.categoria_id
GROUP BY cp.id, cp.nombre, cp.orden
ORDER BY cp.orden;

-- =====================================================
-- VERIFICACIÓN 6: TIPOS DE PREGUNTA
-- =====================================================

SELECT 
    'Tipos de pregunta' as verificacion,
    tipo_pregunta,
    COUNT(*) as total_preguntas,
    COUNT(CASE WHEN activa = true THEN 1 END) as preguntas_activas
FROM preguntas_evaluacion
GROUP BY tipo_pregunta
ORDER BY tipo_pregunta;

-- =====================================================
-- VERIFICACIÓN 7: MUESTRA DE PREGUNTAS POR CARRERA
-- =====================================================

-- Muestra de preguntas para Ingeniería de Sistemas (ID: 1)
SELECT 
    'Muestra - Ingeniería de Sistemas' as carrera,
    pe.orden,
    pe.texto_pregunta,
    cp.nombre as categoria,
    pe.tipo_pregunta,
    pe.activa
FROM preguntas_evaluacion pe
JOIN categorias_pregunta cp ON pe.categoria_id = cp.id
WHERE pe.id_carrera = 1 AND pe.activa = true
ORDER BY pe.orden
LIMIT 3;

-- Muestra de preguntas para Ingeniería Civil (ID: 2)
SELECT 
    'Muestra - Ingeniería Civil' as carrera,
    pe.orden,
    pe.texto_pregunta,
    cp.nombre as categoria,
    pe.tipo_pregunta,
    pe.activa
FROM preguntas_evaluacion pe
JOIN categorias_pregunta cp ON pe.categoria_id = cp.id
WHERE pe.id_carrera = 2 AND pe.activa = true
ORDER BY pe.orden
LIMIT 3;

-- Muestra de preguntas para Tronco Común (ID: NULL)
SELECT 
    'Muestra - Tronco Común' as carrera,
    pe.orden,
    pe.texto_pregunta,
    cp.nombre as categoria,
    pe.tipo_pregunta,
    pe.activa
FROM preguntas_evaluacion pe
JOIN categorias_pregunta cp ON pe.categoria_id = cp.id
WHERE pe.id_carrera IS NULL AND pe.activa = true
ORDER BY pe.orden
LIMIT 3;

-- =====================================================
-- VERIFICACIÓN 8: OPCIONES DE PREGUNTAS
-- =====================================================

-- Verificar que las preguntas de tipo 'rating' tienen opciones
SELECT 
    'Verificación de opciones' as verificacion,
    tipo_pregunta,
    COUNT(*) as total_preguntas,
    COUNT(CASE WHEN opciones IS NOT NULL THEN 1 END) as con_opciones,
    COUNT(CASE WHEN opciones IS NULL THEN 1 END) as sin_opciones
FROM preguntas_evaluacion
WHERE activa = true
GROUP BY tipo_pregunta
ORDER BY tipo_pregunta;

-- Muestra de opciones para preguntas de rating
SELECT 
    'Muestra de opciones' as tipo,
    pe.tipo_pregunta,
    pe.opciones
FROM preguntas_evaluacion pe
WHERE pe.activa = true 
AND pe.tipo_pregunta = 'rating' 
AND pe.opciones IS NOT NULL
LIMIT 3;

-- =====================================================
-- VERIFICACIÓN 9: FUNCIONES Y VISTAS
-- =====================================================

-- Verificar que las funciones existen
SELECT 
    'Verificación de funciones' as verificacion,
    CASE 
        WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'obtener_preguntas_por_carrera')
        THEN '✅ Función obtener_preguntas_por_carrera existe'
        ELSE '❌ Función obtener_preguntas_por_carrera NO existe'
    END as funcion_obtener_preguntas;

-- Verificar que la vista existe
SELECT 
    'Verificación de vistas' as verificacion,
    CASE 
        WHEN EXISTS (SELECT 1 FROM pg_views WHERE viewname = 'vista_preguntas_evaluacion_completa')
        THEN '✅ Vista vista_preguntas_evaluacion_completa existe'
        ELSE '❌ Vista vista_preguntas_evaluacion_completa NO existe'
    END as vista_preguntas;

-- =====================================================
-- VERIFICACIÓN 10: PRUEBA DE FUNCIONES
-- =====================================================

-- Probar la función obtener_preguntas_por_carrera
SELECT 
    'Prueba de función - Ingeniería de Sistemas' as prueba,
    COUNT(*) as preguntas_obtenidas
FROM obtener_preguntas_por_carrera(1);

SELECT 
    'Prueba de función - Tronco Común' as prueba,
    COUNT(*) as preguntas_obtenidas
FROM obtener_preguntas_por_carrera();

-- =====================================================
-- VERIFICACIÓN 11: ÍNDICES
-- =====================================================

-- Verificar que los índices existen
SELECT 
    'Verificación de índices' as verificacion,
    indexname,
    indexdef
FROM pg_indexes 
WHERE tablename = 'preguntas_evaluacion'
AND (indexname LIKE '%carrera%' OR indexname LIKE '%activa%')
ORDER BY indexname;

-- =====================================================
-- VERIFICACIÓN 12: INTEGRIDAD DE DATOS
-- =====================================================

-- Verificar que no hay preguntas huérfanas (sin categoría)
SELECT 
    'Verificación de integridad' as verificacion,
    CASE 
        WHEN COUNT(*) = 0 THEN '✅ No hay preguntas huérfanas'
        ELSE '❌ Hay ' || COUNT(*) || ' preguntas sin categoría'
    END as preguntas_huerfanas
FROM preguntas_evaluacion pe
LEFT JOIN categorias_pregunta cp ON pe.categoria_id = cp.id
WHERE cp.id IS NULL;

-- Verificar que todas las preguntas activas tienen orden
SELECT 
    'Verificación de orden' as verificacion,
    CASE 
        WHEN COUNT(*) = 0 THEN '✅ Todas las preguntas activas tienen orden'
        ELSE '❌ Hay ' || COUNT(*) || ' preguntas activas sin orden'
    END as preguntas_sin_orden
FROM preguntas_evaluacion
WHERE activa = true AND (orden IS NULL OR orden = 0);

-- =====================================================
-- RESUMEN FINAL
-- =====================================================

SELECT 
    '📊 RESUMEN FINAL' as titulo,
    'Verificación completada' as estado,
    'Todas las verificaciones han sido ejecutadas' as resultado;

-- Estadísticas finales
SELECT 
    'Estadísticas finales' as tipo,
    'Total de preguntas activas' as metrica,
    COUNT(*) as valor
FROM preguntas_evaluacion 
WHERE activa = true

UNION ALL

SELECT 
    'Estadísticas finales' as tipo,
    'Preguntas específicas por carrera' as metrica,
    COUNT(*) as valor
FROM preguntas_evaluacion 
WHERE activa = true AND id_carrera IS NOT NULL

UNION ALL

SELECT 
    'Estadísticas finales' as tipo,
    'Preguntas generales (tronco común)' as metrica,
    COUNT(*) as valor
FROM preguntas_evaluacion 
WHERE activa = true AND id_carrera IS NULL

UNION ALL

SELECT 
    'Estadísticas finales' as tipo,
    'Carreras con preguntas específicas' as metrica,
    COUNT(DISTINCT id_carrera) as valor
FROM preguntas_evaluacion 
WHERE activa = true AND id_carrera IS NOT NULL;
