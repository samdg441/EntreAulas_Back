-- Script para actualizar preguntas de evaluación por carrera
-- Este script desactiva todas las preguntas existentes e inserta las nuevas preguntas específicas por carrera

-- =====================================================
-- PASO 1: DESACTIVAR TODAS LAS PREGUNTAS EXISTENTES
-- =====================================================

UPDATE preguntas_evaluacion 
SET activa = false 
WHERE activa = true;

-- Verificar que se desactivaron las preguntas
SELECT 
    'Preguntas desactivadas' as accion,
    COUNT(*) as total_preguntas,
    COUNT(CASE WHEN activa = false THEN 1 END) as preguntas_desactivadas,
    COUNT(CASE WHEN activa = true THEN 1 END) as preguntas_activas
FROM preguntas_evaluacion;

-- =====================================================
-- PASO 2: CREAR CATEGORÍAS SI NO EXISTEN
-- =====================================================

-- Insertar categorías si no existen
INSERT INTO categorias_pregunta (nombre, descripcion, orden, activa)
VALUES 
    ('Comunicación', 'Preguntas relacionadas con la comunicación y manejo de aula del docente', 1, true),
    ('Conocimiento del Tema', 'Preguntas sobre el dominio y aplicación de los contenidos', 2, true),
    ('Metodología de Enseñanza', 'Preguntas sobre estrategias y métodos de enseñanza', 3, true),
    ('Evaluación', 'Preguntas sobre evaluación y retroalimentación', 4, true),
    ('Disponibilidad', 'Preguntas sobre disponibilidad y aporte del docente', 5, true)
ON CONFLICT (nombre) DO NOTHING;

-- =====================================================
-- PASO 3: MAPEO DE CARRERAS
-- =====================================================

-- Mapeo de carreras (ajustar según tu estructura de base de datos)
-- 1 = Ingeniería de Sistemas
-- 2 = Ingeniería Civil  
-- 3 = Ingeniería Ambiental
-- 4 = Ingeniería de Energías
-- 5 = Ingeniería de Telecomunicaciones
-- 6 = Ingeniería Financiera
-- 7 = Ingeniería Industrial
-- NULL = Tronco Común de Ingenierías

-- =====================================================
-- PASO 4: FUNCIÓN PARA MAPEAR TIPOS DE PREGUNTA
-- =====================================================

-- Función para convertir tipos del JSON a tipos de la base de datos
CREATE OR REPLACE FUNCTION mapear_tipo_pregunta(tipo_json TEXT)
RETURNS TEXT AS $$
BEGIN
    CASE tipo_json
        WHEN 'escala_grafica' THEN RETURN 'rating';
        WHEN 'escala_1_5' THEN RETURN 'rating';
        WHEN 'escala_frecuencia' THEN RETURN 'rating';
        WHEN 'abierta' THEN RETURN 'text';
        ELSE RETURN 'rating';
    END CASE;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- PASO 5: FUNCIÓN PARA MAPEAR OPCIONES
-- =====================================================

-- Función para crear opciones JSON según el tipo
CREATE OR REPLACE FUNCTION crear_opciones_pregunta(tipo_json TEXT, opciones_array TEXT[])
RETURNS JSONB AS $$
BEGIN
    CASE tipo_json
        WHEN 'escala_grafica' THEN 
            IF opciones_array IS NOT NULL THEN
                RETURN jsonb_build_object(
                    'type', 'scale',
                    'min', 1,
                    'max', array_length(opciones_array, 1),
                    'labels', to_jsonb(opciones_array)
                );
            ELSE
                RETURN jsonb_build_object(
                    'type', 'scale',
                    'min', 1,
                    'max', 5,
                    'labels', to_jsonb(ARRAY['Muy deficiente', 'Deficiente', 'Aceptable', 'Buena', 'Excelente'])
                );
            END IF;
        WHEN 'escala_1_5' THEN 
            RETURN jsonb_build_object(
                'type', 'scale',
                'min', 1,
                'max', 5,
                'labels', to_jsonb(ARRAY['Muy malo', 'Malo', 'Regular', 'Bueno', 'Excelente'])
            );
        WHEN 'escala_frecuencia' THEN 
            IF opciones_array IS NOT NULL THEN
                RETURN jsonb_build_object(
                    'type', 'scale',
                    'min', 1,
                    'max', array_length(opciones_array, 1),
                    'labels', to_jsonb(opciones_array)
                );
            ELSE
                RETURN jsonb_build_object(
                    'type', 'scale',
                    'min', 1,
                    'max', 5,
                    'labels', to_jsonb(ARRAY['Nunca', 'Rara vez', 'A veces', 'Frecuentemente', 'Siempre'])
                );
            END IF;
        WHEN 'abierta' THEN 
            RETURN jsonb_build_object(
                'type', 'text',
                'placeholder', 'Escribe tu respuesta aquí...'
            );
        ELSE 
            RETURN jsonb_build_object(
                'type', 'scale',
                'min', 1,
                'max', 5,
                'labels', to_jsonb(ARRAY['Muy malo', 'Malo', 'Regular', 'Bueno', 'Excelente'])
            );
    END CASE;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- PASO 6: INSERTAR PREGUNTAS POR CARRERA
