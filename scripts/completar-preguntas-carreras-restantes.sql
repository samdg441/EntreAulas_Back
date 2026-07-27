-- Script para completar las preguntas de las carreras restantes
-- Este script agrega las preguntas para: Energías, Telecomunicaciones, Financiera e Industrial

-- =====================================================
-- INGENIERÍA DE ENERGÍAS (ID: 4)
-- =====================================================

INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, activa, id_carrera)
SELECT 
    cp.id as categoria_id,
    'Indica tu percepción sobre el respeto, manejo de aula y comunicación del docente con los estudiantes' as texto_pregunta,
    'Pregunta específica para Ingeniería de Energías - Comunicación' as descripcion,
    'rating' as tipo_pregunta,
    '{"type": "scale", "min": 1, "max": 5, "labels": ["Muy deficiente", "Deficiente", "Aceptable", "Buena", "Excelente"]}'::jsonb as opciones,
    true as obligatoria,
    1 as orden,
    true as activa,
    4 as id_carrera
FROM categorias_pregunta cp WHERE cp.nombre = 'Comunicación';

INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, activa, id_carrera)
SELECT 
    cp.id as categoria_id,
    '¿En qué medida el docente cumple y aplica los objetivos planteados al inicio de la asignatura, y qué tan claros resultan durante el desarrollo de las clases?' as texto_pregunta,
    'Pregunta específica para Ingeniería de Energías - Conocimiento del Tema' as descripcion,
    'rating' as tipo_pregunta,
    '{"type": "scale", "min": 1, "max": 5, "labels": ["Muy malo", "Malo", "Regular", "Bueno", "Excelente"]}'::jsonb as opciones,
    true as obligatoria,
    2 as orden,
    true as activa,
    4 as id_carrera
FROM categorias_pregunta cp WHERE cp.nombre = 'Conocimiento del Tema';

INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, activa, id_carrera)
SELECT 
    cp.id as categoria_id,
    '¿Qué tan organizado(a) consideras que es el docente en la secuencia de sus clases?' as texto_pregunta,
    'Pregunta específica para Ingeniería de Energías - Metodología de Enseñanza' as descripcion,
    'rating' as tipo_pregunta,
    '{"type": "scale", "min": 1, "max": 5, "labels": ["Muy malo", "Malo", "Regular", "Bueno", "Excelente"]}'::jsonb as opciones,
    true as obligatoria,
    3 as orden,
    true as activa,
    4 as id_carrera
FROM categorias_pregunta cp WHERE cp.nombre = 'Metodología de Enseñanza';

INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, activa, id_carrera)
SELECT 
    cp.id as categoria_id,
    '¿Qué estrategias o métodos de enseñanza emplea el profesor que te ayudan más a comprender los conceptos técnicos o científicos?' as texto_pregunta,
    'Pregunta específica para Ingeniería de Energías - Metodología de Enseñanza' as descripcion,
    'text' as tipo_pregunta,
    '{"type": "text", "placeholder": "Escribe tu respuesta aquí..."}'::jsonb as opciones,
    true as obligatoria,
    4 as orden,
    true as activa,
    4 as id_carrera
FROM categorias_pregunta cp WHERE cp.nombre = 'Metodología de Enseñanza';

INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, activa, id_carrera)
SELECT 
    cp.id as categoria_id,
    '¿Con qué frecuencia el profesor promueve la participación y el análisis crítico en clase?' as texto_pregunta,
    'Pregunta específica para Ingeniería de Energías - Metodología de Enseñanza' as descripcion,
    'rating' as tipo_pregunta,
    '{"type": "scale", "min": 1, "max": 5, "labels": ["Nunca", "Rara vez", "A veces", "Frecuentemente", "Siempre"]}'::jsonb as opciones,
    true as obligatoria,
    5 as orden,
    true as activa,
    4 as id_carrera
FROM categorias_pregunta cp WHERE cp.nombre = 'Metodología de Enseñanza';

INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, activa, id_carrera)
SELECT 
    cp.id as categoria_id,
    'Describe una actividad, proyecto o práctica que haya contribuido a tu aprendizaje en esta materia.' as texto_pregunta,
    'Pregunta específica para Ingeniería de Energías - Evaluación' as descripcion,
    'text' as tipo_pregunta,
    '{"type": "text", "placeholder": "Escribe tu respuesta aquí..."}'::jsonb as opciones,
    true as obligatoria,
    6 as orden,
    true as activa,
    4 as id_carrera
FROM categorias_pregunta cp WHERE cp.nombre = 'Evaluación';

INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, activa, id_carrera)
SELECT 
    cp.id as categoria_id,
    '¿Qué tan útil consideras la retroalimentación del profesor para mejorar tu desempeño académico?' as texto_pregunta,
    'Pregunta específica para Ingeniería de Energías - Evaluación' as descripcion,
    'rating' as tipo_pregunta,
    '{"type": "scale", "min": 1, "max": 5, "labels": ["Muy malo", "Malo", "Regular", "Bueno", "Excelente"]}'::jsonb as opciones,
    true as obligatoria,
    7 as orden,
    true as activa,
    4 as id_carrera
FROM categorias_pregunta cp WHERE cp.nombre = 'Evaluación';

INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, activa, id_carrera)
SELECT 
    cp.id as categoria_id,
    '¿Qué sugerencias podrías dar al docente para fortalecer el proceso de enseñanza-aprendizaje en esta asignatura?' as texto_pregunta,
    'Pregunta específica para Ingeniería de Energías - Metodología de Enseñanza' as descripcion,
    'text' as tipo_pregunta,
    '{"type": "text", "placeholder": "Escribe tu respuesta aquí..."}'::jsonb as opciones,
    true as obligatoria,
    8 as orden,
    true as activa,
    4 as id_carrera
FROM categorias_pregunta cp WHERE cp.nombre = 'Metodología de Enseñanza';

INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, activa, id_carrera)
SELECT 
    cp.id as categoria_id,
    '¿En qué medida el profesor relaciona los contenidos de la clase con problemáticas actuales del sector energético?' as texto_pregunta,
    'Pregunta específica para Ingeniería de Energías - Conocimiento del Tema' as descripcion,
    'rating' as tipo_pregunta,
    '{"type": "scale", "min": 1, "max": 5, "labels": ["Muy malo", "Malo", "Regular", "Bueno", "Excelente"]}'::jsonb as opciones,
    true as obligatoria,
    9 as orden,
    true as activa,
    4 as id_carrera
FROM categorias_pregunta cp WHERE cp.nombre = 'Conocimiento del Tema';

INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, activa, id_carrera)
SELECT 
    cp.id as categoria_id,
    '¿Qué tanto sientes que las actividades en clase te ayudan a desarrollar una conciencia sobre el uso responsable y sostenible de la energía?' as texto_pregunta,
    'Pregunta específica para Ingeniería de Energías - Disponibilidad' as descripcion,
    'rating' as tipo_pregunta,
    '{"type": "scale", "min": 1, "max": 5, "labels": ["Muy malo", "Malo", "Regular", "Bueno", "Excelente"]}'::jsonb as opciones,
    true as obligatoria,
    10 as orden,
    true as activa,
    4 as id_carrera
FROM categorias_pregunta cp WHERE cp.nombre = 'Disponibilidad';

INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, activa, id_carrera)
SELECT 
    cp.id as categoria_id,
    '¿Cómo describirías el aporte del profesor a tu formación como ingeniero(a) en energías?' as texto_pregunta,
    'Pregunta específica para Ingeniería de Energías - Disponibilidad' as descripcion,
    'text' as tipo_pregunta,
    '{"type": "text", "placeholder": "Escribe tu respuesta aquí..."}'::jsonb as opciones,
    true as obligatoria,
    11 as orden,
    true as activa,
    4 as id_carrera
FROM categorias_pregunta cp WHERE cp.nombre = 'Disponibilidad';

-- =====================================================
-- INGENIERÍA DE TELECOMUNICACIONES (ID: 5)
-- =====================================================

INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, activa, id_carrera)
SELECT 
    cp.id as categoria_id,
    'Indica tu percepción sobre el respeto, manejo de aula y comunicación del docente con los estudiantes' as texto_pregunta,
    'Pregunta específica para Ingeniería de Telecomunicaciones - Comunicación' as descripcion,
    'rating' as tipo_pregunta,
    '{"type": "scale", "min": 1, "max": 5, "labels": ["Muy deficiente", "Deficiente", "Aceptable", "Buena", "Excelente"]}'::jsonb as opciones,
    true as obligatoria,
    1 as orden,
    true as activa,
    5 as id_carrera
FROM categorias_pregunta cp WHERE cp.nombre = 'Comunicación';

INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, activa, id_carrera)
SELECT 
    cp.id as categoria_id,
    '¿En qué medida el docente cumple y aplica los objetivos planteados al inicio de la asignatura, y qué tan claros resultan durante el desarrollo de las clases?' as texto_pregunta,
    'Pregunta específica para Ingeniería de Telecomunicaciones - Conocimiento del Tema' as descripcion,
    'rating' as tipo_pregunta,
    '{"type": "scale", "min": 1, "max": 5, "labels": ["Muy malo", "Malo", "Regular", "Bueno", "Excelente"]}'::jsonb as opciones,
    true as obligatoria,
    2 as orden,
    true as activa,
    5 as id_carrera
FROM categorias_pregunta cp WHERE cp.nombre = 'Conocimiento del Tema';

INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, activa, id_carrera)
SELECT 
    cp.id as categoria_id,
    '¿Qué tan organizado(a) consideras que es el docente en la secuencia de sus clases?' as texto_pregunta,
    'Pregunta específica para Ingeniería de Telecomunicaciones - Metodología de Enseñanza' as descripcion,
    'rating' as tipo_pregunta,
    '{"type": "scale", "min": 1, "max": 5, "labels": ["Muy malo", "Malo", "Regular", "Bueno", "Excelente"]}'::jsonb as opciones,
    true as obligatoria,
    3 as orden,
    true as activa,
    5 as id_carrera
FROM categorias_pregunta cp WHERE cp.nombre = 'Metodología de Enseñanza';

INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, activa, id_carrera)
SELECT 
    cp.id as categoria_id,
    '¿Qué estrategias o métodos de enseñanza emplea el profesor que te ayudan más a comprender los conceptos técnicos o científicos?' as texto_pregunta,
    'Pregunta específica para Ingeniería de Telecomunicaciones - Metodología de Enseñanza' as descripcion,
    'text' as tipo_pregunta,
    '{"type": "text", "placeholder": "Escribe tu respuesta aquí..."}'::jsonb as opciones,
    true as obligatoria,
    4 as orden,
    true as activa,
    5 as id_carrera
FROM categorias_pregunta cp WHERE cp.nombre = 'Metodología de Enseñanza';

INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, activa, id_carrera)
SELECT 
    cp.id as categoria_id,
    '¿Con qué frecuencia el profesor promueve la participación y el análisis crítico en clase?' as texto_pregunta,
    'Pregunta específica para Ingeniería de Telecomunicaciones - Metodología de Enseñanza' as descripcion,
    'rating' as tipo_pregunta,
    '{"type": "scale", "min": 1, "max": 5, "labels": ["Nunca", "Rara vez", "A veces", "Frecuentemente", "Siempre"]}'::jsonb as opciones,
    true as obligatoria,
    5 as orden,
    true as activa,
    5 as id_carrera
FROM categorias_pregunta cp WHERE cp.nombre = 'Metodología de Enseñanza';

INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, activa, id_carrera)
SELECT 
    cp.id as categoria_id,
    'Describe una actividad, proyecto o práctica que haya contribuido a tu aprendizaje en esta materia.' as texto_pregunta,
    'Pregunta específica para Ingeniería de Telecomunicaciones - Evaluación' as descripcion,
    'text' as tipo_pregunta,
    '{"type": "text", "placeholder": "Escribe tu respuesta aquí..."}'::jsonb as opciones,
    true as obligatoria,
    6 as orden,
    true as activa,
    5 as id_carrera
