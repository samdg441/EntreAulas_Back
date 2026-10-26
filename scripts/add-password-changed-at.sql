-- DEF-42 — Revocar las sesiones (JWT) emitidas antes de restablecer la contraseña.
-- El back compara el `iat` del token contra esta columna en authenticateToken y en GET /api/auth/me.
-- Ejecutar una vez en Supabase (SQL Editor) antes de desplegar la versión refactorizada.
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN usuarios.password_changed_at IS
  'Último cambio de contraseña (reset-password). Los JWT con iat anterior se rechazan.';