-- =====================================================

-- INGENIERÍA AMBIENTAL (ID: 3)
INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, activa, id_carrera)
SELECT 
    cp.id as categoria_id,
    'Indica tu percepción sobre el respeto, manejo de aula y comunicación del docente con los estudiantes' as texto_pregunta,
    'Pregunta específica para Ingeniería Ambiental - Comunicación' as descripcion,
    mapear_tipo_pregunta('escala_grafica') as tipo_pregunta,
    crear_opciones_pregunta('escala_grafica', ARRAY['Muy deficiente', 'Deficiente', 'Aceptable', 'Buena', 'Excelente']) as opciones,
    true as obligatoria,
    1 as orden,
    true as activa,
    3 as id_carrera
FROM categorias_pregunta cp WHERE cp.nombre = 'Comunicación';

INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, activa, id_carrera)
SELECT 
    cp.id as categoria_id,
    '¿En qué medida el docente cumple y aplica los objetivos planteados al inicio de la asignatura, y qué tan claros resultan durante el desarrollo de las clases?' as texto_pregunta,
    'Pregunta específica para Ingeniería Ambiental - Conocimiento del Tema' as descripcion,
    mapear_tipo_pregunta('escala_1_5') as tipo_pregunta,
    crear_opciones_pregunta('escala_1_5', NULL) as opciones,
    true as obligatoria,
    2 as orden,
    true as activa,
    3 as id_carrera
FROM categorias_pregunta cp WHERE cp.nombre = 'Conocimiento del Tema';

INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, activa, id_carrera)
SELECT 
    cp.id as categoria_id,
    '¿Qué tan organizado(a) consideras que es el docente en la secuencia de sus clases?' as texto_pregunta,
    'Pregunta específica para Ingeniería Ambiental - Metodología de Enseñanza' as descripcion,
    mapear_tipo_pregunta('escala_1_5') as tipo_pregunta,
    crear_opciones_pregunta('escala_1_5', NULL) as opciones,
    true as obligatoria,
    3 as orden,
    true as activa,
    3 as id_carrera
FROM categorias_pregunta cp WHERE cp.nombre = 'Metodología de Enseñanza';

INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, activa, id_carrera)
SELECT 
    cp.id as categoria_id,
    '¿Qué estrategias o métodos de enseñanza emplea el profesor que te ayudan más a comprender los conceptos técnicos o científicos?' as texto_pregunta,
    'Pregunta específica para Ingeniería Ambiental - Metodología de Enseñanza' as descripcion,
    mapear_tipo_pregunta('abierta') as tipo_pregunta,
    crear_opciones_pregunta('abierta', NULL) as opciones,
    true as obligatoria,
    4 as orden,
    true as activa,
    3 as id_carrera
FROM categorias_pregunta cp WHERE cp.nombre = 'Metodología de Enseñanza';

INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, activa, id_carrera)
SELECT 
    cp.id as categoria_id,
    '¿Con qué frecuencia el profesor promueve la participación y el análisis crítico en clase?' as texto_pregunta,
    'Pregunta específica para Ingeniería Ambiental - Metodología de Enseñanza' as descripcion,
    mapear_tipo_pregunta('escala_frecuencia') as tipo_pregunta,
    crear_opciones_pregunta('escala_frecuencia', ARRAY['Nunca', 'Rara vez', 'A veces', 'Frecuentemente', 'Siempre']) as opciones,
    true as obligatoria,
    5 as orden,
    true as activa,
    3 as id_carrera
FROM categorias_pregunta cp WHERE cp.nombre = 'Metodología de Enseñanza';

INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, activa, id_carrera)
SELECT 
    cp.id as categoria_id,
    'Describe una actividad, proyecto o práctica que haya contribuido a tu aprendizaje en esta materia.' as texto_pregunta,
    'Pregunta específica para Ingeniería Ambiental - Evaluación' as descripcion,
    mapear_tipo_pregunta('abierta') as tipo_pregunta,
    crear_opciones_pregunta('abierta', NULL) as opciones,
    true as obligatoria,
    6 as orden,
    true as activa,
    3 as id_carrera
