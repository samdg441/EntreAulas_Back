-- Vista de auditoría del coordinador: registro de acciones por carrera.
-- Ejecutar una vez en el editor SQL de Supabase. Es idempotente.
CREATE TABLE IF NOT EXISTS auditoria_eventos (
  id           BIGSERIAL PRIMARY KEY,
  actor_id     TEXT        NOT NULL,
  actor_nombre TEXT        NOT NULL DEFAULT '',
  actor_rol    TEXT        NOT NULL DEFAULT '',
  accion       TEXT        NOT NULL,
  entidad      TEXT        NOT NULL DEFAULT '',
  entidad_id   TEXT,
  carrera_id   INTEGER,
  detalle      TEXT        NOT NULL DEFAULT '',
  creado_en    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auditoria_carrera_fecha
  ON auditoria_eventos (carrera_id, creado_en DESC);

-- Solo el backend (service role) lee y escribe; ningún rol público.
ALTER TABLE auditoria_eventos ENABLE ROW LEVEL SECURITY;
