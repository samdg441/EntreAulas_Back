-- =====================================================
-- Preguntas encuesta EntreAulas - Versión nueva (13 preguntas)
-- Ingeniería de Sistemas (id_carrera obtenido por nombre)
-- Reemplaza completamente las preguntas anteriores de EntreAulas
-- para esta carrera.
-- =====================================================

DO $$
DECLARE
  active_col TEXT;
  carrera_id INTEGER;
BEGIN
  -- Obtener id de la carrera Ingeniería de Sistemas (evita error si id no es 1)
  SELECT id INTO carrera_id
  FROM carreras
  WHERE nombre ILIKE '%Ingeniería de Sistemas%' OR nombre ILIKE '%Ingenieria de Sistemas%'
  LIMIT 1;

  IF carrera_id IS NULL THEN
    RAISE EXCEPTION 'No se encontró la carrera "Ingeniería de Sistemas" en la tabla carreras. Crea la carrera o ajusta el nombre en este script.';
  END IF;

  -- Eliminar preguntas anteriores de EntreAulas para esta carrera
  DELETE FROM preguntas_evaluacion
  WHERE id_carrera = carrera_id;

  -- Detectar si la columna de estado se llama "activo" o "activa"
  active_col := CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'preguntas_evaluacion' AND column_name = 'activo'
    ) THEN 'activo'
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'preguntas_evaluacion' AND column_name = 'activa'
    ) THEN 'activa'
    ELSE NULL
  END;

  IF active_col IS NULL THEN
    RAISE EXCEPTION 'No existe columna activo/activa en preguntas_evaluacion';
  END IF;

  -- 1. Percepción respeto, manejo del grupo y comunicación (escala gráfica)
  EXECUTE format($f$
    INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, %I, id_carrera)
    SELECT
        cp.id,
        %L AS texto_pregunta,
        %L AS descripcion,
        'rating' AS tipo_pregunta,
        jsonb_build_object(
            'type', 'scale',
            'min', 1,
            'max', 5,
            'labels', to_jsonb(ARRAY['Muy deficiente', 'Deficiente', 'Aceptable', 'Buena', 'Excelente'])
        ) AS opciones,
        true, 1, true, %s
    FROM categorias_pregunta cp WHERE cp.nombre = 'Comunicación' LIMIT 1;
  $f$, active_col,
    'Tu percepción sobre el respeto, el manejo del grupo y la comunicación del profesor con los estudiantes:',
    'Escala gráfica: Muy deficiente – Deficiente – Aceptable – Buena – Excelente',
    carrera_id
  );

  -- 2. Seguimiento lineamientos y secuencia temática (escala 1 a 5)
  EXECUTE format($f$
    INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, %I, id_carrera)
    SELECT
        cp.id,
        %L AS texto_pregunta,
        %L AS descripcion,
        'rating' AS tipo_pregunta,
        jsonb_build_object(
            'type', 'scale',
            'min', 1,
            'max', 5,
            'labels', to_jsonb(ARRAY['En muy baja medida', 'En baja medida', 'En alguna medida', 'En alta medida', 'En muy alta medida'])
        ) AS opciones,
        true, 2, true, %s
    FROM categorias_pregunta cp WHERE cp.nombre = 'Conocimiento del Tema' LIMIT 1;
  $f$, active_col,
    '¿En qué medida el profesor sigue los lineamientos y secuencia temática (clase a clase) del microcurrículo definidos al inicio de la asignatura, y qué tan claros resultan durante las clases?',
    'Escala de 1 a 5: En muy baja medida – En muy alta medida',
    carrera_id
  );

  -- 3. Pertinencia y suficiencia de estrategias de enseñanza (escala 1 a 5)
  EXECUTE format($f$
    INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, %I, id_carrera)
    SELECT
        cp.id,
        %L AS texto_pregunta,
        %L AS descripcion,
        'rating' AS tipo_pregunta,
        jsonb_build_object(
            'type', 'scale',
            'min', 1,
            'max', 5,
            'labels', to_jsonb(ARRAY['En muy baja medida', 'En baja medida', 'En alguna medida', 'En alta medida', 'En muy alta medida'])
        ) AS opciones,
        true, 3, true, %s
    FROM categorias_pregunta cp WHERE cp.nombre = 'Metodología de Enseñanza' LIMIT 1;
  $f$, active_col,
    '¿Consideras que las estrategias o métodos de enseñanza que emplea el profesor en el aula son pertinentes y suficientes para comprender los conceptos técnicos o teóricos?',
    'Escala de 1 a 5: En muy baja medida – En muy alta medida',
    carrera_id
  );

  -- 4. Frecuencia de participación y análisis crítico (frecuencia)
  EXECUTE format($f$
    INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, %I, id_carrera)
    SELECT
        cp.id,
        %L AS texto_pregunta,
        %L AS descripcion,
        'rating' AS tipo_pregunta,
        jsonb_build_object(
            'type', 'scale',
            'min', 1,
            'max', 5,
            'labels', to_jsonb(ARRAY['Nunca', 'Rara vez', 'A veces', 'Frecuentemente', 'Siempre'])
        ) AS opciones,
        true, 4, true, %s
    FROM categorias_pregunta cp WHERE cp.nombre = 'Metodología de Enseñanza' LIMIT 1;
  $f$, active_col,
    '¿Con qué frecuencia el profesor promueve la participación y el análisis crítico durante las clases?',
    'Escala: Nunca – Rara vez – A veces – Frecuentemente – Siempre',
    carrera_id
  );

  -- 5. Utilidad de la realimentación (escala 1 a 5)
  EXECUTE format($f$
    INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, %I, id_carrera)
    SELECT
        cp.id,
        %L AS texto_pregunta,
        %L AS descripcion,
        'rating' AS tipo_pregunta,
        jsonb_build_object(
            'type', 'scale',
            'min', 1,
            'max', 5,
            'labels', to_jsonb(ARRAY['Muy poco útil', 'Poco útil', 'Regular', 'Útil', 'Muy útil'])
        ) AS opciones,
        true, 5, true, %s
    FROM categorias_pregunta cp WHERE cp.nombre = 'Evaluación' LIMIT 1;
  $f$, active_col,
    '¿Qué tan útil es la realimentación del profesor para mejorar tu desempeño académico?',
    'Escala de 1 a 5',
    carrera_id
  );

  -- 6. Relación con problemáticas reales de Ingeniería de Sistemas (escala 1 a 5)
  EXECUTE format($f$
    INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, %I, id_carrera)
    SELECT
        cp.id,
        %L AS texto_pregunta,
        %L AS descripcion,
        'rating' AS tipo_pregunta,
        jsonb_build_object(
            'type', 'scale',
            'min', 1,
            'max', 5,
            'labels', to_jsonb(ARRAY['En muy baja medida', 'En baja medida', 'En alguna medida', 'En alta medida', 'En muy alta medida'])
        ) AS opciones,
        true, 6, true, %s
    FROM categorias_pregunta cp WHERE cp.nombre = 'Conocimiento del Tema' LIMIT 1;
  $f$, active_col,
    '¿En qué medida el profesor relaciona los contenidos del curso con problemáticas reales del campo de la Ingeniería de Sistemas (por ejemplo, ciberseguridad, inteligencia artificial, desarrollo sostenible o transformación digital)?',
    'Escala de 1 a 5',
    carrera_id
  );

  -- 7. Conciencia ética y social (escala 1 a 5)
  EXECUTE format($f$
    INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, %I, id_carrera)
    SELECT
        cp.id,
        %L AS texto_pregunta,
        %L AS descripcion,
        'rating' AS tipo_pregunta,
        jsonb_build_object(
            'type', 'scale',
            'min', 1,
            'max', 5,
            'labels', to_jsonb(ARRAY['En muy baja medida', 'En baja medida', 'En alguna medida', 'En alta medida', 'En muy alta medida'])
        ) AS opciones,
        true, 7, true, %s
    FROM categorias_pregunta cp WHERE cp.nombre = 'Disponibilidad' LIMIT 1;
  $f$, active_col,
    '¿En qué medida las actividades desarrolladas en clase contribuyen a fortalecer tu conciencia ética y social sobre el uso de la tecnología y la información?',
    'Escala de 1 a 5',
    carrera_id
  );

  -- 8. Cumplimiento de horarios y asesorías (escala 1 a 5)
  EXECUTE format($f$
    INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, %I, id_carrera)
    SELECT
        cp.id,
        %L AS texto_pregunta,
        %L AS descripcion,
        'rating' AS tipo_pregunta,
        jsonb_build_object(
            'type', 'scale',
            'min', 1,
            'max', 5,
            'labels', to_jsonb(ARRAY['En muy baja medida', 'En baja medida', 'En alguna medida', 'En alta medida', 'En muy alta medida'])
        ) AS opciones,
        true, 8, true, %s
    FROM categorias_pregunta cp WHERE cp.nombre = 'Disponibilidad' LIMIT 1;
  $f$, active_col,
    '¿El profesor cumple adecuadamente con los horarios establecidos para las clases y con la atención a estudiantes en los espacios de asesoría programados?',
    'Escala de 1 a 5',
    carrera_id
  );

  -- 9. Claridad y pertinencia de pruebas/evaluaciones (escala 1 a 5)
  EXECUTE format($f$
    INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, %I, id_carrera)
    SELECT
        cp.id,
        %L AS texto_pregunta,
        %L AS descripcion,
        'rating' AS tipo_pregunta,
        jsonb_build_object(
            'type', 'scale',
            'min', 1,
            'max', 5,
            'labels', to_jsonb(ARRAY['En muy baja medida', 'En baja medida', 'En alguna medida', 'En alta medida', 'En muy alta medida'])
        ) AS opciones,
        true, 9, true, %s
    FROM categorias_pregunta cp WHERE cp.nombre = 'Evaluación' LIMIT 1;
  $f$, active_col,
    '¿Las pruebas/evaluaciones aplicadas son claras y pertinentes respecto a los contenidos del curso, y tienen una duración adecuada?',
    'Escala de 1 a 5',
    carrera_id
  );

  -- 10. Oportunidad en entrega de resultados (escala 1 a 5)
  EXECUTE format($f$
    INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, %I, id_carrera)
    SELECT
        cp.id,
        %L AS texto_pregunta,
        %L AS descripcion,
        'rating' AS tipo_pregunta,
        jsonb_build_object(
            'type', 'scale',
            'min', 1,
            'max', 5,
            'labels', to_jsonb(ARRAY['En muy baja medida', 'En baja medida', 'En alguna medida', 'En alta medida', 'En muy alta medida'])
        ) AS opciones,
        true, 10, true, %s
    FROM categorias_pregunta cp WHERE cp.nombre = 'Evaluación' LIMIT 1;
  $f$, active_col,
    '¿El profesor entrega los resultados de las pruebas/evaluaciones en un tiempo oportuno?',
    'Escala de 1 a 5',
    carrera_id
  );

  -- 11. Dominio del tema y claridad en la explicación (escala 1 a 5)
  EXECUTE format($f$
    INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, %I, id_carrera)
    SELECT
        cp.id,
        %L AS texto_pregunta,
        %L AS descripcion,
        'rating' AS tipo_pregunta,
        jsonb_build_object(
            'type', 'scale',
            'min', 1,
            'max', 5,
            'labels', to_jsonb(ARRAY['En muy baja medida', 'En baja medida', 'En alguna medida', 'En alta medida', 'En muy alta medida'])
        ) AS opciones,
        true, 11, true, %s
    FROM categorias_pregunta cp WHERE cp.nombre = 'Conocimiento del Tema' LIMIT 1;
  $f$, active_col,
    '¿El profesor demuestra dominio de los temas del curso y claridad en su explicación?',
    'Escala de 1 a 5',
    carrera_id
  );

  -- 12. Ambiente de respeto, inclusión, diversidad y equidad (escala 1 a 5)
  EXECUTE format($f$
    INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, %I, id_carrera)
    SELECT
        cp.id,
        %L AS texto_pregunta,
        %L AS descripcion,
        'rating' AS tipo_pregunta,
        jsonb_build_object(
            'type', 'scale',
            'min', 1,
            'max', 5,
            'labels', to_jsonb(ARRAY['En muy baja medida', 'En baja medida', 'En alguna medida', 'En alta medida', 'En muy alta medida'])
        ) AS opciones,
        true, 12, true, %s
    FROM categorias_pregunta cp WHERE cp.nombre = 'Comunicación' LIMIT 1;
  $f$, active_col,
    '¿Durante el desarrollo del curso, el profesor promueve un ambiente de respeto, inclusión, diversidad y equidad, evitando comentarios o conductas que puedan resultar inapropiadas o generar incomodidad en los estudiantes?',
    'Escala de 1 a 5',
    carrera_id
  );

  -- 13. Pregunta abierta de sugerencias
  EXECUTE format($f$
    INSERT INTO preguntas_evaluacion (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, %I, id_carrera)
    SELECT
        cp.id,
        %L AS texto_pregunta,
        %L AS descripcion,
        'text' AS tipo_pregunta,
        jsonb_build_object(
            'type', 'text',
            'placeholder', 'Escribe tu respuesta aquí...'
        ) AS opciones,
        true, 13, true, %s
    FROM categorias_pregunta cp WHERE cp.nombre = 'Metodología de Enseñanza' LIMIT 1;
  $f$, active_col,
    '¿Qué sugerencias le darías al profesor para fortalecer el proceso de enseñanza-aprendizaje en esta asignatura? (considera aspectos como: apoyos concretos, formas de evaluación, metodologías, motivación para participar o mejoras en la experiencia de aprendizaje)',
    'Pregunta abierta',
    carrera_id
  );
END $$;

SELECT 'Preguntas EntreAulas (nueva versión, 13 preguntas) insertadas correctamente.' AS resultado;

