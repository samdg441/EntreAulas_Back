-- =====================================================
-- SCRIPT PARA INSERTAR DATOS DE PRUEBA DE EVALUACIONES
-- =====================================================
-- Este script inserta datos de prueba para que el dashboard del profesor
-- muestre información en lugar de estar vacío

BEGIN;

-- =====================================================
-- 1. VERIFICAR QUE EXISTEN PROFESORES Y ESTUDIANTES
-- =====================================================

-- Verificar profesores existentes
SELECT 
    'Profesores disponibles' as info,
    COUNT(*) as total,
    STRING_AGG(nombre || ' ' || apellido, ', ') as nombres
FROM profesores p
JOIN usuarios u ON p.usuario_id = u.id
WHERE p.activo = true;

-- Verificar estudiantes existentes
SELECT 
    'Estudiantes disponibles' as info,
    COUNT(*) as total
FROM estudiantes e
JOIN usuarios u ON e.usuario_id = u.id
WHERE e.activo = true;

-- Verificar cursos existentes
SELECT 
    'Cursos disponibles' as info,
    COUNT(*) as total,
    STRING_AGG(nombre, ', ') as nombres
FROM cursos
WHERE activo = true;

-- =====================================================
-- 2. INSERTAR EVALUACIONES DE PRUEBA
-- =====================================================

-- Obtener IDs de profesores, estudiantes y cursos para las evaluaciones
WITH datos_base AS (
    SELECT 
        p.id as profesor_id,
        e.id as estudiante_id,
        c.id as curso_id,
        g.id as grupo_id,
        ROW_NUMBER() OVER (ORDER BY p.id, e.id, c.id) as rn
    FROM profesores p
    CROSS JOIN estudiantes e
    CROSS JOIN cursos c
    CROSS JOIN grupos g
    WHERE p.activo = true 
    AND e.activo = true 
    AND c.activo = true
    AND g.activo = true
    LIMIT 50 -- Limitar a 50 evaluaciones de prueba
),
evaluaciones_prueba AS (
    SELECT 
        profesor_id,
        estudiante_id,
        curso_id,
        grupo_id,
        -- Generar calificaciones aleatorias entre 3.0 y 5.0
        (3.0 + (RANDOM() * 2.0))::DECIMAL(3,2) as calificacion_general,
        -- Fechas aleatorias en el período 2025-2 (julio-diciembre 2025)
        ('2025-07-01'::DATE + (RANDOM() * INTERVAL '180 days'))::DATE as fecha_evaluacion,
        -- Comentarios de prueba
        CASE 
            WHEN RANDOM() < 0.3 THEN 'Excelente profesor, muy claro en sus explicaciones'
            WHEN RANDOM() < 0.6 THEN 'Buen profesor, aunque podría mejorar la metodología'
            WHEN RANDOM() < 0.8 THEN 'Profesor competente, cumple con los objetivos del curso'
            ELSE 'Profesor con buen dominio del tema, recomendado'
        END as comentarios
    FROM datos_base
)
INSERT INTO evaluaciones (
    profesor_id,
    estudiante_id,
    curso_id,
    grupo_id,
    periodo_id,
    calificacion_general,
    fecha_evaluacion,
    comentarios,
    completada,
    fecha_completada
)
SELECT 
    profesor_id,
    estudiante_id,
    curso_id,
    grupo_id,
    1 as periodo_id, -- Período 2025-2
    calificacion_general,
    fecha_evaluacion,
    comentarios,
    true as completada,
    fecha_evaluacion as fecha_completada
FROM evaluaciones_prueba;

-- =====================================================
-- 3. INSERTAR EVALUACIONES HISTÓRICAS (PERÍODOS ANTERIORES)
-- =====================================================