FROM categorias_pregunta cp WHERE cp.nombre = 'Evaluación';

INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, activa, id_carrera)
SELECT 
    cp.id as categoria_id,
    '¿Qué tan útil consideras la retroalimentación del profesor para mejorar tu desempeño académico?' as texto_pregunta,
    'Pregunta específica para Ingeniería de Telecomunicaciones - Evaluación' as descripcion,
    'rating' as tipo_pregunta,
    '{"type": "scale", "min": 1, "max": 5, "labels": ["Muy malo", "Malo", "Regular", "Bueno", "Excelente"]}'::jsonb as opciones,
    true as obligatoria,
    7 as orden,
    true as activa,
    5 as id_carrera
FROM categorias_pregunta cp WHERE cp.nombre = 'Evaluación';

INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, activa, id_carrera)
SELECT 
    cp.id as categoria_id,
    '¿Qué sugerencias podrías dar al docente para fortalecer el proceso de enseñanza-aprendizaje en esta asignatura?' as texto_pregunta,
    'Pregunta específica para Ingeniería de Telecomunicaciones - Metodología de Enseñanza' as descripcion,
    'text' as tipo_pregunta,
    '{"type": "text", "placeholder": "Escribe tu respuesta aquí..."}'::jsonb as opciones,
    true as obligatoria,
    8 as orden,
    true as activa,
    5 as id_carrera
FROM categorias_pregunta cp WHERE cp.nombre = 'Metodología de Enseñanza';

INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, activa, id_carrera)
SELECT 
    cp.id as categoria_id,
    '¿En qué medida el profesor relaciona los contenidos de la clase con problemáticas y avances reales del sector de las telecomunicaciones?' as texto_pregunta,
    'Pregunta específica para Ingeniería de Telecomunicaciones - Conocimiento del Tema' as descripcion,
    'rating' as tipo_pregunta,
    '{"type": "scale", "min": 1, "max": 5, "labels": ["Muy malo", "Malo", "Regular", "Bueno", "Excelente"]}'::jsonb as opciones,
    true as obligatoria,
    9 as orden,
    true as activa,
    5 as id_carrera
FROM categorias_pregunta cp WHERE cp.nombre = 'Conocimiento del Tema';

INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, activa, id_carrera)
SELECT 
    cp.id as categoria_id,
    '¿Qué tanto sientes que las actividades en clase te ayudan a desarrollar una conciencia ética y social sobre el uso responsable de las tecnologías de la información y la comunicación?' as texto_pregunta,
    'Pregunta específica para Ingeniería de Telecomunicaciones - Disponibilidad' as descripcion,
    'rating' as tipo_pregunta,
    '{"type": "scale", "min": 1, "max": 5, "labels": ["Muy malo", "Malo", "Regular", "Bueno", "Excelente"]}'::jsonb as opciones,
    true as obligatoria,
    10 as orden,
    true as activa,
    5 as id_carrera
FROM categorias_pregunta cp WHERE cp.nombre = 'Disponibilidad';

INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, activa, id_carrera)
SELECT 
    cp.id as categoria_id,
    '¿Cómo describirías el aporte del profesor a tu formación como ingeniero(a) en telecomunicaciones?' as texto_pregunta,
    'Pregunta específica para Ingeniería de Telecomunicaciones - Disponibilidad' as descripcion,
    'text' as tipo_pregunta,
    '{"type": "text", "placeholder": "Escribe tu respuesta aquí..."}'::jsonb as opciones,
    true as obligatoria,
    11 as orden,
    true as activa,
    5 as id_carrera
FROM categorias_pregunta cp WHERE cp.nombre = 'Disponibilidad';

-- =====================================================
-- INGENIERÍA FINANCIERA (ID: 6)
-- =====================================================

INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, activa, id_carrera)
SELECT 
    cp.id as categoria_id,
    'Indica tu percepción sobre el respeto, manejo de aula y comunicación del docente con los estudiantes' as texto_pregunta,
    'Pregunta específica para Ingeniería Financiera - Comunicación' as descripcion,
    'rating' as tipo_pregunta,
    '{"type": "scale", "min": 1, "max": 5, "labels": ["Muy deficiente", "Deficiente", "Aceptable", "Buena", "Excelente"]}'::jsonb as opciones,
    true as obligatoria,
    1 as orden,
    true as activa,
    6 as id_carrera
FROM categorias_pregunta cp WHERE cp.nombre = 'Comunicación';

INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, activa, id_carrera)
SELECT 
    cp.id as categoria_id,
    '¿En qué medida el docente cumple y aplica los objetivos planteados al inicio de la asignatura, y qué tan claros resultan durante el desarrollo de las clases?' as texto_pregunta,
    'Pregunta específica para Ingeniería Financiera - Conocimiento del Tema' as descripcion,
    'rating' as tipo_pregunta,
    '{"type": "scale", "min": 1, "max": 5, "labels": ["Muy malo", "Malo", "Regular", "Bueno", "Excelente"]}'::jsonb as opciones,
    true as obligatoria,
    2 as orden,
    true as activa,
    6 as id_carrera
FROM categorias_pregunta cp WHERE cp.nombre = 'Conocimiento del Tema';

INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, activa, id_carrera)
SELECT 
    cp.id as categoria_id,
    '¿Qué tan organizado(a) consideras que es el docente en la secuencia de sus clases?' as texto_pregunta,
    'Pregunta específica para Ingeniería Financiera - Metodología de Enseñanza' as descripcion,
    'rating' as tipo_pregunta,
    '{"type": "scale", "min": 1, "max": 5, "labels": ["Muy malo", "Malo", "Regular", "Bueno", "Excelente"]}'::jsonb as opciones,
    true as obligatoria,
    3 as orden,
    true as activa,
    6 as id_carrera
FROM categorias_pregunta cp WHERE cp.nombre = 'Metodología de Enseñanza';

INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, activa, id_carrera)
SELECT 
    cp.id as categoria_id,
    '¿Qué estrategias o métodos de enseñanza emplea el profesor que te ayudan más a comprender los conceptos técnicos o científicos?' as texto_pregunta,
    'Pregunta específica para Ingeniería Financiera - Metodología de Enseñanza' as descripcion,
    'text' as tipo_pregunta,
    '{"type": "text", "placeholder": "Escribe tu respuesta aquí..."}'::jsonb as opciones,
    true as obligatoria,
    4 as orden,
    true as activa,
    6 as id_carrera
FROM categorias_pregunta cp WHERE cp.nombre = 'Metodología de Enseñanza';

INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, activa, id_carrera)
SELECT 
    cp.id as categoria_id,
    '¿Con qué frecuencia el profesor promueve la participación y el análisis crítico en clase?' as texto_pregunta,
    'Pregunta específica para Ingeniería Financiera - Metodología de Enseñanza' as descripcion,
    'rating' as tipo_pregunta,
    '{"type": "scale", "min": 1, "max": 5, "labels": ["Nunca", "Rara vez", "A veces", "Frecuentemente", "Siempre"]}'::jsonb as opciones,
    true as obligatoria,
    5 as orden,
    true as activa,
    6 as id_carrera
FROM categorias_pregunta cp WHERE cp.nombre = 'Metodología de Enseñanza';

INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, activa, id_carrera)
SELECT 
    cp.id as categoria_id,
    'Describe una actividad, proyecto o práctica que haya contribuido a tu aprendizaje en esta materia.' as texto_pregunta,
    'Pregunta específica para Ingeniería Financiera - Evaluación' as descripcion,
    'text' as tipo_pregunta,
    '{"type": "text", "placeholder": "Escribe tu respuesta aquí..."}'::jsonb as opciones,
    true as obligatoria,
    6 as orden,
    true as activa,
    6 as id_carrera
FROM categorias_pregunta cp WHERE cp.nombre = 'Evaluación';

INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, activa, id_carrera)
SELECT 
    cp.id as categoria_id,
    '¿Qué tan útil consideras la retroalimentación del profesor para mejorar tu desempeño académico?' as texto_pregunta,
    'Pregunta específica para Ingeniería Financiera - Evaluación' as descripcion,
    'rating' as tipo_pregunta,
    '{"type": "scale", "min": 1, "max": 5, "labels": ["Muy malo", "Malo", "Regular", "Bueno", "Excelente"]}'::jsonb as opciones,
    true as obligatoria,
    7 as orden,
    true as activa,
    6 as id_carrera
FROM categorias_pregunta cp WHERE cp.nombre = 'Evaluación';

INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, activa, id_carrera)
SELECT 
    cp.id as categoria_id,
    '¿Qué sugerencias podrías dar al docente para fortalecer el proceso de enseñanza-aprendizaje en esta asignatura?' as texto_pregunta,
    'Pregunta específica para Ingeniería Financiera - Metodología de Enseñanza' as descripcion,
    'text' as tipo_pregunta,
    '{"type": "text", "placeholder": "Escribe tu respuesta aquí..."}'::jsonb as opciones,
    true as obligatoria,
    8 as orden,
    true as activa,
    6 as id_carrera
FROM categorias_pregunta cp WHERE cp.nombre = 'Metodología de Enseñanza';

INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, activa, id_carrera)
SELECT 
    cp.id as categoria_id,
    '¿En qué medida el profesor relaciona los contenidos de la clase con problemáticas reales del ámbito financiero?' as texto_pregunta,
    'Pregunta específica para Ingeniería Financiera - Conocimiento del Tema' as descripcion,
    'rating' as tipo_pregunta,
    '{"type": "scale", "min": 1, "max": 5, "labels": ["Muy malo", "Malo", "Regular", "Bueno", "Excelente"]}'::jsonb as opciones,
    true as obligatoria,
    9 as orden,
    true as activa,
    6 as id_carrera
FROM categorias_pregunta cp WHERE cp.nombre = 'Conocimiento del Tema';

INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, activa, id_carrera)
SELECT 
    cp.id as categoria_id,
    '¿Qué tanto sientes que las actividades en clase te ayudan a desarrollar una conciencia ética, responsable y crítica frente a las decisiones financieras y su impacto en la sociedad?' as texto_pregunta,
    'Pregunta específica para Ingeniería Financiera - Disponibilidad' as descripcion,
    'rating' as tipo_pregunta,
    '{"type": "scale", "min": 1, "max": 5, "labels": ["Muy malo", "Malo", "Regular", "Bueno", "Excelente"]}'::jsonb as opciones,
    true as obligatoria,
    10 as orden,
    true as activa,
    6 as id_carrera
FROM categorias_pregunta cp WHERE cp.nombre = 'Disponibilidad';

INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, activa, id_carrera)
SELECT 
    cp.id as categoria_id,
    '¿Cómo describirías el aporte del profesor a tu formación como ingeniero(a) financiero(a)?' as texto_pregunta,
    'Pregunta específica para Ingeniería Financiera - Disponibilidad' as descripcion,
    'text' as tipo_pregunta,
    '{"type": "text", "placeholder": "Escribe tu respuesta aquí..."}'::jsonb as opciones,
    true as obligatoria,
    11 as orden,
    true as activa,
    6 as id_carrera
FROM categorias_pregunta cp WHERE cp.nombre = 'Disponibilidad';

-- =====================================================
-- INGENIERÍA INDUSTRIAL (ID: 7)
-- =====================================================

INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, activa, id_carrera)
SELECT 
    cp.id as categoria_id,
    'Indica tu percepción sobre el respeto, manejo de aula y comunicación del docente con los estudiantes' as texto_pregunta,
    'Pregunta específica para Ingeniería Industrial - Comunicación' as descripcion,
    'rating' as tipo_pregunta,
    '{"type": "scale", "min": 1, "max": 5, "labels": ["Muy deficiente", "Deficiente", "Aceptable", "Buena", "Excelente"]}'::jsonb as opciones,
    true as obligatoria,
    1 as orden,
    true as activa,
    7 as id_carrera
