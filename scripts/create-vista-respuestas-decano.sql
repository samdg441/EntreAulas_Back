-- Vista SQL para respuestas abiertas válidas para el decano
-- Esta vista facilita las consultas del decano ya que centraliza todos los filtros y JOINs
-- Incluye información de carrera, profesor y período para facilitar el análisis

CREATE OR REPLACE VIEW vista_respuestas_decano AS
SELECT 
  c.id AS carrera_id,
  c.nombre AS carrera_nombre,
  p.id AS profesor_id,
  e.id AS evaluacion_id,
  e.periodo_id,
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

-- Comentarios para documentación
COMMENT ON VIEW vista_respuestas_decano IS 
'Vista que devuelve todas las respuestas abiertas válidas (no nulas, no vacías, > 3 caracteres) 
con información de carrera, profesor y evaluación para el análisis del decano de la facultad.';

COMMENT ON COLUMN vista_respuestas_decano.carrera_id IS 'ID de la carrera del profesor';
COMMENT ON COLUMN vista_respuestas_decano.carrera_nombre IS 'Nombre de la carrera';
COMMENT ON COLUMN vista_respuestas_decano.profesor_id IS 'ID del profesor evaluado';
COMMENT ON COLUMN vista_respuestas_decano.evaluacion_id IS 'ID de la evaluación';
COMMENT ON COLUMN vista_respuestas_decano.periodo_id IS 'ID del período académico';
COMMENT ON COLUMN vista_respuestas_decano.respuesta_id IS 'ID de la respuesta';
COMMENT ON COLUMN vista_respuestas_decano.respuesta_texto IS 'Texto de la respuesta (ya filtrado para ser válido)';
COMMENT ON COLUMN vista_respuestas_decano.respuesta_rating IS 'Calificación numérica si existe';