-- Crear evaluaciones para períodos anteriores (2025-1, 2024-2, etc.)
WITH datos_historicos AS (
    SELECT 
        p.id as profesor_id,
        e.id as estudiante_id,
        c.id as curso_id,
        g.id as grupo_id,
        -- Períodos históricos
        CASE 
            WHEN RANDOM() < 0.2 THEN '2025-1'
            WHEN RANDOM() < 0.4 THEN '2024-2'
            WHEN RANDOM() < 0.6 THEN '2024-1'
            WHEN RANDOM() < 0.8 THEN '2023-2'
            ELSE '2023-1'
        END as periodo
    FROM profesores p
    CROSS JOIN estudiantes e
    CROSS JOIN cursos c
    CROSS JOIN grupos g
    WHERE p.activo = true 
    AND e.activo = true 
    AND c.activo = true
    AND g.activo = true
    LIMIT 30 -- 30 evaluaciones históricas
)
INSERT INTO evaluaciones (
    profesor_id,
    estudiante_id,
    curso_id,
    grupo_id,
    periodo_id,
    calificacion_general,
    fecha_evaluacion,
    comentarios,
    completada,
    fecha_completada
)
SELECT 
    profesor_id,
    estudiante_id,
    curso_id,
    grupo_id,
    CASE periodo
        WHEN '2025-1' THEN 2
        WHEN '2024-2' THEN 3
        WHEN '2024-1' THEN 4
        WHEN '2023-2' THEN 5
        WHEN '2023-1' THEN 6
        ELSE 1
    END as periodo_id,
    -- Calificaciones ligeramente diferentes para mostrar tendencia
    (3.2 + (RANDOM() * 1.8))::DECIMAL(3,2) as calificacion_general,
    CASE periodo
        WHEN '2025-1' THEN ('2025-01-01'::DATE + (RANDOM() * INTERVAL '180 days'))::DATE
        WHEN '2024-2' THEN ('2024-07-01'::DATE + (RANDOM() * INTERVAL '180 days'))::DATE
        WHEN '2024-1' THEN ('2024-01-01'::DATE + (RANDOM() * INTERVAL '180 days'))::DATE
        WHEN '2023-2' THEN ('2023-07-01'::DATE + (RANDOM() * INTERVAL '180 days'))::DATE
        WHEN '2023-1' THEN ('2023-01-01'::DATE + (RANDOM() * INTERVAL '180 days'))::DATE
        ELSE CURRENT_DATE
    END as fecha_evaluacion,
    'Evaluación histórica de prueba' as comentarios,
    true as completada,
    CASE periodo
        WHEN '2025-1' THEN ('2025-01-01'::DATE + (RANDOM() * INTERVAL '180 days'))::DATE
        WHEN '2024-2' THEN ('2024-07-01'::DATE + (RANDOM() * INTERVAL '180 days'))::DATE
        WHEN '2024-1' THEN ('2024-01-01'::DATE + (RANDOM() * INTERVAL '180 days'))::DATE
        WHEN '2023-2' THEN ('2023-07-01'::DATE + (RANDOM() * INTERVAL '180 days'))::DATE
        WHEN '2023-1' THEN ('2023-01-01'::DATE + (RANDOM() * INTERVAL '180 days'))::DATE
        ELSE CURRENT_DATE
    END as fecha_completada
FROM datos_historicos;

-- =====================================================
-- 4. VERIFICAR RESULTADOS
-- =====================================================

-- Verificar evaluaciones insertadas
SELECT 
    'Evaluaciones de prueba insertadas' as info,
    COUNT(*) as total_evaluaciones,
    ROUND(AVG(calificacion_general), 2) as promedio_calificacion,
    MIN(fecha_evaluacion) as fecha_mas_antigua,
    MAX(fecha_evaluacion) as fecha_mas_reciente
FROM evaluaciones
WHERE comentarios LIKE '%prueba%' OR comentarios LIKE '%Excelente profesor%';

-- Verificar evaluaciones por período
SELECT 
    periodo_id,
    COUNT(*) as total_evaluaciones,
    ROUND(AVG(calificacion_general), 2) as promedio_calificacion
FROM evaluaciones
GROUP BY periodo_id
ORDER BY periodo_id;

-- Verificar evaluaciones por profesor
SELECT 
    u.nombre || ' ' || u.apellido as profesor,
    COUNT(e.id) as total_evaluaciones,
    ROUND(AVG(e.calificacion_general), 2) as promedio_calificacion
FROM evaluaciones e
JOIN profesores p ON e.profesor_id = p.id
JOIN usuarios u ON p.usuario_id = u.id
GROUP BY u.nombre, u.apellido, p.id
ORDER BY promedio_calificacion DESC;

COMMIT;

-- =====================================================
-- NOTAS IMPORTANTES:
-- =====================================================
-- 1. Este script inserta datos de prueba para demostrar el funcionamiento del dashboard
-- 2. Las calificaciones se generan aleatoriamente entre 3.0 y 5.0
-- 3. Se crean evaluaciones para múltiples períodos para mostrar tendencias históricas
-- 4. Los datos son completamente ficticios y solo para propósitos de demostración
-- 5. Para producción, estos datos deben ser reemplazados por evaluaciones reales