FROM categorias_pregunta cp WHERE cp.nombre = 'Comunicación';

INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, activa, id_carrera)
SELECT 
    cp.id as categoria_id,
    '¿En qué medida el docente cumple y aplica los objetivos planteados al inicio de la asignatura, y qué tan claros resultan durante el desarrollo de las clases?' as texto_pregunta,
    'Pregunta específica para Ingeniería Industrial - Conocimiento del Tema' as descripcion,
    'rating' as tipo_pregunta,
    '{"type": "scale", "min": 1, "max": 5, "labels": ["Muy malo", "Malo", "Regular", "Bueno", "Excelente"]}'::jsonb as opciones,
    true as obligatoria,
    2 as orden,
    true as activa,
    7 as id_carrera
FROM categorias_pregunta cp WHERE cp.nombre = 'Conocimiento del Tema';

INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, activa, id_carrera)
SELECT 
    cp.id as categoria_id,
    '¿Qué tan organizado(a) consideras que es el docente en la secuencia de sus clases?' as texto_pregunta,
    'Pregunta específica para Ingeniería Industrial - Metodología de Enseñanza' as descripcion,
    'rating' as tipo_pregunta,
    '{"type": "scale", "min": 1, "max": 5, "labels": ["Muy malo", "Malo", "Regular", "Bueno", "Excelente"]}'::jsonb as opciones,
    true as obligatoria,
    3 as orden,
    true as activa,
    7 as id_carrera
FROM categorias_pregunta cp WHERE cp.nombre = 'Metodología de Enseñanza';

INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, activa, id_carrera)
SELECT 
    cp.id as categoria_id,
    '¿Qué estrategias o métodos de enseñanza emplea el profesor que te ayudan más a comprender los conceptos técnicos o científicos?' as texto_pregunta,
    'Pregunta específica para Ingeniería Industrial - Metodología de Enseñanza' as descripcion,
    'text' as tipo_pregunta,
    '{"type": "text", "placeholder": "Escribe tu respuesta aquí..."}'::jsonb as opciones,
    true as obligatoria,
    4 as orden,
    true as activa,
    7 as id_carrera
FROM categorias_pregunta cp WHERE cp.nombre = 'Metodología de Enseñanza';

INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, activa, id_carrera)
SELECT 
    cp.id as categoria_id,
    '¿Con qué frecuencia el profesor promueve la participación y el análisis crítico en clase?' as texto_pregunta,
    'Pregunta específica para Ingeniería Industrial - Metodología de Enseñanza' as descripcion,
    'rating' as tipo_pregunta,
    '{"type": "scale", "min": 1, "max": 5, "labels": ["Nunca", "Rara vez", "A veces", "Frecuentemente", "Siempre"]}'::jsonb as opciones,
    true as obligatoria,
    5 as orden,
    true as activa,
    7 as id_carrera
FROM categorias_pregunta cp WHERE cp.nombre = 'Metodología de Enseñanza';

INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, activa, id_carrera)
SELECT 
    cp.id as categoria_id,
    'Describe una actividad, proyecto o práctica que haya contribuido a tu aprendizaje en esta materia.' as texto_pregunta,
    'Pregunta específica para Ingeniería Industrial - Evaluación' as descripcion,
    'text' as tipo_pregunta,
    '{"type": "text", "placeholder": "Escribe tu respuesta aquí..."}'::jsonb as opciones,
    true as obligatoria,
    6 as orden,
    true as activa,
    7 as id_carrera
FROM categorias_pregunta cp WHERE cp.nombre = 'Evaluación';

INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, activa, id_carrera)
SELECT 
    cp.id as categoria_id,
    '¿Qué tan útil consideras la retroalimentación del profesor para mejorar tu desempeño académico?' as texto_pregunta,
    'Pregunta específica para Ingeniería Industrial - Evaluación' as descripcion,
    'rating' as tipo_pregunta,
    '{"type": "scale", "min": 1, "max": 5, "labels": ["Muy malo", "Malo", "Regular", "Bueno", "Excelente"]}'::jsonb as opciones,
    true as obligatoria,
    7 as orden,
    true as activa,
    7 as id_carrera
