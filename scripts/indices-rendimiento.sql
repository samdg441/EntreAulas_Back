-- Índices para las consultas que más usa el backend (reportes, listado de docentes, autenticación).
-- Ejecutar una vez en Supabase → SQL Editor. Es idempotente: IF NOT EXISTS no duplica ni borra nada.
-- Los nombres que ya aparecen en otros scripts (idx_respuestas_evaluacion_id, idx_usuario_roles_usuario_id,
-- idx_coordinadores_usuario_id) se repiten a propósito para no crear un segundo índice igual.

-- Reportes de coordinador y decano: evaluaciones completadas de N docentes en un rango de fechas.
CREATE INDEX IF NOT EXISTS idx_evaluaciones_profesor_completada_fecha
  ON evaluaciones (profesor_id, completada, fecha_creacion);

-- Panel del estudiante: sus evaluaciones y la verificación de "ya evaluaste a este docente".
CREATE INDEX IF NOT EXISTS idx_evaluaciones_estudiante_id ON evaluaciones (estudiante_id);

-- Filtro por grupo en reportes y resúmenes con IA.
CREATE INDEX IF NOT EXISTS idx_evaluaciones_grupo_id ON evaluaciones (grupo_id);

-- Categorías del reporte: respuestas de cientos de evaluaciones a la vez.
CREATE INDEX IF NOT EXISTS idx_respuestas_evaluacion_id ON respuestas_evaluacion (evaluacion_id);

-- Materias del estudiante y tasa de respuesta (inscritos por grupo).
CREATE INDEX IF NOT EXISTS idx_inscripciones_estudiante_activa ON inscripciones (estudiante_id, activa);
CREATE INDEX IF NOT EXISTS idx_inscripciones_grupo_id ON inscripciones (grupo_id);

-- Docente ↔ curso ↔ grupo: listado de docentes, grupos para evaluar y QR.
CREATE INDEX IF NOT EXISTS idx_asignaciones_profesor_profesor_id ON asignaciones_profesor (profesor_id);
CREATE INDEX IF NOT EXISTS idx_asignaciones_profesor_grupo_id ON asignaciones_profesor (grupo_id);
CREATE INDEX IF NOT EXISTS idx_asignaciones_profesor_curso_id ON asignaciones_profesor (curso_id);

CREATE INDEX IF NOT EXISTS idx_grupos_curso_id ON grupos (curso_id);
CREATE INDEX IF NOT EXISTS idx_cursos_carrera_id ON cursos (carrera_id);

-- Profesores de una carrera (coordinador/decano) y búsqueda del perfil por usuario.
CREATE INDEX IF NOT EXISTS idx_profesores_carrera_id ON profesores (carrera_id);
CREATE INDEX IF NOT EXISTS idx_profesores_usuario_id ON profesores (usuario_id);
CREATE INDEX IF NOT EXISTS idx_estudiantes_usuario_id ON estudiantes (usuario_id);

-- Cada petición autenticada consulta los roles del usuario.
CREATE INDEX IF NOT EXISTS idx_usuario_roles_usuario_id ON usuario_roles (usuario_id);
CREATE INDEX IF NOT EXISTS idx_coordinadores_usuario_id ON coordinadores (usuario_id);

-- QR: apertura por token y QR activos de varios grupos.
CREATE INDEX IF NOT EXISTS idx_qr_evaluaciones_token ON qr_evaluaciones (token);
CREATE INDEX IF NOT EXISTS idx_qr_evaluaciones_grupo_activo ON qr_evaluaciones (grupo_id, activo);

-- Actualiza las estadísticas para que el planificador use los índices de inmediato.
ANALYZE evaluaciones;
ANALYZE respuestas_evaluacion;
ANALYZE inscripciones;
ANALYZE asignaciones_profesor;
ANALYZE grupos;
ANALYZE profesores;
ANALYZE usuario_roles;
ANALYZE qr_evaluaciones;
