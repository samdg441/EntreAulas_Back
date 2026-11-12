-- Encuesta final docente.
-- Copia la estructura de la evaluación temprana (13 preguntas, mismas escalas)
-- con textos generales y sin carrera (id_carrera NULL = todas las carreras).
-- No modifica las preguntas de la encuesta temprana.
-- SQL Editor de Supabase → New query → pegar → Run.
-- Si se ejecuta otra vez, reemplaza solo las preguntas de esta encuesta.

DO $$
DECLARE
  active_col TEXT;
  encuesta_id INTEGER;
  siguiente_orden INTEGER;
BEGIN
  SELECT COALESCE(MAX(orden), 0) + 1 INTO siguiente_orden FROM categorias_pregunta;

  INSERT INTO categorias_pregunta (nombre, descripcion, orden, activa)
  VALUES (
    'Encuesta final docente',
    'Evaluación de cierre del curso, con preguntas generales para todas las carreras.',
    siguiente_orden,
    true
  )
  ON CONFLICT (nombre) DO NOTHING;

  SELECT id INTO encuesta_id
  FROM categorias_pregunta
  WHERE nombre = 'Encuesta final docente'
  LIMIT 1;

  IF encuesta_id IS NULL THEN
    RAISE EXCEPTION 'No se pudo crear la encuesta final docente.';
  END IF;

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

  DELETE FROM preguntas_evaluacion WHERE categoria_id = encuesta_id;

  EXECUTE format($f$
    INSERT INTO preguntas_evaluacion
      (categoria_id, texto_pregunta, descripcion, tipo_pregunta, opciones, obligatoria, orden, %I, id_carrera)
    VALUES
      ($1, '¿Cómo valoras el respeto, el manejo del grupo y la comunicación del profesor con los estudiantes durante el curso?',
        'Escala: Muy deficiente – Excelente', 'rating',
        jsonb_build_object('type','scale','min',1,'max',5,'labels', to_jsonb(ARRAY['Muy deficiente','Deficiente','Aceptable','Buena','Excelente'])),
        true, 1, true, NULL),
      ($1, '¿En qué medida el profesor desarrolla los temas de la asignatura de forma clara y ordenada?',
        'Escala de 1 a 5', 'rating',
        jsonb_build_object('type','scale','min',1,'max',5,'labels', to_jsonb(ARRAY['En muy baja medida','En baja medida','En alguna medida','En alta medida','En muy alta medida'])),
        true, 2, true, NULL),
      ($1, '¿Las estrategias de enseñanza del profesor te ayudan a comprender los temas de la asignatura?',
        'Escala de 1 a 5', 'rating',
        jsonb_build_object('type','scale','min',1,'max',5,'labels', to_jsonb(ARRAY['En muy baja medida','En baja medida','En alguna medida','En alta medida','En muy alta medida'])),
        true, 3, true, NULL),
      ($1, '¿Con qué frecuencia el profesor promueve la participación y el análisis durante las clases?',
        'Escala: Nunca – Siempre', 'rating',
        jsonb_build_object('type','scale','min',1,'max',5,'labels', to_jsonb(ARRAY['Nunca','Rara vez','A veces','Frecuentemente','Siempre'])),
        true, 4, true, NULL),
      ($1, '¿Qué tan útil es la retroalimentación del profesor para mejorar tu aprendizaje?',
        'Escala de 1 a 5', 'rating',
        jsonb_build_object('type','scale','min',1,'max',5,'labels', to_jsonb(ARRAY['Muy poco útil','Poco útil','Regular','Útil','Muy útil'])),
        true, 5, true, NULL),
      ($1, '¿En qué medida el profesor relaciona los contenidos del curso con situaciones reales de tu campo de estudio?',
        'Escala de 1 a 5', 'rating',
        jsonb_build_object('type','scale','min',1,'max',5,'labels', to_jsonb(ARRAY['En muy baja medida','En baja medida','En alguna medida','En alta medida','En muy alta medida'])),
        true, 6, true, NULL),
      ($1, '¿En qué medida las actividades de clase te ayudan a reflexionar sobre el impacto ético y social de lo que aprendes?',
        'Escala de 1 a 5', 'rating',
        jsonb_build_object('type','scale','min',1,'max',5,'labels', to_jsonb(ARRAY['En muy baja medida','En baja medida','En alguna medida','En alta medida','En muy alta medida'])),
        true, 7, true, NULL),
      ($1, '¿El profesor cumple con los horarios de clase y atiende a los estudiantes en los espacios de asesoría?',
        'Escala de 1 a 5', 'rating',
        jsonb_build_object('type','scale','min',1,'max',5,'labels', to_jsonb(ARRAY['En muy baja medida','En baja medida','En alguna medida','En alta medida','En muy alta medida'])),
        true, 8, true, NULL),
      ($1, '¿Las evaluaciones son claras, corresponden a los contenidos del curso y tienen un tiempo adecuado?',
        'Escala de 1 a 5', 'rating',
        jsonb_build_object('type','scale','min',1,'max',5,'labels', to_jsonb(ARRAY['En muy baja medida','En baja medida','En alguna medida','En alta medida','En muy alta medida'])),
        true, 9, true, NULL),
      ($1, '¿El profesor entrega a tiempo los resultados de las evaluaciones?',
        'Escala de 1 a 5', 'rating',
        jsonb_build_object('type','scale','min',1,'max',5,'labels', to_jsonb(ARRAY['En muy baja medida','En baja medida','En alguna medida','En alta medida','En muy alta medida'])),
        true, 10, true, NULL),
      ($1, '¿El profesor domina los temas del curso y los explica con claridad?',
        'Escala de 1 a 5', 'rating',
        jsonb_build_object('type','scale','min',1,'max',5,'labels', to_jsonb(ARRAY['En muy baja medida','En baja medida','En alguna medida','En alta medida','En muy alta medida'])),
        true, 11, true, NULL),
      ($1, '¿El profesor mantiene un ambiente de respeto, inclusión y equidad durante el curso?',
        'Escala de 1 a 5', 'rating',
        jsonb_build_object('type','scale','min',1,'max',5,'labels', to_jsonb(ARRAY['En muy baja medida','En baja medida','En alguna medida','En alta medida','En muy alta medida'])),
        true, 12, true, NULL),
      ($1, '¿Qué sugerencias le darías al profesor para mejorar la enseñanza en esta asignatura?',
        'Pregunta abierta', 'text',
        jsonb_build_object('type','text','placeholder','Escribe tu respuesta aquí...'),
        true, 13, true, NULL)
  $f$, active_col) USING encuesta_id;
END $$;

SELECT pe.orden, pe.texto_pregunta
FROM preguntas_evaluacion pe
JOIN categorias_pregunta cp ON cp.id = pe.categoria_id
WHERE cp.nombre = 'Encuesta final docente'
ORDER BY pe.orden;
