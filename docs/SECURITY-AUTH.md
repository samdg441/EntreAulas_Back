# Autenticación y autorización (JWT)

## Backend

- **Login / registro:** `POST /api/auth/login`, `POST /api/auth/register` — contraseñas con **bcrypt** (ver `auth-supabase.ts`).
- **Token:** enviar `Authorization: Bearer <jwt>` en cada petición protegida.
- **Middleware:**
  - `authenticateToken` / `requireAuth` — valida JWT, usuario activo en BD y adjunta `req.user` (roles y permisos desde `RoleService`).
  - `requireRole(['admin', ...])` — **403** si el rol no coincide.
  - `requirePermission('...')` — **403** si falta el permiso.
- **Códigos HTTP:** **401** = no autenticado o token inválido/expirado; **403** = autenticado pero sin permiso de rol/recurso.
- **Rutas de ejemplo:**
  - `GET /api/auth/profile` — cualquier usuario autenticado.
  - `GET /api/users` — solo **admin**.
  - `POST /api/auth/create-user` — solo **admin** (antes era público).

## Frontend

- **Token:** `localStorage` + interceptor en `api/client.ts` que añade el header y ante **401** limpia sesión y redirige a login.
- **`ProtectedRoute`:** exige sesión; prop opcional `allowedRoles` para redirigir a `/forbidden` si el rol no aplica.
- **403:** no borra el token; la pantalla puede mostrar error o usar `/forbidden`.

## Variables de entorno

- `JWT_SECRET` — obligatorio en producción (valor largo y aleatorio).
- `CORS_ORIGIN` — origen del frontend en producción.
- `BCRYPT_SALT_ROUNDS` — opcional (por defecto 12).
- `ALLOW_LEGACY_PLAINTEXT_LOGIN` — solo migración; si no es `true`, solo se aceptan hashes bcrypt en login.
- `PASSWORD_RESET_DEBUG_RESPONSE` — nunca en producción; si es `true` y `NODE_ENV !== 'production'`, el forgot-password puede devolver el token en JSON (solo para pruebas locales).
- `FRONTEND_URL` — origen del frontend para armar el enlace de recuperación.
- SMTP (`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`) — envío del correo de recuperación.

## Recuperación de contraseña

- `POST /api/auth/forgot-password` — no revela si el correo existe; el token se guarda **hasheado** (SHA-256) en `password_reset_tokens` y caduca en 1 hora.
- `POST /api/auth/reset-password` — valida token (inválido / expirado / ya usado), actualiza la contraseña con **bcrypt** y revoca el token.

## Contraseñas

- Registro y creación de usuario por admin: mínimo **8** caracteres en registro/admin create; hash con **bcrypt** (`passwordSecurity.ts`).
- La API **no** devuelve contraseñas en ninguna respuesta (p. ej. `create-user`).
- Login con varios roles: primero se valida la contraseña; luego se expone la necesidad de elegir rol.