FROM categorias_pregunta cp WHERE cp.nombre = 'Evaluación';

INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, activa, id_carrera)
SELECT 
    cp.id as categoria_id,
    '¿Qué tan útil consideras la retroalimentación del profesor para mejorar tu desempeño académico?' as texto_pregunta,
    'Pregunta específica para Ingeniería Ambiental - Evaluación' as descripcion,
    mapear_tipo_pregunta('escala_1_5') as tipo_pregunta,
    crear_opciones_pregunta('escala_1_5', NULL) as opciones,
    true as obligatoria,
    7 as orden,
    true as activa,
    3 as id_carrera
FROM categorias_pregunta cp WHERE cp.nombre = 'Evaluación';

INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, activa, id_carrera)
SELECT 
    cp.id as categoria_id,
    '¿Qué sugerencias podrías dar al docente para fortalecer el proceso de enseñanza-aprendizaje en esta asignatura?' as texto_pregunta,
    'Pregunta específica para Ingeniería Ambiental - Metodología de Enseñanza' as descripcion,
    mapear_tipo_pregunta('abierta') as tipo_pregunta,
    crear_opciones_pregunta('abierta', NULL) as opciones,
    true as obligatoria,
    8 as orden,
    true as activa,
    3 as id_carrera
FROM categorias_pregunta cp WHERE cp.nombre = 'Metodología de Enseñanza';

INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, activa, id_carrera)
SELECT 
    cp.id as categoria_id,
    '¿En qué medida el profesor relaciona los contenidos de la clase con problemáticas ambientales reales?' as texto_pregunta,
    'Pregunta específica para Ingeniería Ambiental - Conocimiento del Tema' as descripcion,
    mapear_tipo_pregunta('escala_1_5') as tipo_pregunta,
    crear_opciones_pregunta('escala_1_5', NULL) as opciones,
    true as obligatoria,
    9 as orden,
    true as activa,
    3 as id_carrera
FROM categorias_pregunta cp WHERE cp.nombre = 'Conocimiento del Tema';

INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, activa, id_carrera)
SELECT 
    cp.id as categoria_id,
    '¿Qué tanto sientes que las actividades en clase te ayudan a desarrollar una conciencia ambiental y social sobre el impacto de la ingeniería en el entorno?' as texto_pregunta,
    'Pregunta específica para Ingeniería Ambiental - Disponibilidad' as descripcion,
    mapear_tipo_pregunta('escala_1_5') as tipo_pregunta,
    crear_opciones_pregunta('escala_1_5', NULL) as opciones,
    true as obligatoria,
    10 as orden,
    true as activa,
    3 as id_carrera
FROM categorias_pregunta cp WHERE cp.nombre = 'Disponibilidad';

INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, activa, id_carrera)
SELECT 
    cp.id as categoria_id,
    '¿Cómo describirías el aporte del profesor a tu formación como ingeniero(a) ambiental?' as texto_pregunta,
    'Pregunta específica para Ingeniería Ambiental - Disponibilidad' as descripcion,
    mapear_tipo_pregunta('abierta') as tipo_pregunta,
    crear_opciones_pregunta('abierta', NULL) as opciones,
    true as obligatoria,
    11 as orden,
    true as activa,
    3 as id_carrera
FROM categorias_pregunta cp WHERE cp.nombre = 'Disponibilidad';

-- =====================================================
-- INGENIERÍA CIVIL (ID: 2)
-- =====================================================

INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, activa, id_carrera)
SELECT 
    cp.id as categoria_id,
    'Indica tu percepción sobre el respeto, manejo de aula y comunicación del docente con los estudiantes' as texto_pregunta,
    'Pregunta específica para Ingeniería Civil - Comunicación' as descripcion,
    mapear_tipo_pregunta('escala_grafica') as tipo_pregunta,
    crear_opciones_pregunta('escala_grafica', ARRAY['Muy deficiente', 'Deficiente', 'Aceptable', 'Buena', 'Excelente']) as opciones,
    true as obligatoria,
    1 as orden,
    true as activa,
    2 as id_carrera
FROM categorias_pregunta cp WHERE cp.nombre = 'Comunicación';

INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, activa, id_carrera)
SELECT 
    cp.id as categoria_id,
    '¿En qué medida el docente cumple y aplica los objetivos planteados al inicio de la asignatura, y qué tan claros resultan durante el desarrollo de las clases?' as texto_pregunta,
    'Pregunta específica para Ingeniería Civil - Conocimiento del Tema' as descripcion,
    mapear_tipo_pregunta('escala_1_5') as tipo_pregunta,
    crear_opciones_pregunta('escala_1_5', NULL) as opciones,
    true as obligatoria,
    2 as orden,
    true as activa,
    2 as id_carrera
