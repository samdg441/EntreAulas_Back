-- Ventana de evaluación por periodo académico (la usa el calendario del front).
-- Ejecutar una vez en Supabase: SQL Editor → New query → pegar → Run.

ALTER TABLE periodos_academicos
  ADD COLUMN IF NOT EXISTS fecha_inicio_evaluacion DATE,
  ADD COLUMN IF NOT EXISTS fecha_fin_evaluacion DATE;

ALTER TABLE periodos_academicos
  DROP CONSTRAINT IF EXISTS periodos_evaluacion_rango;

ALTER TABLE periodos_academicos
  ADD CONSTRAINT periodos_evaluacion_rango CHECK (
    fecha_inicio_evaluacion IS NULL
    OR fecha_fin_evaluacion IS NULL
    OR fecha_fin_evaluacion >= fecha_inicio_evaluacion
  );

-- La ventana de ejemplo se escribe en el periodo de la fecha de hoy:
-- enero–junio → año-1, julio–diciembre → año-2.
-- Cambia las dos fechas por las reales de la evaluación antes de ejecutar.
UPDATE periodos_academicos
SET fecha_inicio_evaluacion = '2026-09-28',
    fecha_fin_evaluacion = '2026-10-09'
WHERE ano = EXTRACT(YEAR FROM CURRENT_DATE)::int
  AND semestre = CASE
    WHEN EXTRACT(MONTH FROM CURRENT_DATE) <= 6 THEN 1
    ELSE 2
  END;