FROM categorias_pregunta cp WHERE cp.nombre = 'Evaluación';

INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, activa, id_carrera)
SELECT 
    cp.id as categoria_id,
    '¿Qué sugerencias podrías dar al docente para fortalecer el proceso de enseñanza-aprendizaje en esta asignatura?' as texto_pregunta,
    'Pregunta específica para Ingeniería Industrial - Metodología de Enseñanza' as descripcion,
    'text' as tipo_pregunta,
    '{"type": "text", "placeholder": "Escribe tu respuesta aquí..."}'::jsonb as opciones,
    true as obligatoria,
    8 as orden,
    true as activa,
    7 as id_carrera
FROM categorias_pregunta cp WHERE cp.nombre = 'Metodología de Enseñanza';

INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, activa, id_carrera)
SELECT 
    cp.id as categoria_id,
    '¿En qué medida el profesor relaciona los contenidos de la clase con problemáticas reales de la Ingeniería Industrial?' as texto_pregunta,
    'Pregunta específica para Ingeniería Industrial - Conocimiento del Tema' as descripcion,
    'rating' as tipo_pregunta,
    '{"type": "scale", "min": 1, "max": 5, "labels": ["Muy malo", "Malo", "Regular", "Bueno", "Excelente"]}'::jsonb as opciones,
    true as obligatoria,
    9 as orden,
    true as activa,
    7 as id_carrera
FROM categorias_pregunta cp WHERE cp.nombre = 'Conocimiento del Tema';

INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, activa, id_carrera)
SELECT 
    cp.id as categoria_id,
    '¿Qué tanto sientes que las actividades en clase te ayudan a desarrollar una conciencia sobre la mejora continua, la eficiencia y el impacto social de los procesos industriales?' as texto_pregunta,
    'Pregunta específica para Ingeniería Industrial - Disponibilidad' as descripcion,
    'rating' as tipo_pregunta,
    '{"type": "scale", "min": 1, "max": 5, "labels": ["Muy malo", "Malo", "Regular", "Bueno", "Excelente"]}'::jsonb as opciones,
    true as obligatoria,
    10 as orden,
    true as activa,
    7 as id_carrera
FROM categorias_pregunta cp WHERE cp.nombre = 'Disponibilidad';

INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, activa, id_carrera)
SELECT 
    cp.id as categoria_id,
    '¿Cómo describirías el aporte del profesor a tu formación como ingeniero(a) industrial?' as texto_pregunta,
    'Pregunta específica para Ingeniería Industrial - Disponibilidad' as descripcion,
    'text' as tipo_pregunta,
    '{"type": "text", "placeholder": "Escribe tu respuesta aquí..."}'::jsonb as opciones,
    true as obligatoria,
    11 as orden,
    true as activa,
    7 as id_carrera
FROM categorias_pregunta cp WHERE cp.nombre = 'Disponibilidad';

-- =====================================================
-- VERIFICACIÓN FINAL
-- =====================================================

-- Verificar que todas las carreras tienen preguntas
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

-- Verificar que todas las categorías están representadas
SELECT 
    cp.nombre as categoria,
    COUNT(pe.id) as total_preguntas,
    COUNT(CASE WHEN pe.activa = true THEN 1 END) as preguntas_activas
FROM categorias_pregunta cp
LEFT JOIN preguntas_evaluacion pe ON cp.id = pe.categoria_id
GROUP BY cp.id, cp.nombre
ORDER BY cp.orden;

-- Mensaje de finalización
SELECT 
    '✅ CARRERAS RESTANTES COMPLETADAS' as estado,
    'Se han insertado preguntas para todas las carreras' as resultado,
    'Ingeniería de Energías, Telecomunicaciones, Financiera e Industrial' as carreras_agregadas;