FROM categorias_pregunta cp WHERE cp.nombre = 'Conocimiento del Tema';

INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, activa, id_carrera)
SELECT 
    cp.id as categoria_id,
    '¿Qué tan organizado(a) consideras que es el docente en la secuencia de sus clases?' as texto_pregunta,
    'Pregunta específica para Ingeniería Civil - Metodología de Enseñanza' as descripcion,
    mapear_tipo_pregunta('escala_1_5') as tipo_pregunta,
    crear_opciones_pregunta('escala_1_5', NULL) as opciones,
    true as obligatoria,
    3 as orden,
    true as activa,
    2 as id_carrera
FROM categorias_pregunta cp WHERE cp.nombre = 'Metodología de Enseñanza';

INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, activa, id_carrera)
SELECT 
    cp.id as categoria_id,
    '¿Qué estrategias o métodos de enseñanza emplea el profesor que te ayudan más a comprender los conceptos técnicos o científicos?' as texto_pregunta,
    'Pregunta específica para Ingeniería Civil - Metodología de Enseñanza' as descripcion,
    mapear_tipo_pregunta('abierta') as tipo_pregunta,
    crear_opciones_pregunta('abierta', NULL) as opciones,
    true as obligatoria,
    4 as orden,
    true as activa,
    2 as id_carrera
FROM categorias_pregunta cp WHERE cp.nombre = 'Metodología de Enseñanza';

INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, activa, id_carrera)
SELECT 
    cp.id as categoria_id,
    '¿Con qué frecuencia el profesor promueve la participación y el análisis crítico en clase?' as texto_pregunta,
    'Pregunta específica para Ingeniería Civil - Metodología de Enseñanza' as descripcion,
    mapear_tipo_pregunta('escala_frecuencia') as tipo_pregunta,
    crear_opciones_pregunta('escala_frecuencia', ARRAY['Nunca', 'Rara vez', 'A veces', 'Frecuentemente', 'Siempre']) as opciones,
    true as obligatoria,
    5 as orden,
    true as activa,
    2 as id_carrera
FROM categorias_pregunta cp WHERE cp.nombre = 'Metodología de Enseñanza';

INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, activa, id_carrera)
SELECT 
    cp.id as categoria_id,
    'Describe una actividad, proyecto o práctica que haya contribuido a tu aprendizaje en esta materia.' as texto_pregunta,
    'Pregunta específica para Ingeniería Civil - Evaluación' as descripcion,
    mapear_tipo_pregunta('abierta') as tipo_pregunta,
    crear_opciones_pregunta('abierta', NULL) as opciones,
    true as obligatoria,
    6 as orden,
    true as activa,
    2 as id_carrera
FROM categorias_pregunta cp WHERE cp.nombre = 'Evaluación';

INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, activa, id_carrera)
SELECT 
    cp.id as categoria_id,
    '¿Qué tan útil consideras la retroalimentación del profesor para mejorar tu desempeño académico?' as texto_pregunta,
    'Pregunta específica para Ingeniería Civil - Evaluación' as descripcion,
    mapear_tipo_pregunta('escala_1_5') as tipo_pregunta,
    crear_opciones_pregunta('escala_1_5', NULL) as opciones,
    true as obligatoria,
    7 as orden,
    true as activa,
    2 as id_carrera
FROM categorias_pregunta cp WHERE cp.nombre = 'Evaluación';

INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, activa, id_carrera)
SELECT 
    cp.id as categoria_id,
    '¿Qué sugerencias podrías dar al docente para fortalecer el proceso de enseñanza-aprendizaje en esta asignatura?' as texto_pregunta,
    'Pregunta específica para Ingeniería Civil - Metodología de Enseñanza' as descripcion,
    mapear_tipo_pregunta('abierta') as tipo_pregunta,
    crear_opciones_pregunta('abierta', NULL) as opciones,
    true as obligatoria,
    8 as orden,
    true as activa,
    2 as id_carrera
FROM categorias_pregunta cp WHERE cp.nombre = 'Metodología de Enseñanza';

INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, activa, id_carrera)
SELECT 
    cp.id as categoria_id,
    '¿En qué medida el profesor relaciona los contenidos de la clase con problemáticas reales de la Ingeniería Civil?' as texto_pregunta,
    'Pregunta específica para Ingeniería Civil - Conocimiento del Tema' as descripcion,
    mapear_tipo_pregunta('escala_1_5') as tipo_pregunta,
    crear_opciones_pregunta('escala_1_5', NULL) as opciones,
    true as obligatoria,
    9 as orden,
    true as activa,
    2 as id_carrera
