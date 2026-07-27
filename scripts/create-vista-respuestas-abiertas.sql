-- Vista SQL para respuestas abiertas válidas con información de carrera y profesor
-- Esta vista facilita las consultas de análisis de IA ya que centraliza todos los filtros

CREATE OR REPLACE VIEW vista_respuestas_abiertas_validas AS
SELECT 
  c.id AS carrera_id,
  c.nombre AS carrera_nombre,
  p.id AS profesor_id,
  e.id AS evaluacion_id,
  e.periodo_id,
  e.grupo_id,
  re.id AS respuesta_id,
  re.respuesta_texto,
  re.respuesta_rating
FROM evaluaciones e
INNER JOIN profesores p ON p.id = e.profesor_id
INNER JOIN carreras c ON c.id = p.carrera_id
INNER JOIN respuestas_evaluacion re ON re.evaluacion_id = e.id
WHERE 
  re.respuesta_texto IS NOT NULL
  AND TRIM(re.respuesta_texto) <> ''
  AND LENGTH(TRIM(re.respuesta_texto)) > 3;

-- Índices para mejorar el rendimiento de las consultas
CREATE INDEX IF NOT EXISTS idx_evaluaciones_carrera_id ON evaluaciones(carrera_id);
CREATE INDEX IF NOT EXISTS idx_evaluaciones_profesor_id ON evaluaciones(profesor_id);
CREATE INDEX IF NOT EXISTS idx_evaluaciones_periodo_id ON evaluaciones(periodo_id);
CREATE INDEX IF NOT EXISTS idx_respuestas_evaluacion_id ON respuestas_evaluacion(evaluacion_id);
CREATE INDEX IF NOT EXISTS idx_respuestas_texto ON respuestas_evaluacion(respuesta_texto) 
WHERE respuesta_texto IS NOT NULL;

-- Comentarios para documentación
COMMENT ON VIEW vista_respuestas_abiertas_validas IS 
'Vista que devuelve todas las respuestas abiertas válidas (no nulas, no vacías, > 3 caracteres) 
con información de carrera, profesor y evaluación. Facilita las consultas de análisis de IA.';

COMMENT ON COLUMN vista_respuestas_abiertas_validas.carrera_id IS 'ID de la carrera del profesor';
COMMENT ON COLUMN vista_respuestas_abiertas_validas.carrera_nombre IS 'Nombre de la carrera';
COMMENT ON COLUMN vista_respuestas_abiertas_validas.profesor_id IS 'ID del profesor evaluado';
COMMENT ON COLUMN vista_respuestas_abiertas_validas.evaluacion_id IS 'ID de la evaluación';
COMMENT ON COLUMN vista_respuestas_abiertas_validas.periodo_id IS 'ID del período académico';
COMMENT ON COLUMN vista_respuestas_abiertas_validas.grupo_id IS 'ID del grupo';
COMMENT ON COLUMN vista_respuestas_abiertas_validas.respuesta_id IS 'ID de la respuesta';
COMMENT ON COLUMN vista_respuestas_abiertas_validas.respuesta_texto IS 'Texto de la respuesta (ya filtrado para ser válido)';
COMMENT ON COLUMN vista_respuestas_abiertas_validas.respuesta_rating IS 'Calificación numérica si existe';

