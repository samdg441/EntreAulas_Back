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

-- Ejemplo: ajusta las fechas reales de la evaluación del periodo vigente.
UPDATE periodos_academicos
SET fecha_inicio_evaluacion = '2026-09-28',
    fecha_fin_evaluacion = '2026-10-09'
WHERE ano = 2026 AND semestre = 1;