FROM categorias_pregunta cp WHERE cp.nombre = 'Conocimiento del Tema';

INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, activa, id_carrera)
SELECT 
    cp.id as categoria_id,
    '¿Qué tanto sientes que las actividades en clase te ayudan a desarrollar una conciencia sobre la responsabilidad social y ambiental del ingeniero civil?' as texto_pregunta,
    'Pregunta específica para Ingeniería Civil - Disponibilidad' as descripcion,
    mapear_tipo_pregunta('escala_1_5') as tipo_pregunta,
    crear_opciones_pregunta('escala_1_5', NULL) as opciones,
    true as obligatoria,
    10 as orden,
    true as activa,
    2 as id_carrera
FROM categorias_pregunta cp WHERE cp.nombre = 'Disponibilidad';

INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, activa, id_carrera)
SELECT 
    cp.id as categoria_id,
    '¿Cómo describirías el aporte del profesor a tu formación como ingeniero(a) civil?' as texto_pregunta,
    'Pregunta específica para Ingeniería Civil - Disponibilidad' as descripcion,
    mapear_tipo_pregunta('abierta') as tipo_pregunta,
    crear_opciones_pregunta('abierta', NULL) as opciones,
    true as obligatoria,
    11 as orden,
    true as activa,
    2 as id_carrera
FROM categorias_pregunta cp WHERE cp.nombre = 'Disponibilidad';

-- =====================================================
-- INGENIERÍA DE SISTEMAS (ID: 1)
-- =====================================================

INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, activa, id_carrera)
SELECT 
    cp.id as categoria_id,
    'Indica tu percepción sobre el respeto, manejo de aula y comunicación del docente con los estudiantes' as texto_pregunta,
    'Pregunta específica para Ingeniería de Sistemas - Comunicación' as descripcion,
    mapear_tipo_pregunta('escala_grafica') as tipo_pregunta,
    crear_opciones_pregunta('escala_grafica', ARRAY['Muy deficiente', 'Deficiente', 'Aceptable', 'Buena', 'Excelente']) as opciones,
    true as obligatoria,
    1 as orden,
    true as activa,
    1 as id_carrera
FROM categorias_pregunta cp WHERE cp.nombre = 'Comunicación';

INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, activa, id_carrera)
SELECT 
    cp.id as categoria_id,
    '¿En qué medida el docente cumple y aplica los objetivos planteados al inicio de la asignatura, y qué tan claros resultan durante el desarrollo de las clases?' as texto_pregunta,
    'Pregunta específica para Ingeniería de Sistemas - Conocimiento del Tema' as descripcion,
    mapear_tipo_pregunta('escala_1_5') as tipo_pregunta,
    crear_opciones_pregunta('escala_1_5', NULL) as opciones,
    true as obligatoria,
    2 as orden,
    true as activa,
    1 as id_carrera
FROM categorias_pregunta cp WHERE cp.nombre = 'Conocimiento del Tema';

INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, activa, id_carrera)
SELECT 
    cp.id as categoria_id,
    '¿Qué tan organizado(a) consideras que es el docente en la secuencia de sus clases?' as texto_pregunta,
    'Pregunta específica para Ingeniería de Sistemas - Metodología de Enseñanza' as descripcion,
    mapear_tipo_pregunta('escala_1_5') as tipo_pregunta,
    crear_opciones_pregunta('escala_1_5', NULL) as opciones,
    true as obligatoria,
    3 as orden,
    true as activa,
    1 as id_carrera
FROM categorias_pregunta cp WHERE cp.nombre = 'Metodología de Enseñanza';

INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, activa, id_carrera)
SELECT 
    cp.id as categoria_id,
    '¿Qué estrategias o métodos de enseñanza emplea el profesor que te ayudan más a comprender los conceptos técnicos o científicos?' as texto_pregunta,
    'Pregunta específica para Ingeniería de Sistemas - Metodología de Enseñanza' as descripcion,
    mapear_tipo_pregunta('abierta') as tipo_pregunta,
    crear_opciones_pregunta('abierta', NULL) as opciones,
    true as obligatoria,
    4 as orden,
    true as activa,
    1 as id_carrera
FROM categorias_pregunta cp WHERE cp.nombre = 'Metodología de Enseñanza';

INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, activa, id_carrera)
SELECT 
    cp.id as categoria_id,
    '¿Con qué frecuencia el profesor promueve la participación y el análisis crítico en clase?' as texto_pregunta,
    'Pregunta específica para Ingeniería de Sistemas - Metodología de Enseñanza' as descripcion,
    mapear_tipo_pregunta('escala_frecuencia') as tipo_pregunta,
    crear_opciones_pregunta('escala_frecuencia', ARRAY['Nunca', 'Rara vez', 'A veces', 'Frecuentemente', 'Siempre']) as opciones,
    true as obligatoria,
    5 as orden,
    true as activa,
    1 as id_carrera
FROM categorias_pregunta cp WHERE cp.nombre = 'Metodología de Enseñanza';

INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, activa, id_carrera)
SELECT 
    cp.id as categoria_id,
    'Describe una actividad, proyecto o práctica que haya contribuido a tu aprendizaje en esta materia.' as texto_pregunta,
    'Pregunta específica para Ingeniería de Sistemas - Evaluación' as descripcion,
    mapear_tipo_pregunta('abierta') as tipo_pregunta,
    crear_opciones_pregunta('abierta', NULL) as opciones,
    true as obligatoria,
    6 as orden,
    true as activa,
    1 as id_carrera
FROM categorias_pregunta cp WHERE cp.nombre = 'Evaluación';

INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, activa, id_carrera)
SELECT 
    cp.id as categoria_id,
    '¿Qué tan útil consideras la retroalimentación del profesor para mejorar tu desempeño académico?' as texto_pregunta,
    'Pregunta específica para Ingeniería de Sistemas - Evaluación' as descripcion,
    mapear_tipo_pregunta('escala_1_5') as tipo_pregunta,
    crear_opciones_pregunta('escala_1_5', NULL) as opciones,
    true as obligatoria,
    7 as orden,
    true as activa,
    1 as id_carrera
FROM categorias_pregunta cp WHERE cp.nombre = 'Evaluación';

INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, activa, id_carrera)
SELECT 
    cp.id as categoria_id,
    '¿Qué sugerencias podrías dar al docente para fortalecer el proceso de enseñanza-aprendizaje en esta asignatura?' as texto_pregunta,
    'Pregunta específica para Ingeniería de Sistemas - Metodología de Enseñanza' as descripcion,
    mapear_tipo_pregunta('abierta') as tipo_pregunta,
    crear_opciones_pregunta('abierta', NULL) as opciones,
    true as obligatoria,
    8 as orden,
    true as activa,
    1 as id_carrera
FROM categorias_pregunta cp WHERE cp.nombre = 'Metodología de Enseñanza';

INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, activa, id_carrera)
SELECT 
    cp.id as categoria_id,
    '¿En qué medida el profesor relaciona los contenidos de la clase con problemáticas reales del campo de la Ingeniería de Sistemas?' as texto_pregunta,
    'Pregunta específica para Ingeniería de Sistemas - Conocimiento del Tema' as descripcion,
    mapear_tipo_pregunta('escala_1_5') as tipo_pregunta,
    crear_opciones_pregunta('escala_1_5', NULL) as opciones,
    true as obligatoria,
    9 as orden,
    true as activa,
    1 as id_carrera
FROM categorias_pregunta cp WHERE cp.nombre = 'Conocimiento del Tema';

INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, activa, id_carrera)
SELECT 
    cp.id as categoria_id,
    '¿Qué tanto sientes que las actividades en clase te ayudan a desarrollar una conciencia ética y social sobre el uso de la tecnología y la información?' as texto_pregunta,
    'Pregunta específica para Ingeniería de Sistemas - Disponibilidad' as descripcion,
    mapear_tipo_pregunta('escala_1_5') as tipo_pregunta,
    crear_opciones_pregunta('escala_1_5', NULL) as opciones,
    true as obligatoria,
    10 as orden,
    true as activa,
    1 as id_carrera
FROM categorias_pregunta cp WHERE cp.nombre = 'Disponibilidad';

INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, activa, id_carrera)
SELECT 
    cp.id as categoria_id,
    '¿Cómo describirías el aporte del profesor a tu formación como ingeniero(a) de sistemas?' as texto_pregunta,
    'Pregunta específica para Ingeniería de Sistemas - Disponibilidad' as descripcion,
    mapear_tipo_pregunta('abierta') as tipo_pregunta,
    crear_opciones_pregunta('abierta', NULL) as opciones,
    true as obligatoria,
    11 as orden,
    true as activa,
    1 as id_carrera
FROM categorias_pregunta cp WHERE cp.nombre = 'Disponibilidad';

-- =====================================================
-- TRONCO COMÚN DE INGENIERÍAS (ID: NULL)
-- =====================================================

INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, activa, id_carrera)
SELECT 
    cp.id as categoria_id,
    'Indica tu percepción sobre el respeto, el manejo de aula y la comunicación del docente con los estudiantes.' as texto_pregunta,
    'Pregunta para Tronco Común de Ingenierías - Comunicación' as descripcion,
    mapear_tipo_pregunta('escala_grafica') as tipo_pregunta,
    crear_opciones_pregunta('escala_grafica', ARRAY['Muy deficiente', 'Deficiente', 'Aceptable', 'Buena', 'Excelente']) as opciones,
    true as obligatoria,
    1 as orden,
    true as activa,
    NULL as id_carrera
FROM categorias_pregunta cp WHERE cp.nombre = 'Comunicación';

INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, activa, id_carrera)
SELECT 
    cp.id as categoria_id,
    '¿En qué medida el docente cumple y aplica los objetivos planteados al inicio de la asignatura, y qué tan claros resultan durante el desarrollo de las clases?' as texto_pregunta,
    'Pregunta para Tronco Común de Ingenierías - Conocimiento del Tema' as descripcion,
    mapear_tipo_pregunta('escala_1_5') as tipo_pregunta,
    crear_opciones_pregunta('escala_1_5', NULL) as opciones,
    true as obligatoria,
    2 as orden,
    true as activa,
    NULL as id_carrera
FROM categorias_pregunta cp WHERE cp.nombre = 'Conocimiento del Tema';

INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, activa, id_carrera)
SELECT 
    cp.id as categoria_id,
    '¿Qué tan organizado(a) consideras que es el docente en la secuencia de sus clases? (Por ejemplo, evita devolverse constantemente a temas ya explicados o generar confusión en el orden de los contenidos).' as texto_pregunta,
    'Pregunta para Tronco Común de Ingenierías - Metodología de Enseñanza' as descripcion,
    mapear_tipo_pregunta('escala_1_5') as tipo_pregunta,
    crear_opciones_pregunta('escala_1_5', NULL) as opciones,
    true as obligatoria,
    3 as orden,
    true as activa,
    NULL as id_carrera
FROM categorias_pregunta cp WHERE cp.nombre = 'Metodología de Enseñanza';

INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, activa, id_carrera)
SELECT 
    cp.id as categoria_id,
    '¿Qué estrategias o métodos de enseñanza emplea el profesor que te ayudan más a comprender los conceptos y temas de la asignatura?' as texto_pregunta,
    'Pregunta para Tronco Común de Ingenierías - Metodología de Enseñanza' as descripcion,
    mapear_tipo_pregunta('abierta') as tipo_pregunta,
    crear_opciones_pregunta('abierta', NULL) as opciones,
    true as obligatoria,
    4 as orden,
    true as activa,
    NULL as id_carrera
FROM categorias_pregunta cp WHERE cp.nombre = 'Metodología de Enseñanza';

INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, activa, id_carrera)
SELECT 
    cp.id as categoria_id,
    '¿De qué manera el profesor fomenta tu participación, interés o compromiso con los temas abordados en clase?' as texto_pregunta,
    'Pregunta para Tronco Común de Ingenierías - Metodología de Enseñanza' as descripcion,
    mapear_tipo_pregunta('escala_1_5') as tipo_pregunta,
    crear_opciones_pregunta('escala_1_5', NULL) as opciones,
    true as obligatoria,
    5 as orden,
    true as activa,
    NULL as id_carrera
FROM categorias_pregunta cp WHERE cp.nombre = 'Metodología de Enseñanza';

INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, activa, id_carrera)
SELECT 
    cp.id as categoria_id,
    'Describe un trabajo, exposición o actividad que haya contribuido significativamente a tu aprendizaje en esta materia.' as texto_pregunta,
    'Pregunta para Tronco Común de Ingenierías - Evaluación' as descripcion,
    mapear_tipo_pregunta('abierta') as tipo_pregunta,
    crear_opciones_pregunta('abierta', NULL) as opciones,
    true as obligatoria,
    6 as orden,
    true as activa,
    NULL as id_carrera
FROM categorias_pregunta cp WHERE cp.nombre = 'Evaluación';

INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, activa, id_carrera)
SELECT 
    cp.id as categoria_id,
    '¿Qué tan útil consideras la retroalimentación del profesor para mejorar tu desempeño académico?' as texto_pregunta,
    'Pregunta para Tronco Común de Ingenierías - Evaluación' as descripcion,
    mapear_tipo_pregunta('escala_1_5') as tipo_pregunta,
    crear_opciones_pregunta('escala_1_5', NULL) as opciones,
    true as obligatoria,
    7 as orden,
    true as activa,
    NULL as id_carrera
FROM categorias_pregunta cp WHERE cp.nombre = 'Evaluación';

INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, activa, id_carrera)
SELECT 
    cp.id as categoria_id,
    '¿Qué sugerencias podrías dar al docente para fortalecer el proceso de enseñanza-aprendizaje en esta asignatura?' as texto_pregunta,
    'Pregunta para Tronco Común de Ingenierías - Metodología de Enseñanza' as descripcion,
    mapear_tipo_pregunta('abierta') as tipo_pregunta,
    crear_opciones_pregunta('abierta', NULL) as opciones,
    true as obligatoria,
    8 as orden,
    true as activa,
    NULL as id_carrera
FROM categorias_pregunta cp WHERE cp.nombre = 'Metodología de Enseñanza';

INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, activa, id_carrera)
SELECT 
    cp.id as categoria_id,
    '¿En qué medida el profesor relaciona los contenidos de la clase con problemáticas o situaciones reales actuales del entorno social o profesional?' as texto_pregunta,
    'Pregunta para Tronco Común de Ingenierías - Conocimiento del Tema' as descripcion,
    mapear_tipo_pregunta('escala_1_5') as tipo_pregunta,
    crear_opciones_pregunta('escala_1_5', NULL) as opciones,
    true as obligatoria,
    9 as orden,
    true as activa,
    NULL as id_carrera
FROM categorias_pregunta cp WHERE cp.nombre = 'Conocimiento del Tema';

INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, activa, id_carrera)
SELECT 
    cp.id as categoria_id,
    '¿Cómo describirías el aporte del profesor a tu formación como ingeniero(a)?' as texto_pregunta,
    'Pregunta para Tronco Común de Ingenierías - Disponibilidad' as descripcion,
    mapear_tipo_pregunta('abierta') as tipo_pregunta,
    crear_opciones_pregunta('abierta', NULL) as opciones,
    true as obligatoria,
    10 as orden,
    true as activa,
    NULL as id_carrera
FROM categorias_pregunta cp WHERE cp.nombre = 'Disponibilidad';

-- =====================================================
-- PASO 7: VERIFICACIÓN FINAL
-- =====================================================

-- Verificar que las preguntas se insertaron correctamente
SELECT 
    'Resumen de preguntas insertadas' as descripcion,
    COUNT(*) as total_preguntas,
    COUNT(CASE WHEN activa = true THEN 1 END) as preguntas_activas,
    COUNT(CASE WHEN activa = false THEN 1 END) as preguntas_desactivadas
FROM preguntas_evaluacion;

-- Verificar preguntas por carrera
SELECT 
    CASE 
        WHEN id_carrera IS NULL THEN 'Tronco Común'
        ELSE 'Carrera ID: ' || id_carrera::text
    END as carrera,
    COUNT(*) as total_preguntas,
    COUNT(CASE WHEN activa = true THEN 1 END) as preguntas_activas
FROM preguntas_evaluacion
GROUP BY id_carrera
ORDER BY id_carrera NULLS FIRST;

-- Verificar preguntas por categoría
SELECT 
    cp.nombre as categoria,
    COUNT(pe.id) as total_preguntas,
    COUNT(CASE WHEN pe.activa = true THEN 1 END) as preguntas_activas
FROM categorias_pregunta cp
LEFT JOIN preguntas_evaluacion pe ON cp.id = pe.categoria_id
GROUP BY cp.id, cp.nombre
ORDER BY cp.orden;

-- Verificar tipos de pregunta
SELECT 
    tipo_pregunta,
    COUNT(*) as total_preguntas,
    COUNT(CASE WHEN activa = true THEN 1 END) as preguntas_activas
FROM preguntas_evaluacion
GROUP BY tipo_pregunta
ORDER BY tipo_pregunta;

-- =====================================================
-- PASO 8: LIMPIAR FUNCIONES TEMPORALES
-- =====================================================

-- Eliminar funciones temporales
DROP FUNCTION IF EXISTS mapear_tipo_pregunta(TEXT);
DROP FUNCTION IF EXISTS crear_opciones_pregunta(TEXT, TEXT[]);

-- =====================================================
-- MENSAJE FINAL
-- =====================================================

SELECT 
    '✅ ACTUALIZACIÓN COMPLETADA' as estado,
    'Todas las preguntas existentes han sido desactivadas' as accion_1,
    'Se han insertado nuevas preguntas específicas por carrera' as accion_2,
    'Las preguntas están listas para ser utilizadas' as resultado;
